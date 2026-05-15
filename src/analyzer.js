'use strict';

const { buildViolationPrompt } = require('./prompts');

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'gemma4:latest';
const BATCH_SIZE = 3;

const IMPACT_TO_PRIORITY = {
  critical: 'P0 - Fix immediately',
  serious: 'P1 - Fix this sprint',
  moderate: 'P2 - Fix soon',
  minor: 'P3 - Fix when possible',
};

async function analyze(scanResult, onProgress) {
  const { violations } = scanResult;

  if (violations.length === 0) {
    return { ...scanResult, violations: [] };
  }

  const enriched = [];

  for (let i = 0; i < violations.length; i += BATCH_SIZE) {
    const batch = violations.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((v, idx) => {
        if (onProgress) onProgress(i + idx + 1, violations.length, v.id);
        return enrichViolation(v);
      })
    );
    enriched.push(...results);
  }

  return { ...scanResult, violations: enriched };
}

async function enrichViolation(violation) {
  try {
    const prompt = buildViolationPrompt(violation);
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    const parsed = parseGemmaResponse(data.response);

    return { ...violation, ...parsed, aiEnriched: true };
  } catch (err) {
    return {
      ...violation,
      summary: violation.help,
      affectedUsers: 'Users relying on assistive technologies',
      whyItMatters: `Violates WCAG ${violation.wcagCriteria.join(', ')}. See: ${violation.helpUrl}`,
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
