# Accessibility Guardian — Design Spec

**Date:** 2026-05-15  
**Contest:** DEV.to × Google Gemma 2026 Challenge  
**Deadline:** 2026-05-24  

---

## Overview

A Node.js CLI tool (with optional web UI) that scans any website for accessibility violations using Playwright + axe-core, then uses Gemma4 (local via Ollama) to translate raw WCAG violations into human-readable explanations with actionable developer fixes.

**Core value proposition:** Accessibility reports are often too technical for developers and teams without a11y expertise. This tool bridges that gap using Gemma4 to produce plain-language explanations, affected-user context, and ready-to-use code fixes.

---

## Architecture

```
URL input
    │
    ▼
┌─────────────┐
│  scanner.js │  Playwright Chromium headless + @axe-core/playwright
│             │  → violations[] (raw axe-core JSON)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ analyzer.js │  Ollama REST API → gemma4:latest
│             │  → enrichedViolations[] (6 human fields per violation)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ reporter.js │  CLI (chalk) | HTML (self-contained) | JSON
└─────────────┘
```

Entry points:
- `src/cli.js` — CLI: `node src/cli.js --url <url> [--format cli|html|json] [--output <path>]`
- `src/server.js` — Express web UI on port 3000

---

## Modules

### `src/scanner.js`

**Responsibility:** Launch Playwright Chromium, navigate to URL, inject and run axe-core, return structured violations.

**Output shape:**
```json
{
  "url": "https://example.com",
  "scannedAt": "2026-05-15T10:00:00Z",
  "violations": [
    {
      "id": "color-contrast",
      "impact": "serious",
      "description": "Ensures the contrast between foreground and background colors...",
      "help": "Elements must have sufficient color contrast",
      "helpUrl": "https://dequeuniversity.com/...",
      "wcagCriteria": ["1.4.3"],
      "nodes": [{ "html": "<p class=\"light-text\">...</p>", "target": [".light-text"] }]
    }
  ],
  "violationCount": 12,
  "passCount": 48,
  "incompleteCount": 3
}
```

**Key decisions:**
- Uses `@axe-core/playwright` (already in package.json)
- Timeout: 30s for page load, 10s for axe scan
- Handles auth-walled pages gracefully (returns empty violations + warning)
- Groups nodes per violation rule (axe-core default behavior)

---

### `src/analyzer.js`

**Responsibility:** For each violation, send a structured prompt to Gemma4 via Ollama and parse the 6-field response.

**Ollama endpoint:** `http://localhost:11434/api/generate`  
**Model:** `gemma4:latest`  
**Mode:** `stream: false` (simpler, works for this use case)

**Output per violation (enriched):**
```json
{
  "id": "color-contrast",
  "impact": "serious",
  "summary": "Text on this page doesn't have enough contrast with its background...",
  "affectedUsers": "People with low vision, color blindness, or viewing in bright sunlight",
  "whyItMatters": "WCAG 2.1 criterion 1.4.3 requires a minimum 4.5:1 contrast ratio...",
  "howToFix": "Increase the contrast of text by darkening the text color or lightening the background...",
  "codeExample": {
    "before": ".light-text { color: #aaa; background: #fff; }",
    "after": ".light-text { color: #595959; background: #fff; } /* ratio: 7:1 */"
  },
  "priority": "high",
  "wcagCriteria": ["1.4.3"],
  "nodes": [...]
}
```

**Prompt design:**
- Structured prompt requesting JSON output with all 6 fields
- Includes the axe-core violation id, description, impact level, and an example HTML node
- Fallback: if Gemma4 JSON parse fails, extract fields via regex; if Ollama is unreachable, return raw violation with basic WCAG description

**Batching:** Process in batches of 3 concurrent requests to balance speed vs. Ollama load.

---

### `src/reporter.js`

**Responsibility:** Render enriched violations in three formats.

