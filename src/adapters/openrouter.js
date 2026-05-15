'use strict';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function generate(prompt, config) {
  if (!config.apiKey) throw new Error('OpenRouter requires an API key (--api-key or OPENROUTER_API_KEY env var)');

  const model = config.model || 'google/gemma-4-31b-it:free';

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://github.com/accessibility-guardian',
      'X-Title': 'Accessibility Guardian',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from OpenRouter');
  return text;
}

module.exports = { generate };
