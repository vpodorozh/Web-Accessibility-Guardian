'use strict';

const { buildLogicalSummaryPrompt, buildPersonaSummaryPrompt } = require('./prompts');
const { resolveConfig } = require('./analyzer');
const ollamaAdapter = require('./adapters/ollama');
const googleAiAdapter = require('./adapters/google-ai');
const openrouterAdapter = require('./adapters/openrouter');

const RETRY_DELAY_MS = 15000;
const RATE_LIMIT_DELAY_MS = 60000;

function getAdapter(backend) {
  if (backend === 'google-ai') return googleAiAdapter;
  if (backend === 'openrouter') return openrouterAdapter;
  return ollamaAdapter;
}

function extractJson(text) {
  // Strip <think>...</think> block if present (chain-of-thought reasoning)
  const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown fences
  const stripped = withoutThink.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON found. Got: ${text.slice(0, 300)}`);
  return JSON.parse(match[0]);
}

async function withRetry(fn, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const isRateLimit = err.message.includes('429');
      const delay = isRateLimit
        ? RATE_LIMIT_DELAY_MS * (attempt + 1)
        : RETRY_DELAY_MS * (attempt + 1);
      process.stderr.write(`   ↻ summary retry in ${delay / 1000}s (${err.message.slice(0, 80)})\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function summarize(scanResult, configOverrides = {}) {
  const { violations, url } = scanResult;

  if (!violations || violations.length === 0) {
    return null;
  }

  const config = resolveConfig(configOverrides);
  const adapter = getAdapter(config.backend);

  // Use summaryModel (MoE, advanced reasoning) instead of the per-violation analysis model
  const summaryConfig = { ...config, model: config.summaryModel };

  const [logical, persona] = await Promise.allSettled([
    withRetry(() => adapter.generate(buildLogicalSummaryPrompt(url, violations), summaryConfig))
      .then(text => extractJson(text)),
    withRetry(() => adapter.generate(buildPersonaSummaryPrompt(url, violations), summaryConfig))
      .then(text => extractJson(text)),
  ]);

  return {
    logical: logical.status === 'fulfilled' ? logical.value : { error: logical.reason?.message },
    persona: persona.status === 'fulfilled' ? persona.value : { error: persona.reason?.message },
  };
}

module.exports = { summarize };
