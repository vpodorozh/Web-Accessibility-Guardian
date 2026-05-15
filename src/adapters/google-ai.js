'use strict';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

async function generate(prompt, config) {
  if (!config.apiKey) throw new Error('Google AI requires an API key (--api-key or GEMMA_API_KEY env var)');

  const model = config.model || 'gemma-3-27b-it';
  const url = `${BASE_URL}/${model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google AI HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Google AI');
  return text;
}

module.exports = { generate };
