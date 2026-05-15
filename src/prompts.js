'use strict';

function buildExplanationPrompt(violation) {
  const wcag = violation.wcagCriteria.length > 0 ? violation.wcagCriteria.join(', ') : 'best-practice';

  return `You are an accessibility expert. Output ONLY a JSON object. Start with { and end with }. No preamble, no markdown.

Violation: ${violation.id} (${violation.impact})
Description: ${violation.description}
WCAG: ${wcag}
Affected elements: ${violation.nodeCount}

Return this JSON (string values only, no nested objects, no code):
{
  "summary": "1-2 sentence plain-language description of the problem",
  "affectedUsers": "specific groups impacted e.g. screen reader users, keyboard-only users",
  "whyItMatters": "why this matters practically and legally, referencing the WCAG criterion",
  "howToFix": "step-by-step plain English instructions to fix this",
  "priority": "one of: P0 - Fix immediately, P1 - Fix this sprint, P2 - Fix soon, P3 - Fix when possible"
}`;
}

function buildCodeFixPrompt(violation) {
  const exampleNode = violation.nodes[0];
  const nodeHtml = exampleNode ? exampleNode.html.slice(0, 400) : 'N/A';

  return `You are an accessibility expert. Show a before/after code fix for this violation.

Violation: ${violation.id}
Affected HTML: ${nodeHtml}

Reply in this exact format (no JSON, no markdown, just these two labeled blocks):
BEFORE:
<paste the problematic code here>
AFTER:
<paste the corrected code here with a short inline comment>`;
}

module.exports = { buildExplanationPrompt, buildCodeFixPrompt };