**CLI format:**
- Summary header: URL, scan time, violation count by severity
- Per-violation block: colored severity badge, summary, affected users, fix preview
- Uses `chalk` for color, no external table library needed

**HTML format:**
- Self-contained single `.html` file (inline CSS, no CDN dependencies)
- Sections: summary stats, violation cards (expandable), code diff blocks
- Color-coded by severity: critical (red), serious (orange), moderate (yellow), minor (blue)
- Shareable — can be committed to CI artifacts or emailed

**JSON format:**
- Full enriched violations array
- Suitable for CI/CD integration, further tooling

---

### `src/cli.js`

**Responsibility:** Parse CLI args, orchestrate pipeline, handle errors.

**Interface:**
```bash
node src/cli.js --url https://example.com
node src/cli.js --url https://example.com --format html --output report.html
node src/cli.js --url https://example.com --format json
```

**Error handling:**
- Invalid URL → clear error message
- Playwright launch failure → suggest `npx playwright install chromium`
- Ollama unreachable → warn, continue with raw output

---

### `src/server.js` (optional web UI)

**Responsibility:** Express web server with a simple form UI.

**Routes:**
- `GET /` — form page with URL input + format selector
- `POST /scan` — triggers pipeline, returns JSON (polled by frontend)
- `GET /report/:id` — serves generated HTML report

**UI:** Plain HTML + minimal CSS (no framework). Shows live status: "Launching browser...", "Scanning...", "Analyzing with Gemma4...", "Done."

---

### `src/prompts.js`

**Responsibility:** Prompt template library for Gemma4.

Contains the structured prompt that produces consistent JSON output across all violation types. Versioned so prompt quality can be iterated without touching analyzer logic.

---

## File Structure

```
web-accessibility-guardian/
├── src/
│   ├── cli.js
│   ├── server.js
│   ├── scanner.js
│   ├── analyzer.js
│   ├── reporter.js
│   └── prompts.js
├── public/
│   └── index.html        (web UI form)
├── reports/              (gitignored, generated HTML reports)
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-15-accessibility-guardian-design.md
├── CLAUDE.md
├── README.md
├── package.json
└── .gitignore
```

---

## Dependencies to Add

- `chalk` — CLI color output
- `commander` — CLI arg parsing
- `ollama` — Official Ollama JS client (or use native `fetch` to avoid extra dep)

Existing: `playwright`, `@axe-core/playwright`, `express`

---

## Error Handling Strategy

| Failure | Behavior |
|---|---|
| Invalid URL | Exit with clear message, suggest format |
| Page load timeout | Return partial results + warning |
| axe-core scan fails | Return error, suggest checking URL accessibility |
| Ollama unreachable | Warn user, return raw axe output with basic WCAG links |
| Gemma4 JSON parse error | Retry once with explicit JSON instruction; fallback to regex extraction |
| No violations found | Output congratulatory message with pass stats |

---

## Priority Mapping

axe-core `impact` → human priority:
- `critical` → **P0 — Fix immediately** (blocks users completely)
- `serious` → **P1 — Fix this sprint** (significantly degrades experience)
- `moderate` → **P2 — Fix soon** (causes noticeable difficulty)
- `minor` → **P3 — Fix when possible** (minor annoyance)

---

## Non-Goals (YAGNI)

- No database / persistence layer
- No authentication
- No multi-page crawling (single URL only in v1)
- No automated PR creation (described in README as future work)
- No cloud deployment

---

## Contest Alignment

- **Gemma usage:** Central to the value prop — every violation explanation is Gemma4-generated
- **Why Gemma4:** Local model = no API costs, privacy-safe for enterprise/public sector, fast enough for CLI UX, excellent instruction-following for structured JSON output
- **Code quality:** Modular pipeline, clear separation of concerns, graceful fallbacks
- **Creativity:** Bridges a11y tooling gap for non-experts; applicable to dev agencies, public institutions, e-commerce
- **UX:** Both CLI (devs) and web UI (non-technical stakeholders)
