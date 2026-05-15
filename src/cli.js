#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { scan } = require('./scanner');
const { analyze, fallbackEnrich } = require('./analyzer');
const { reportCLI, reportHTML, reportJSON, writeReport } = require('./reporter');

const args = parseArgs(process.argv.slice(2));

if (!args.url) {
  console.error('Usage: node src/cli.js --url <url> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --format cli|html|json    Output format (default: cli)');
  console.error('  --output <path>           Write report to file');
  console.error('  --no-ai                   Skip AI analysis, show raw axe-core output');
  console.error('  --backend ollama|google-ai Backend to use (default: ollama, env: GEMMA_BACKEND)');
  console.error('  --model <name>            Model name (env: OLLAMA_MODEL)');
  console.error('  --ollama-url <url>        Ollama endpoint (env: OLLAMA_URL)');
  console.error('  --api-key <key>           API key for remote/Google AI endpoints (env: GEMMA_API_KEY)');
  console.error('');
  console.error('Examples:');
  console.error('  node src/cli.js --url https://example.com');
  console.error('  node src/cli.js --url https://example.com --format html --output report.html');
  console.error('  node src/cli.js --url https://example.com --backend google-ai --api-key AIza...');
  process.exit(1);
}

const format = args.format || 'cli';
const noAI = args['no-ai'] === true;
const aiConfig = {
  backend: args.backend,
  url: args['ollama-url'],
  model: args.model,
  apiKey: args['api-key'],
};

(async () => {
  try {
    console.log(`\n♿ Accessibility Guardian`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    process.stdout.write(`🔍 Scanning ${args.url} ...\n`);
    const scanResult = await scan(args.url);
    process.stdout.write(`✅ Found ${scanResult.violationCount} violation(s), ${scanResult.passCount} passed\n`);

    let result = fallbackEnrich(scanResult);

    if (!noAI && scanResult.violationCount > 0) {
      const backend = aiConfig.backend || process.env.GEMMA_BACKEND || 'ollama';
      const model = aiConfig.model || process.env.OLLAMA_MODEL || (backend === 'google-ai' ? 'gemma-4-26b-a4b-it' : 'gemma4:latest');
      process.stdout.write(`\n🤖 Analyzing with ${model} [${backend}] (${scanResult.violationCount} violations)...\n`);
      result = await analyze(scanResult, (current, total, id) => {
        process.stdout.write(`   [${current}/${total}] ${id}\n`);
      }, aiConfig);

      const enriched = result.violations.filter(v => v.aiEnriched).length;
      const failed = result.violations.filter(v => !v.aiEnriched);

      if (failed.length === 0) {
        process.stdout.write(`✅ AI analysis complete (${enriched}/${result.violationCount} enriched)\n`);
      } else {
        process.stdout.write(`⚠️  AI analysis partial: ${enriched}/${result.violationCount} enriched, ${failed.length} failed\n`);
        failed.forEach(v => process.stderr.write(`   ✗ [${v.id}]: ${v.aiError || 'unknown error'}\n`));
        if (enriched === 0) {
          process.stderr.write(`\n❌ AI analysis failed for all violations. Check your API key and backend configuration.\n`);
          process.exitCode = 1;
        }
      }
    }

    if (format === 'json') {
      const json = reportJSON(result);
      if (args.output) {
        fs.writeFileSync(args.output, json, 'utf8');
        console.log(`\n📄 JSON report saved to: ${args.output}`);
      } else {
        console.log(json);
      }
    } else if (format === 'html') {
      const outputPath = args.output || path.join('reports', `report-${Date.now()}.html`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      writeReport(result, outputPath);
      console.log(`\n📄 HTML report saved to: ${outputPath}`);
      console.log(`   Open with: open ${outputPath}`);
    } else {
      console.log(reportCLI(result));
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.message.includes('Executable doesn')) {
      console.error('   Run: npx playwright install chromium');
    } else if (err.message.includes('localhost:11434') || err.message.includes('ECONNREFUSED')) {
      console.error('   Ollama not running. Start it with: ollama serve');
      console.error('   Or point to a remote endpoint with --ollama-url');
    }
    process.exit(1);
  }
})();

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        result[key] = true;
      } else {
        result[key] = next;
        i++;
      }
    }
  }
  return result;
}
