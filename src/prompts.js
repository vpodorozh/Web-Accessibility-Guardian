'use strict';

function buildExplanationPrompt(violation) {
  const wcag = violation.wcagCriteria.length > 0 ? violation.wcagCriteria.join(', ') : 'best-practice';
  const nodeHtml = violation.nodes[0]?.html?.slice(0, 300) || 'N/A';

  return `You are an accessibility expert and disability advocate.

Think step by step inside a <think>...</think> block before writing your JSON answer:
1. Identify exactly which disability groups are blocked by this specific violation and why.
2. Put yourself in the shoes of one of those users. Pick the most affected. Imagine their assistive technology, their habits, their goal on this page. What do they literally experience — what do they hear, what happens when they press Tab, what do they see or not see? Where do they get stuck or give up?
3. Assess legal and practical risk.
4. Draft all fields.

After </think>, output ONLY a JSON object. Start with { and end with }. No preamble, no markdown.

Violation: ${violation.id} (${violation.impact})
Description: ${violation.description}
WCAG: ${wcag}
Affected elements: ${violation.nodeCount}
Example HTML: ${nodeHtml}

Return this JSON (string values only, no nested objects, no code):
{
  "summary": "1-2 sentence plain-language description of the problem",
  "affectedUsers": "specific disability groups and assistive technologies impacted, and what breaks for each",
  "userExperience": "2-3 sentences written as if you are that disabled user in the moment: what you try to do, what you encounter instead, how it stops or confuses you. Use 'I' voice. Be concrete and specific to this violation — not generic.",
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


function buildViolationContext(violations) {
  return violations
    .map((v, i) => {
      const wcag = v.wcagCriteria && v.wcagCriteria.length ? `WCAG ${v.wcagCriteria.join(', ')}` : 'best-practice';
      const summary = v.summary || v.help || v.id;
      return `${i + 1}. [${(v.impact || 'unknown').toUpperCase()}] ${v.id}: ${summary} — ${v.nodeCount} element(s) affected (${wcag})`;
    })
    .join('\n');
}

function buildLogicalSummaryPrompt(url, violations) {
  const context = buildViolationContext(violations);
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  violations.forEach(v => { if (counts[v.impact] !== undefined) counts[v.impact]++; });

  return `You are a senior accessibility auditor writing a triage report for a development team.

Think step by step inside a <think>...</think> block before writing your final JSON answer.

Website: ${url}
Violations found (${violations.length} total — ${counts.critical} critical, ${counts.serious} serious, ${counts.moderate} moderate, ${counts.minor} minor):
${context}

In your <think> block:
1. Identify which functional areas of the site are affected (navigation, forms, images, media, interactive controls, etc.)
2. Determine which areas carry the highest combined risk (severity × element count × legal exposure)
3. Decide the optimal fix order to unblock the most users with the least effort
4. Formulate a one-sentence headline that captures the most critical finding

After </think>, output ONLY a JSON object with no preamble:
{
  "headline": "one sentence: the single most critical finding on this site",
  "areas": [
    { "area": "short area name", "issueCount": N, "topImpact": "critical|serious|moderate|minor", "note": "what exactly breaks here" }
  ],
  "priorityOrder": ["area with highest urgency first", "..."],
  "verdict": "2-3 strict sentences: overall risk level and which cluster to fix first, referencing specific violation IDs or areas. No fix instructions."
}`;
}

function buildPersonaSummaryPrompt(url, violations) {
  const context = buildViolationContext(violations);

  return `You are about to role-play as a real disabled person visiting a website. This is not a technical exercise — it is a human one.

Think step by step inside a <think>...</think> block before writing your final JSON answer.

Website: ${url}
Accessibility violations found:
${context}

In your <think> block:
1. Look at the types of violations present. Which single disability group faces the most cumulative barriers? (e.g. blind screen-reader users, keyboard-only motor-impaired users, users with cognitive disabilities, low-vision users, deaf/hard-of-hearing users). Choose the one most affected.
2. Pick a specific, realistic assistive technology and setup for that person (e.g. "NVDA 2024 on Windows 11 with Firefox", "Switch Access on Android", "ZoomText 10x on Windows").
3. Invent a concrete, realistic task this person is trying to accomplish on this site (e.g. "submit a contact form", "find opening hours", "read an article", "complete a purchase").
4. Walk through their attempt step by step, noting exactly where each violation stops them or forces them to work around it. Be specific — reference the violation IDs or descriptions. Make it feel real, not clinical.
5. Identify the moment of highest frustration or the point where they give up.

After </think>, output ONLY a JSON object with no preamble:
{
  "disability": "specific disability and assistive technology setup",
  "task": "the concrete task this person is trying to complete",
  "experience": "4-6 sentences written in the first person, present tense, as this person. Name the specific barriers they hit. Use 'I' voice. Be honest about frustration. Do not include fix suggestions.",
  "breakingPoint": "1 sentence: the exact moment they are blocked entirely or give up",
  "impact": "1 sentence: the real-world consequence of this failure for this person's independence or dignity"
}`;
}

module.exports = { buildExplanationPrompt, buildCodeFixPrompt, buildLogicalSummaryPrompt, buildPersonaSummaryPrompt };
