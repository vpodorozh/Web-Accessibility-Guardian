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

  if (result.insights) {
    const { logical, persona } = result.insights;

    lines.push(`${BOLD}╔══════════════════════════════════════════════════════╗${RESET}`);
    lines.push(`${BOLD}║              📋  LOGICAL AUDIT SUMMARY               ║${RESET}`);
    lines.push(`${BOLD}╚══════════════════════════════════════════════════════╝${RESET}`);

    if (logical && !logical.error) {
      if (logical.headline) lines.push(`\n${BOLD}${logical.headline}${RESET}`);
      if (logical.verdict) lines.push(`\n${logical.verdict}`);
      if (logical.areas && logical.areas.length) {
        lines.push(`\n${BOLD}Areas to fix (in priority order):${RESET}`);
        const orderedAreas = logical.priorityOrder
          ? logical.priorityOrder.map(name => logical.areas.find(a => a.area === name) || { area: name })
          : logical.areas;
        orderedAreas.forEach((a, i) => {
          const color = IMPACT_COLORS[a.topImpact] || '';
          lines.push(`  ${i + 1}. ${color}${BOLD}${a.area}${RESET} — ${a.note || ''} (${a.issueCount || '?'} issue(s))`);
        });
      }
    } else {
      lines.push(`${DIM}Logical summary unavailable: ${logical?.error || 'unknown error'}${RESET}`);
    }

    lines.push('');
    lines.push(`${BOLD}╔══════════════════════════════════════════════════════╗${RESET}`);
    lines.push(`${BOLD}║          🧑‍🦯  IN THE SHOES OF A DISABLED USER         ║${RESET}`);
    lines.push(`${BOLD}╚══════════════════════════════════════════════════════╝${RESET}`);

    if (persona && !persona.error) {
      if (persona.disability) lines.push(`\n${BOLD}Perspective:${RESET} ${persona.disability}`);
      if (persona.task) lines.push(`${BOLD}Goal:${RESET} ${persona.task}`);
      if (persona.experience) lines.push(`\n${persona.experience}`);
      if (persona.breakingPoint) lines.push(`\n${BOLD}Breaking point:${RESET} ${persona.breakingPoint}`);
      if (persona.impact) lines.push(`${BOLD}Real-world impact:${RESET} ${persona.impact}`);
    } else {
      lines.push(`${DIM}Persona summary unavailable: ${persona?.error || 'unknown error'}${RESET}`);
    }

    lines.push('');
    lines.push('═'.repeat(56));
    lines.push('');
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
      if (v.userExperience) {
        lines.push(`${BOLD}🧑‍🦯 User experience:${RESET}`);
        lines.push(`   ${CYAN}${v.userExperience.replace(/\n/g, '\n   ')}${RESET}`);
      }
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
  .ai-badge-error { background: #fff7ed; color: #c2410c; border-color: #fed7aa; cursor: help; }
  .congrats { background: #f0fdf4; border: 2px solid #4ade80; border-radius: 8px; padding: 2rem; text-align: center; color: #166534; }
  .ai-warning { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; color: #9a3412; }
  .toggle-icon { transition: transform 0.2s; }
  .card.open .toggle-icon { transform: rotate(180deg); }
  details summary { list-style: none; }
  details summary::-webkit-details-marker { display: none; }
  footer { margin-top: 3rem; text-align: center; font-size: 0.8rem; color: #999; }
  .insights { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 2rem; }
  @media (max-width: 640px) { .insights { grid-template-columns: 1fr; } }
  .insight-card { background: white; border-radius: 8px; padding: 1.25rem 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .insight-card h2 { font-size: 1rem; margin: 0 0 0.75rem; }
  .insight-headline { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }
  .insight-verdict { font-size: 0.875rem; line-height: 1.6; color: #374151; }
  .insight-areas { margin: 0.75rem 0 0; padding: 0; list-style: none; }
  .insight-areas li { font-size: 0.8rem; padding: 0.3rem 0; border-top: 1px solid #f0f0f0; display: flex; align-items: baseline; gap: 0.4rem; }
  .insight-areas li:first-child { border-top: none; }
  .area-rank { font-weight: 700; color: #666; min-width: 1.2rem; }
  .area-name { font-weight: 600; }
  .area-note { color: #555; flex: 1; }
  .area-count { font-size: 0.75rem; color: #999; white-space: nowrap; }
  .area-critical { color: #dc2626; }
  .area-serious { color: #ea580c; }
  .area-moderate { color: #ca8a04; }
  .area-minor { color: #2563eb; }
  .persona-meta { font-size: 0.8rem; color: #555; margin-bottom: 0.75rem; }
  .persona-experience { font-size: 0.875rem; line-height: 1.7; color: #374151; font-style: italic; border-left: 3px solid #e5e7eb; padding-left: 0.75rem; margin: 0.75rem 0; }
  .persona-breaking { font-size: 0.8rem; background: #fef2f2; border-left: 3px solid #f87171; padding: 0.5rem 0.75rem; border-radius: 0 4px 4px 0; margin-top: 0.75rem; }
  .persona-impact { font-size: 0.8rem; color: #374151; margin-top: 0.5rem; }
  .insight-error { font-size: 0.85rem; color: #9a3412; background: #fff7ed; padding: 0.5rem 0.75rem; border-radius: 4px; }
  .user-experience { background: #f5f3ff; border-left: 3px solid #7c3aed; border-radius: 0 6px 6px 0; padding: 0.6rem 0.9rem; font-size: 0.875rem; line-height: 1.65; color: #3b0764; font-style: italic; margin-top: 0.35rem; }
</style>
</head>
<body>
<script type="application/json" id="scan-meta">${JSON.stringify({
  url: result.url,
  scannedAt: result.scannedAt,
  violationCount: result.violationCount,
  passCount: result.passCount,
  critical: criticalCount,
  serious: seriousCount,
  moderate: moderateCount,
  minor: minorCount,
})}</script>
<h1>♿ Accessibility Guardian Report</h1>
<p class="meta">
  URL: <a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">${escapeHtml(result.url)}</a><br>
  Scanned: ${escapeHtml(result.scannedAt)} · Powered by Playwright + axe-core + Gemma4
</p>

${violations.length > 0 && violations.every(v => !v.aiEnriched) ? `<div class="ai-warning">⚠️ <strong>AI analysis unavailable</strong> — showing raw axe-core data. First error: <code>${escapeHtml(violations[0]?.aiError || 'unknown')}</code><br>Check that <code>GEMMA_API_KEY</code> is set correctly in your GitHub repository secrets.</div>` : ''}

<div class="stats">
  <div class="stat critical"><div class="stat-number">${criticalCount}</div><div class="stat-label">Critical</div></div>
  <div class="stat serious"><div class="stat-number">${seriousCount}</div><div class="stat-label">Serious</div></div>
  <div class="stat moderate"><div class="stat-number">${moderateCount}</div><div class="stat-label">Moderate</div></div>
  <div class="stat minor"><div class="stat-number">${minorCount}</div><div class="stat-label">Minor</div></div>
  <div class="stat passed"><div class="stat-number">${result.passCount}</div><div class="stat-label">Passed</div></div>
</div>

${result.insights ? renderInsights(result.insights) : ''}

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
  const aiTag = v.aiEnriched
    ? '<span class="ai-badge">✨ Gemma4</span>'
    : `<span class="ai-badge ai-badge-error" title="${escapeHtml(v.aiError || 'AI unavailable')}">⚠ raw data</span>`;
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
    ${v.userExperience ? `
    <div class="section">
      <div class="section-label">🧑‍🦯 User experience</div>
      <div class="user-experience">${escapeHtml(v.userExperience)}</div>
    </div>` : ''}
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

function renderInsights({ logical, persona }) {
  const logicalHtml = logical && !logical.error
    ? `
      <div class="insight-headline">${escapeHtml(logical.headline || '')}</div>
      <div class="insight-verdict">${escapeHtml(logical.verdict || '')}</div>
      ${logical.areas && logical.areas.length ? `
        <ul class="insight-areas">
          ${(logical.priorityOrder
            ? logical.priorityOrder.map(name => logical.areas.find(a => a.area === name) || { area: name })
            : logical.areas
          ).map((a, i) => `
            <li>
              <span class="area-rank">${i + 1}.</span>
              <span class="area-name area-${escapeHtml(a.topImpact || 'minor')}">${escapeHtml(a.area || '')}</span>
              <span class="area-note">${escapeHtml(a.note || '')}</span>
              <span class="area-count">${a.issueCount != null ? a.issueCount + ' issue(s)' : ''}</span>
            </li>`).join('')}
        </ul>` : ''}
    `
    : `<div class="insight-error">Summary unavailable: ${escapeHtml(logical?.error || 'unknown error')}</div>`;

  const personaHtml = persona && !persona.error
    ? `
      <div class="persona-meta">
        <strong>Perspective:</strong> ${escapeHtml(persona.disability || '')}<br>
        <strong>Goal:</strong> ${escapeHtml(persona.task || '')}
      </div>
      <div class="persona-experience">${escapeHtml(persona.experience || '')}</div>
      ${persona.breakingPoint ? `<div class="persona-breaking">⛔ ${escapeHtml(persona.breakingPoint)}</div>` : ''}
      ${persona.impact ? `<div class="persona-impact">💬 ${escapeHtml(persona.impact)}</div>` : ''}
    `
    : `<div class="insight-error">Persona summary unavailable: ${escapeHtml(persona?.error || 'unknown error')}</div>`;

  return `<div class="insights">
  <div class="insight-card">
    <h2>📋 Logical Audit Summary</h2>
    ${logicalHtml}
  </div>
  <div class="insight-card">
    <h2>🧑‍🦯 In the Shoes of a Disabled User</h2>
    ${personaHtml}
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
