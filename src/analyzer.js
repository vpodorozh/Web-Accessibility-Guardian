'use strict';

const { buildExplanationPrompt, buildCodeFixPrompt } = require('./prompts');
const ollamaAdapter = require('./adapters/ollama');
const googleAiAdapter = require('./adapters/google-ai');
const openrouterAdapter = require('./adapters/openrouter');

const RETRY_DELAY_MS = 15000;
const RATE_LIMIT_DELAY_MS = 60000;  // 429: wait 60s before retrying
const INTER_VIOLATION_DELAY_MS = 8000;  // pause between sequential calls to avoid rate limits

const IMPACT_TO_PRIORITY = {
  critical: 'P0 - Fix immediately',
  serious: 'P1 - Fix this sprint',
  moderate: 'P2 - Fix soon',
  minor: 'P3 - Fix when possible',
};

// Per-violation analysis: 31B dense — reliable structured output across many sequential calls
// Summarization: 26B MoE — "advanced reasoning, high-throughput" per Gemma 4 spec; called only
// twice but needs deep chain-of-thought for the logical audit and persona narrative.
// Note: OpenRouter only carries the 31B dense for Gemma 4 (MoE unavailable there), so both
// tasks share the same model on that backend. Ollama has both; use them correctly.
const DEFAULT_MODEL = {
  'google-ai': 'gemma-4-31b-it',             // dense 31B — available on AI Studio
  'openrouter': 'google/gemma-4-31b-it:free', // dense — only Gemma 4 option on OpenRouter
  'ollama': 'gemma4:31b',                     // dense 31B local (NOT :latest which is 4B)
};

const DEFAULT_SUMMARY_MODEL = {
  'google-ai': 'gemma-4-26b-a4b-it',         // MoE — advanced reasoning, available on AI Studio
  'openrouter': 'google/gemma-4-31b-it:free', // MoE unavailable on OpenRouter, reuse dense
  'ollama': 'gemma4:26b',                     // MoE local — 25.2B total / 3.8B active, 256K ctx
};

function resolveConfig(overrides = {}) {
  const backend = overrides.backend || process.env.GEMMA_BACKEND || 'ollama';
  return {
    backend,
    url: overrides.url || process.env.OLLAMA_URL || 'http://localhost:11434/api/generate',
    model: overrides.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL[backend] || 'gemma4:latest',
    summaryModel: overrides.summaryModel || process.env.SUMMARY_MODEL || DEFAULT_SUMMARY_MODEL[backend] || DEFAULT_MODEL[backend] || 'gemma4:latest',
    apiKey: overrides.apiKey || process.env.OPENROUTER_API_KEY || process.env.GEMMA_API_KEY || process.env.OLLAMA_API_KEY || null,
  };
}

function getAdapter(backend) {
  if (backend === 'google-ai') return googleAiAdapter;
  if (backend === 'openrouter') return openrouterAdapter;
  return ollamaAdapter;
}

async function analyze(scanResult, onProgress, configOverrides = {}) {
  const { violations } = scanResult;
  const config = resolveConfig(configOverrides);

  if (violations.length === 0) {
    return { ...scanResult, violations: [] };
  }

  const enriched = [];

  for (let i = 0; i < violations.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, INTER_VIOLATION_DELAY_MS));
    if (onProgress) onProgress(i + 1, violations.length, violations[i].id);
    enriched.push(await enrichViolation(violations[i], config));
  }

  return { ...scanResult, violations: enriched };
}

async function enrichViolation(violation, config) {
  const adapter = getAdapter(config.backend);

  // Call 1: text explanation (clean JSON, no code)
  let explanation;
  try {
    const text = await withRetry(() => adapter.generate(buildExplanationPrompt(violation), config));
    explanation = parseExplanation(text);
  } catch (err) {
    return {
      ...violation,
      summary: violation.help,
      affectedUsers: 'Users relying on assistive technologies',
      whyItMatters: violation.wcagCriteria.length
        ? `Violates WCAG ${violation.wcagCriteria.join(', ')}. See: ${violation.helpUrl}`
        : `Best practice violation. See: ${violation.helpUrl}`,
      howToFix: violation.description,
      codeExample: { before: violation.nodes[0]?.html || '', after: '' },
      priority: IMPACT_TO_PRIORITY[violation.impact] || 'P2 - Fix soon',
      aiEnriched: false,
      aiError: err.message,
    };
  }

  // Call 2: code fix (plain text, no JSON) — optional, degrades gracefully
  let codeExample = { before: violation.nodes[0]?.html || '', after: '' };
  try {
    const text = await withRetry(() => adapter.generate(buildCodeFixPrompt(violation), config));
    codeExample = parseCodeFix(text);
  } catch {
    // non-fatal: keep raw HTML as before, leave after empty
  }

  return { ...violation, ...explanation, codeExample, aiEnriched: true, aiBackend: config.backend };
}

function parseExplanation(text) {
  // Strip chain-of-thought reasoning block before parsing JSON
  const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const stripped = withoutThink.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in explanation. Got: ${text.slice(0, 200)}`);

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Explanation JSON parse failed: ${e.message}. Input: ${jsonMatch[0].slice(0, 200)}`);
  }

  return {
    summary: String(parsed.summary || ''),
    affectedUsers: String(parsed.affectedUsers || ''),
    userExperience: String(parsed.userExperience || ''),
    whyItMatters: String(parsed.whyItMatters || ''),
    howToFix: String(parsed.howToFix || ''),
    priority: String(parsed.priority || IMPACT_TO_PRIORITY.moderate),
  };
}

function parseCodeFix(text) {
  // Expect: "BEFORE:\n<code>\nAFTER:\n<code>"
  const beforeMatch = text.match(/BEFORE:\s*\n([\s\S]*?)(?=AFTER:|$)/i);
  const afterMatch = text.match(/AFTER:\s*\n([\s\S]*)/i);

  const strip = (s) => s ? s.trim().replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim() : '';

  return {
    before: strip(beforeMatch?.[1] || ''),
    after: strip(afterMatch?.[1] || ''),
  };
}

function fallbackEnrich(scanResult) {
  return {
    ...scanResult,
    violations: scanResult.violations.map((v) => ({
      ...v,
      summary: v.help,
      affectedUsers: 'Users relying on assistive technologies',
      whyItMatters: v.wcagCriteria.length
        ? `Violates WCAG ${v.wcagCriteria.join(', ')}. See: ${v.helpUrl}`
        : `Best practice violation. See: ${v.helpUrl}`,
      howToFix: v.description,
      codeExample: { before: v.nodes[0]?.html || '', after: '' },
      priority: IMPACT_TO_PRIORITY[v.impact] || 'P2 - Fix soon',
      aiEnriched: false,
    })),
  };
}

async function withRetry(fn, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const is429 = err.message.includes('429');
      const is5xx = /HTTP 5\d\d/.test(err.message);
      const delay = is429
        ? RATE_LIMIT_DELAY_MS * (attempt + 1)
        : is5xx
          ? RATE_LIMIT_DELAY_MS * (attempt + 1)  // server errors need same long back-off
          : RETRY_DELAY_MS * (attempt + 1);
      process.stderr.write(`   ↻ retrying in ${delay / 1000}s (${err.message.slice(0, 80)})\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = { analyze, fallbackEnrich, resolveConfig };
