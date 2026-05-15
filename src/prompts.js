'use strict';

function buildViolationPrompt(violation) {
  const exampleNode = violation.nodes[0];
  const nodeHtml = exampleNode ? exampleNode.html.slice(0, 300) : 'N/A';
  const wcag = violation.wcagCriteria.length > 0 ? violation.wcagCriteria.join(', ') : 'best-practice';

  return `You are an accessibility expert. Output ONLY a JSON object. No preamble, no explanation, no markdown fences. Start your response with { and end with }.

Input:
- id: ${violation.id}
- impact: ${violation.impact}
- description: ${violation.description}
- wcag: ${wcag}
- html: ${nodeHtml}
- affected elements: ${violation.nodeCount}

Required JSON:
{
  "summary": "1-2 sentence plain-language description of the problem",
  "affectedUsers": "specific groups impacted, e.g. screen reader users, keyboard-only users, people with low vision",
  "whyItMatters": "why this matters practically and legally, referencing the WCAG criterion",
  "howToFix": "step-by-step plain English instructions to fix this",
  "codeExample": {
    "before": "the problematic code",
    "after": "the corrected code with a comment explaining the fix"
  },
  "priority": "one of: P0 - Fix immediately, P1 - Fix this sprint, P2 - Fix soon, P3 - Fix when possible"
}`;
}

module.exports = { buildViolationPrompt };
