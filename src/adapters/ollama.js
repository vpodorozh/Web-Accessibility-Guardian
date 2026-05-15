'use strict';

async function generate(prompt, config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 1024 },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} from ${config.url}`);

  const data = await response.json();
  return data.response;
}

module.exports = { generate };
