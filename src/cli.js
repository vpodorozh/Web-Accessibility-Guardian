#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { scan } = require('./scanner');
const { analyze, fallbackEnrich } = require('./analyzer');
const { reportCLI, reportHTML, reportJSON, writeReport } = require('./reporter');

const args = parseArgs(process.argv.slice(2));

if (!args.url) {
  console.error('Usage: node src/cli.js --url <url> [--format cli|html|json] [--output <path>] [--no-ai]');
  console.error('Example: node src/cli.js --url https://example.com --format html --output report.html');
  process.exit(1);
}

const format = args.format || 'cli';
const noAI = args['no-ai'] === true;

(async () => {
  try {
    console.log(`\n♿ Accessibility Guardian`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    process.stdout.write(`🔍 Scanning ${args.url} ...\n`);
    const scanResult = await scan(args.url);
    process.stdout.write(`✅ Found ${scanResult.violationCount} violation(s), ${scanResult.passCount} passed\n`);

    let result = fallbackEnrich(scanResult);

    if (!noAI && scanResult.violationCount > 0) {
      process.stdout.write(`\n🤖 Analyzing with Gemma4 (${scanResult.violationCount} violations)...\n`);
      result = await analyze(scanResult, (current, total, id) => {
        process.stdout.write(`   [${current}/${total}] ${id}\n`);
      });
      process.stdout.write(`✅ Analysis complete\n`);
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
    } else if (err.message.includes('localhost:11434')) {
      console.error('   Ollama not running. Start it with: ollama serve');
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
