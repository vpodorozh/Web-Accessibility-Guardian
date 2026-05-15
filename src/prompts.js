'use strict';

function buildViolationPrompt(violation) {
  const exampleNode = violation.nodes[0];
  const nodeHtml = exampleNode ? exampleNode.html.slice(0, 300) : 'N/A';
  const wcag = violation.wcagCriteria.length > 0 ? violation.wcagCriteria.join(', ') : 'best-practice';

  return `You are an accessibility expert helping developers fix WCAG violations.

Analyze this accessibility violation and respond with ONLY a valid JSON object (no markdown, no explanation outside the JSON):

Violation ID: ${violation.id}
Impact: ${violation.impact}
Description: ${violation.description}
WCAG Criteria: ${wcag}
Example affected HTML: ${nodeHtml}
Number of affected elements: ${violation.nodeCount}

Respond with this exact JSON structure:
{
  "summary": "1-2 sentence plain-language description of what the problem is",
  "affectedUsers": "Specific groups of people impacted (e.g., screen reader users, keyboard-only users, people with low vision)",
  "whyItMatters": "Why this matters legally and practically, referencing the WCAG criterion",
  "howToFix": "Step-by-step plain English instructions to fix this issue",
  "codeExample": {
    "before": "the problematic code snippet",
    "after": "the corrected code snippet with a brief comment explaining the fix"
  },
  "priority": "one of: P0 - Fix immediately, P1 - Fix this sprint, P2 - Fix soon, P3 - Fix when possible"
}`;
}

module.exports = { buildViolationPrompt };
