# Accessibility Guardian

Node.js CLI + web tool that scans websites for accessibility violations and uses Gemma4 (local via Ollama) to explain them in plain language with actionable developer fixes.

## Commands

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run a scan (CLI)
node src/cli.js --url https://example.com
node src/cli.js --url https://example.com --format html --output report.html
node src/cli.js --url https://example.com --format json

# Start web UI
node src/server.js
# → http://localhost:3000

# Start Ollama (must be running for AI analysis)
ollama serve
```

## Architecture

Pipeline: `scanner.js` → `analyzer.js` → `reporter.js`, orchestrated by `cli.js`.

- **scanner.js** — Playwright Chromium headless + @axe-core/playwright → raw violations JSON
- **analyzer.js** — Ollama REST API (localhost:11434) → gemma4:latest → enriched violations with 6 human fields
- **reporter.js** — renders to CLI (chalk), HTML (self-contained), or JSON
- **prompts.js** — Gemma4 prompt templates
- **server.js** — Express web UI on port 3000

## Key Dependencies

- `playwright` + `@axe-core/playwright` — browser automation + accessibility scanning
- `express` — web server
- `chalk` — CLI colored output
- `commander` — CLI arg parsing
- **Ollama** (external, must be running) with `gemma4:latest` model

## Model

Local Ollama at `http://localhost:11434/api/generate`, model `gemma4:latest`.  
No API key required. Privacy-safe (runs entirely on device).

## Output Fields Per Violation

1. `summary` — plain-language description of the issue
2. `affectedUsers` — who is impacted
3. `whyItMatters` — WCAG criterion + real-world impact
4. `howToFix` — concrete remediation steps
5. `codeExample` — before/after code snippet
6. `priority` — P0/P1/P2/P3 mapped from axe impact

## Reports

Generated HTML reports go to `reports/` (gitignored). Can be passed `--output` to specify path.

## Design Spec

`docs/superpowers/specs/2026-05-15-accessibility-guardian-design.md`

## Contest

DEV.to × Google Gemma 2026. Deadline: 2026-05-24.
