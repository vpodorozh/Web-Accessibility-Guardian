'use strict';

const fs = require('fs');
const path = require('path');

const IMPACT_COLORS = {
  critical: '\x1b[41m\x1b[37m',
  serious: '\x1b[43m\x1b[30m',
  moderate: '\x1b[33m',
  minor: '\x1b[34m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

function reportCLI(result) {
  const lines = [];

  lines.push('');
  lines.push(`${BOLD}╔══════════════════════════════════════════════════════╗${RESET}`);
  lines.push(`${BOLD}║        ♿  ACCESSIBILITY GUARDIAN  REPORT             ║${RESET}`);
  lines.push(`${BOLD}╚══════════════════════════════════════════════════════╝${RESET}`);
  lines.push('');
  lines.push(`${BOLD}URL:${RESET}        ${CYAN}${result.url}${RESET}`);
  lines.push(`${BOLD}Scanned:${RESET}    ${result.scannedAt}`);
  lines.push(`${BOLD}Violations:${RESET} ${result.violationCount === 0 ? GREEN + '0 — Congratulations!' + RESET : '\x1b[31m' + result.violationCount + RESET}`);
  lines.push(`${BOLD}Passed:${RESET}     ${GREEN}${result.passCount}${RESET}  ${DIM}Incomplete: ${result.incompleteCount}${RESET}`);
  lines.push('');

  if (result.violationCount === 0) {
    lines.push(`${GREEN}${BOLD}✓ No accessibility violations found! Great work.${RESET}`);
    lines.push('');
    return lines.join('\n');
  }

  const byImpact = groupByImpact(result.violations);
  const order = ['critical', 'serious', 'moderate', 'minor'];

  for (const impact of order) {
    const group = byImpact[impact];
    if (!group || group.length === 0) continue;

    const color = IMPACT_COLORS[impact] || '';
    lines.push(`${color}${BOLD} ${impact.toUpperCase()} (${group.length}) ${RESET}`);
    lines.push('─'.repeat(56));

    for (const v of group) {
      lines.push('');
      lines.push(`${BOLD}[${v.id}]${RESET} ${v.summary || v.help}`);
      const wcag = v.wcagCriteria.length ? `WCAG: ${v.wcagCriteria.join(', ')} · ` : '';
      lines.push(`${DIM}${wcag}Affects ${v.nodeCount} element(s)${RESET}`);
      lines.push('');
      if (v.affectedUsers) lines.push(`${BOLD}👥 Who is affected:${RESET} ${v.affectedUsers}`);
      if (v.whyItMatters) lines.push(`${BOLD}⚠️  Why it matters:${RESET}  ${v.whyItMatters}`);
      if (v.howToFix) {
        lines.push(`${BOLD}🔧 How to fix:${RESET}`);
        lines.push(`   ${v.howToFix.replace(/\n/g, '\n   ')}`);
      }
      if (v.codeExample?.before || v.codeExample?.after) {
        lines.push(`${BOLD}💻 Code example:${RESET}`);
        if (v.codeExample.before) lines.push(`   ${DIM}Before:${RESET} ${v.codeExample.before}`);
        if (v.codeExample.after) lines.push(`   ${GREEN}After:${RESET}  ${v.codeExample.after}`);
      }
      lines.push(`${BOLD}Priority:${RESET} ${v.priority}`);
      if (!v.aiEnriched) lines.push(`${DIM}(AI analysis unavailable — showing raw axe-core data)${RESET}`);
      lines.push('');
      lines.push('·'.repeat(56));
    }
    lines.push('');
  }

  return lines.join('\n');
}

function reportHTML(result) {
  const violations = result.violations;
  const byImpact = groupByImpact(violations);

  const criticalCount = (byImpact.critical || []).length;
  const seriousCount = (byImpact.serious || []).length;
  const moderateCount = (byImpact.moderate || []).length;
  const minorCount = (byImpact.minor || []).length;

  const violationCards = violations
    .sort((a, b) => impactOrder(a.impact) - impactOrder(b.impact))
    .map(renderViolationCard)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Accessibility Guardian Report — ${escapeHtml(result.url)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem 1rem; color: #1a1a1a; background: #f8f9fa; }
  h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
  .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
  .meta a { color: #4a90e2; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat { background: white; border-radius: 8px; padding: 1rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .stat-number { font-size: 2rem; font-weight: 700; line-height: 1; }
  .stat-label { font-size: 0.8rem; color: #666; margin-top: 0.25rem; text-transform: uppercase; letter-spacing: .05em; }
  .critical .stat-number { color: #dc2626; }
  .serious .stat-number { color: #ea580c; }
  .moderate .stat-number { color: #ca8a04; }
  .minor .stat-number { color: #2563eb; }
  .passed .stat-number { color: #16a34a; }
  .card { background: white; border-radius: 8px; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow: hidden; }
  .card-header { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; cursor: pointer; user-select: none; }
  .card-header:hover { background: #f9f9f9; }
  .badge { display: inline-block; padding: 0.2em 0.6em; border-radius: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
  .badge-critical { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
  .badge-serious { background: #fff7ed; color: #ea580c; border: 1px solid #fdba74; }
  .badge-moderate { background: #fefce8; color: #ca8a04; border: 1px solid #fde047; }
  .badge-minor { background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; }
  .card-title { font-weight: 600; flex: 1; }
  .card-id { font-family: monospace; font-size: 0.8rem; color: #666; }
  .card-body { padding: 0 1.25rem 1.25rem; border-top: 1px solid #f0f0f0; }
  .section { margin-top: 1rem; }
  .section-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #666; margin-bottom: 0.35rem; }
  .section-content { font-size: 0.9rem; line-height: 1.6; }
  .code-block { background: #1e1e1e; color: #d4d4d4; border-radius: 6px; padding: 0.75rem 1rem; font-family: 'Courier New', monospace; font-size: 0.8rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  .code-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 0.25rem; }
  .code-before .code-label { color: #f87171; }
  .code-after .code-label { color: #4ade80; }
  .code-before .code-block { border-left: 3px solid #f87171; }
  .code-after .code-block { border-left: 3px solid #4ade80; }
  .priority { display: inline-block; margin-top: 0.75rem; padding: 0.3em 0.75em; border-radius: 999px; font-size: 0.8rem; font-weight: 600; background: #f0f0f0; }
  .wcag-link { font-size: 0.8rem; color: #4a90e2; text-decoration: none; }
  .wcag-link:hover { text-decoration: underline; }
  .ai-badge { display: inline-block; font-size: 0.7rem; padding: 0.15em 0.5em; border-radius: 4px; background: #f0fdf4; color: #15803d; border: 1px solid #86efac; margin-left: 0.5rem; }
  .congrats { background: #f0fdf4; border: 2px solid #4ade80; border-radius: 8px; padding: 2rem; text-align: center; color: #166534; }
  .toggle-icon { transition: transform 0.2s; }
  .card.open .toggle-icon { transform: rotate(180deg); }
  details summary { list-style: none; }
  details summary::-webkit-details-marker { display: none; }
  footer { margin-top: 3rem; text-align: center; font-size: 0.8rem; color: #999; }
</style>
</head>
<body>
<h1>♿ Accessibility Guardian Report</h1>
<p class="meta">
  URL: <a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">${escapeHtml(result.url)}</a><br>
  Scanned: ${escapeHtml(result.scannedAt)} · Powered by Playwright + axe-core + Gemma4
</p>

<div class="stats">
  <div class="stat critical"><div class="stat-number">${criticalCount}</div><div class="stat-label">Critical</div></div>
  <div class="stat serious"><div class="stat-number">${seriousCount}</div><div class="stat-label">Serious</div></div>
  <div class="stat moderate"><div class="stat-number">${moderateCount}</div><div class="stat-label">Moderate</div></div>
  <div class="stat minor"><div class="stat-number">${minorCount}</div><div class="stat-label">Minor</div></div>
  <div class="stat passed"><div class="stat-number">${result.passCount}</div><div class="stat-label">Passed</div></div>
</div>

${
  result.violationCount === 0
    ? '<div class="congrats"><h2>🎉 No violations found!</h2><p>This page passes all WCAG 2.1 AA checks. Keep up the great work.</p></div>'
    : violationCards
}

<footer>
  Generated by <strong>Accessibility Guardian</strong> · axe-core + Gemma4 via Ollama ·
  <a href="https://github.com/accessibility-guardian" target="_blank" rel="noopener">GitHub</a>
</footer>

<script>
document.querySelectorAll('.card-header').forEach(h => {
  h.addEventListener('click', () => {
    h.closest('.card').classList.toggle('open');
    const body = h.nextElementSibling;
    body.hidden = !body.hidden;
  });
});
</script>
</body>
</html>`;
}

function renderViolationCard(v) {
  const aiTag = v.aiEnriched ? '<span class="ai-badge">✨ Gemma4</span>' : '';
  const beforeCode = v.codeExample?.before
    ? `<div class="code-before"><div class="code-label">Before</div><div class="code-block">${escapeHtml(v.codeExample.before)}</div></div>`
    : '';
  const afterCode = v.codeExample?.after
    ? `<div class="code-after" style="margin-top:0.5rem"><div class="code-label">After</div><div class="code-block">${escapeHtml(v.codeExample.after)}</div></div>`
    : '';

  return `<div class="card open">
  <div class="card-header">
    <span class="badge badge-${v.impact}">${v.impact}</span>
    <span class="card-title">${escapeHtml(v.summary || v.help)}${aiTag}</span>
    <span class="card-id">${escapeHtml(v.id)}</span>
    <span class="toggle-icon">▾</span>
  </div>
  <div class="card-body">
    <div class="section">
      <div class="section-label">👥 Who is affected</div>
      <div class="section-content">${escapeHtml(v.affectedUsers || '')}</div>
    </div>
    <div class="section">
      <div class="section-label">⚠️ Why it matters</div>
      <div class="section-content">${escapeHtml(v.whyItMatters || '')}</div>
    </div>
    <div class="section">
      <div class="section-label">🔧 How to fix</div>
      <div class="section-content">${escapeHtml(v.howToFix || '')}</div>
    </div>
    ${beforeCode || afterCode ? `<div class="section"><div class="section-label">💻 Code example</div>${beforeCode}${afterCode}</div>` : ''}
    <div>
      <span class="priority">${escapeHtml(v.priority || '')}</span>
      ${v.wcagCriteria.length ? `&nbsp;<a class="wcag-link" href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener">WCAG ${v.wcagCriteria.join(', ')} ↗</a>` : ''}
      <span style="float:right;font-size:0.8rem;color:#999">${v.nodeCount} element(s) affected</span>
    </div>
  </div>
</div>`;
}

function reportJSON(result) {
  return JSON.stringify(result, null, 2);
}

function writeReport(result, outputPath) {
  const html = reportHTML(result);
  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}

function groupByImpact(violations) {
  return violations.reduce((acc, v) => {
    const key = v.impact || 'minor';
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
  }, {});
}

function impactOrder(impact) {
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  return order[impact] ?? 4;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { reportCLI, reportHTML, reportJSON, writeReport };
