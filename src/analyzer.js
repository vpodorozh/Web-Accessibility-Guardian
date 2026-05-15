'use strict';

const { buildViolationPrompt } = require('./prompts');
const ollamaAdapter = require('./adapters/ollama');
const googleAiAdapter = require('./adapters/google-ai');

const BATCH_SIZE = 3;

const IMPACT_TO_PRIORITY = {
  critical: 'P0 - Fix immediately',
  serious: 'P1 - Fix this sprint',
  moderate: 'P2 - Fix soon',
  minor: 'P3 - Fix when possible',
};

function resolveConfig(overrides = {}) {
  const backend = overrides.backend || process.env.GEMMA_BACKEND || 'ollama';
  return {
    backend,
    url: overrides.url || process.env.OLLAMA_URL || 'http://localhost:11434/api/generate',
    model: overrides.model || process.env.OLLAMA_MODEL || (backend === 'google-ai' ? 'gemma-3-27b-it' : 'gemma4:latest'),
    apiKey: overrides.apiKey || process.env.GEMMA_API_KEY || process.env.OLLAMA_API_KEY || null,
  };
}

function getAdapter(backend) {
  if (backend === 'google-ai') return googleAiAdapter;
  return ollamaAdapter;
}

async function analyze(scanResult, onProgress, configOverrides = {}) {
  const { violations } = scanResult;
  const config = resolveConfig(configOverrides);

  if (violations.length === 0) {
    return { ...scanResult, violations: [] };
  }

  const enriched = [];

  for (let i = 0; i < violations.length; i += BATCH_SIZE) {
    const batch = violations.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((v, idx) => {
        if (onProgress) onProgress(i + idx + 1, violations.length, v.id);
        return enrichViolation(v, config);
      })
    );
    enriched.push(...results);
  }

  return { ...scanResult, violations: enriched };
}

async function enrichViolation(violation, config) {
  try {
    const prompt = buildViolationPrompt(violation);
    const adapter = getAdapter(config.backend);
    const text = await adapter.generate(prompt, config);
    const parsed = parseGemmaResponse(text);
    return { ...violation, ...parsed, aiEnriched: true, aiBackend: config.backend };
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
}

function parseGemmaResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    summary: String(parsed.summary || ''),
    affectedUsers: String(parsed.affectedUsers || ''),
    whyItMatters: String(parsed.whyItMatters || ''),
    howToFix: String(parsed.howToFix || ''),
    codeExample: {
      before: String(parsed.codeExample?.before || ''),
      after: String(parsed.codeExample?.after || ''),
    },
    priority: String(parsed.priority || IMPACT_TO_PRIORITY.moderate),
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

module.exports = { analyze, fallbackEnrich };
