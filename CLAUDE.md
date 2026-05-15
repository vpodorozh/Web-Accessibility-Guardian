# Accessibility Guardian

Node.js CLI + web tool that scans websites for accessibility violations and uses Gemma 4 (via OpenRouter, Google AI, or local Ollama) to explain them in plain language with actionable developer fixes.

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

# Run with OpenRouter (default when GEMMA_BACKEND=openrouter in .env)
node src/cli.js --url https://example.com --backend openrouter --api-key sk-or-v1-...

# Start web UI
node src/server.js
# → http://localhost:3000

# Start Ollama (only needed for ollama backend)
ollama serve
```

## Architecture

Pipeline: `scanner.js` → `analyzer.js` → `reporter.js`, orchestrated by `cli.js`.

- **scanner.js** — Playwright Chromium headless + @axe-core/playwright → raw violations JSON
- **analyzer.js** — pluggable AI backend (OpenRouter / Google AI / Ollama) → enriched violations with 6 human fields
- **adapters/** — `openrouter.js` (OpenAI-compat), `google-ai.js`, `ollama.js`
- **reporter.js** — renders to CLI (chalk), HTML (self-contained), or JSON
- **prompts.js** — Gemma4 prompt templates
- **server.js** — Express web UI on port 3000

## Key Dependencies

- `playwright` + `@axe-core/playwright` — browser automation + accessibility scanning
- `express` — web server
- `chalk` — CLI colored output
- `commander` — CLI arg parsing
- **Ollama** (external, must be running) with `gemma4:latest` model — only for `ollama` backend

## Backends & Models

Two Gemma 4 architectures are used where available — 31B dense for per-violation analysis, 26B MoE for deep-reasoning summaries:

| Backend | Analysis model | Summary model | Note |
|---|---|---|---|
| `openrouter` | `google/gemma-4-31b-it:free` | `google/gemma-4-31b-it:free` | MoE not available on OpenRouter |
| `google-ai` | `gemma-4-31b-it` | `gemma-4-26b-a4b-it` | Both available on AI Studio |
| `ollama` | `gemma4:31b` | `gemma4:26b` | Both architectures available locally |

**Ollama tag notes:** `gemma4:latest` = 4B small model (not mid-level). Use explicit tags.
- `gemma4:31b` — 30.7B dense, 20GB, 256K context
- `gemma4:26b` — 25.2B MoE (3.8B active), 18GB, 256K context

Override via env: `OLLAMA_MODEL` (analysis), `SUMMARY_MODEL` (summaries), `GEMMA_BACKEND`.

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
