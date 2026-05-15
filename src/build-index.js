'use strict';

const fs = require('fs');
const path = require('path');

const SITE_DIR = process.argv[2] || '_site';
const REPORTS_DIR = path.join(SITE_DIR, 'reports');
const MAX_AGE_DAYS = 7;

fs.mkdirSync(REPORTS_DIR, { recursive: true });

const now = Date.now();
const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// Prune reports older than 7 days
const entries = fs.readdirSync(REPORTS_DIR).filter((name) => {
  const fullPath = path.join(REPORTS_DIR, name);
  if (!fs.statSync(fullPath).isDirectory()) return false;

  const ts = parseTimestamp(name);
  if (!ts) return true; // keep unknown entries

  if (now - ts > maxAge) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`Pruned old report: ${name}`);
    return false;
  }
  return true;
});

// Sort remaining entries newest-first
const reports = entries
  .map((name) => ({ name, ts: parseTimestamp(name) || 0 }))
  .sort((a, b) => b.ts - a.ts);

// Write index.html
const indexHtml = buildIndexPage(reports);
fs.writeFileSync(path.join(SITE_DIR, 'index.html'), indexHtml, 'utf8');
console.log(`Index written with ${reports.length} report(s)`);

function parseTimestamp(name) {
  // Format: YYYY-MM-DD-HHmmss-{run_id}
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})-\d+$/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).getTime();
}

function buildIndexPage(reports) {
  const rows = reports.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:#64748b;padding:2rem">No reports yet. Run a scan first.</td></tr>'
    : reports.map((r) => {
        const date = new Date(r.ts);
        const label = date.toUTCString().replace(' GMT', ' UTC');
        const url = `./reports/${r.name}/index.html`;

        // Try to read scan metadata from the report
        const reportPath = path.join(REPORTS_DIR, r.name, 'index.html');
        const meta = extractMeta(reportPath);

        return `<tr>
          <td><a href="${url}">${label}</a></td>
          <td style="font-size:0.85rem;color:#64748b;word-break:break-all">${meta.url || '—'}</td>
          <td>${meta.violations !== null ? badge(meta.violations) : '—'}</td>
        </tr>`;
      }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Accessibility Guardian — Report History</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 860px; margin: 0 auto; padding: 2rem 1rem; background: #0f172a; color: #e2e8f0; }
  h1 { font-size: 1.8rem; font-weight: 800; background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.25rem; }
  .sub { color: #64748b; margin-bottom: 2rem; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 10px; overflow: hidden; }
  th { text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: .07em; color: #64748b; background: #0f172a; }
  td { padding: 0.75rem 1rem; border-top: 1px solid #334155; vertical-align: middle; }
  tr:hover td { background: #253047; }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .badge { display: inline-block; padding: 0.2em 0.6em; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
  .badge-ok  { background: #052e16; color: #4ade80; border: 1px solid #166534; }
  .badge-warn { background: #431407; color: #fb923c; border: 1px solid #9a3412; }
  .badge-bad  { background: #450a0a; color: #f87171; border: 1px solid #991b1b; }
  footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #334155; }
</style>
</head>
<body>
<h1>♿ Accessibility Guardian</h1>
<p class="sub">Report history — last ${MAX_AGE_DAYS} days · ${reports.length} scan(s)</p>
<table>
  <thead><tr><th>Scan date (UTC)</th><th>URL</th><th>Violations</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<footer>Powered by Playwright + axe-core + Gemma4 · <a href="https://github.com/vpodorozh/Web-Accessibility-Guardian">GitHub</a></footer>
</body>
</html>`;
}

function badge(count) {
  if (count === 0) return `<span class="badge badge-ok">✓ 0</span>`;
  if (count <= 5) return `<span class="badge badge-warn">⚠ ${count}</span>`;
  return `<span class="badge badge-bad">✗ ${count}</span>`;
}

function extractMeta(reportPath) {
  try {
    const html = fs.readFileSync(reportPath, 'utf8');
    const urlMatch = html.match(/href="([^"]+)" target="_blank" rel="noopener">\1<\/a>/);
    const violationsMatch = html.match(/Violations:<\/div>\s*<div[^>]*>(\d+)/);
    return {
      url: urlMatch ? urlMatch[1] : null,
      violations: violationsMatch ? parseInt(violationsMatch[1]) : null,
    };
  } catch {
    return { url: null, violations: null };
  }
}
