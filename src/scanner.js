'use strict';

const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');

async function scan(url) {
  let browser;

  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (compatible; AccessibilityGuardian/1.0; +https://github.com/accessibility-guardian)',
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();

    return {
      url,
      scannedAt: new Date().toISOString(),
      violations: axeResults.violations.map(normalizeViolation),
      violationCount: axeResults.violations.length,
      passCount: axeResults.passes.length,
      incompleteCount: axeResults.incomplete.length,
      inapplicableCount: axeResults.inapplicable.length,
    };
  } finally {
    if (browser) await browser.close();
  }
}

function normalizeViolation(violation) {
  return {
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    wcagCriteria: extractWcagCriteria(violation.tags),
    nodes: violation.nodes.slice(0, 3).map((node) => ({
      html: node.html,
      target: node.target,
      failureSummary: node.failureSummary,
    })),
    nodeCount: violation.nodes.length,
  };
}

function extractWcagCriteria(tags) {
  return tags
    .filter((t) => /^wcag\d+/.test(t))
    .map((t) => t.replace('wcag', '').replace(/(\d)(\d{2})$/, '$1.$2'))
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

module.exports = { scan };
