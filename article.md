---
title: Accessibility Guardian — AI-Powered WCAG Auditor That Thinks Like a Disabled User
published: 2026-05-15
tags: devchallenge, gemmachallenge, gemma
---

*This is a submission for the [Gemma 4 Challenge: Build with Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06)*

---

## What I Built

Accessibility auditing tools like axe-core are great at *finding* WCAG violations. They are terrible at explaining what they mean to the people who need to fix them.

When a tool tells you:

> `color-contrast: Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds (Elements must have sufficient color contrast) — 3 elements`

…a developer without accessibility expertise doesn't know who is suffering, how badly, or what to do first. The report sits unread. The violations stay.

**Accessibility Guardian** closes this gap. It scans any website using a real browser (Playwright + axe-core), then uses **Gemma 4** to transform each raw violation into plain-language developer guidance — and goes further: it generates a first-person narrative from the perspective of a real disabled user encountering those exact barriers on that exact page.

The result is a report that developers actually act on.

![Accessibility Guardian CLI header](https://raw.githubusercontent.com/vpodorozh/Web-Accessibility-Guardian/main/docs/screenshots/intro.png)

**Live example report → [dev.to scanned with Accessibility Guardian](https://vpodorozh.github.io/Web-Accessibility-Guardian/reports/example/)**

**Repository → [github.com/vpodorozh/Web-Accessibility-Guardian](https://github.com/vpodorozh/Web-Accessibility-Guardian)**

---

## Demo

### HTML Report

The HTML report opens with two AI-generated summaries side by side — a strict logical triage for developers, and a human story for everyone else:

![HTML report showing logical audit summary and disabled user persona](https://raw.githubusercontent.com/vpodorozh/Web-Accessibility-Guardian/main/docs/screenshots/html-report.png)

Below the summaries, each violation gets its own card with:
- Plain-language summary
- Who is affected and with which assistive technology
- A **first-person experience narrative** — what it literally feels like to hit this bug
- Step-by-step fix instructions
- Before/after code example
- Priority (P0–P3)

### CLI Output

For each violation, the model writes a first-person account of the real user experience:

![CLI showing per-violation user experience narrative](https://raw.githubusercontent.com/vpodorozh/Web-Accessibility-Guardian/main/docs/screenshots/cli2.png)

At the end of a scan, a second Gemma 4 call generates the "In the Shoes of a Disabled User" summary — a full persona narrative covering the entire page:

![CLI showing the disabled user persona summary](https://raw.githubusercontent.com/vpodorozh/Web-Accessibility-Guardian/main/docs/screenshots/cli1.png)

### GitHub Actions Pipeline

Scan any URL with one click. No local setup. Publishes the report to GitHub Pages automatically:

![GitHub Actions pipeline running an accessibility scan](https://raw.githubusercontent.com/vpodorozh/Web-Accessibility-Guardian/main/docs/screenshots/github+action_running.png)

The pipeline takes three inputs: **URL**, **backend** (openrouter / google-ai / ollama), and an optional **API key** (falls back to repo secrets).

---

## Code

**Repository:** [github.com/vpodorozh/Web-Accessibility-Guardian](https://github.com/vpodorozh/Web-Accessibility-Guardian)

The pipeline runs on GitHub Actions with zero infrastructure. Try it yourself:

```bash
git clone https://github.com/vpodorozh/Web-Accessibility-Guardian
cd Web-Accessibility-Guardian
npm install
npx playwright install chromium

# Scan with Google AI (no GPU needed)
export GEMMA_BACKEND=google-ai
export GEMMA_API_KEY=your_key_here
node src/cli.js --url https://your-site.com --format html --output report.html

# Or with OpenRouter (free tier)
node src/cli.js --url https://your-site.com \
  --backend openrouter \
  --api-key sk-or-v1-...
```

### Architecture

```
URL input
    │
    ▼
Playwright Chromium (headless — loads real JS-rendered pages)
    │
    ▼
axe-core (WCAG 2.1 AA audit engine)
    │   finds violations, passes, incompletes
    ▼
Gemma 4 — 31B Dense (per-violation analysis loop)
    │   explanation + user experience + code fix for each violation
    ▼
Gemma 4 — 26B MoE (scan-level summaries, run once)
    │   logical audit triage + disabled user persona narrative
    ▼
Report: CLI · HTML · JSON · GitHub Pages
```

---

## How I Used Gemma 4

This is the part I want to explain carefully — because the model selection here is not arbitrary.

### The Problem With a Single Model

Accessibility Guardian makes two fundamentally different kinds of AI calls per scan:

1. **Per-violation analysis** — called once for each violation found. A page with 12 violations = 12 sequential calls. Each call must return valid, structured JSON with six specific fields. If one response is malformed, that violation's card breaks.

2. **Scan-level summaries** — called exactly twice per scan. These prompts ask the model to reason across *all* violations simultaneously: synthesise a prioritised triage plan, then construct a first-person experience narrative from the perspective of the most-affected disabled user.

These two tasks have opposite requirements. The first demands **consistency and reliability at scale**. The second demands **deep reasoning and synthesis**.

Gemma 4 has two architectures that map perfectly onto these two needs.

---

### Model 1: 31B Dense — For Per-Violation Analysis

**Model:** `gemma-4-31b-it` (Google AI Studio) / `gemma4:31b` (Ollama) / `google/gemma-4-31b-it:free` (OpenRouter)

The 31B Dense model activates all its parameters for every token. This is expensive, but it produces **stable, predictable, consistent outputs** — call after call after call.

For per-violation analysis, this matters enormously:

- The response must be **parseable JSON** every single time. One malformed response in a loop of 12 breaks the card for that violation.
- Each prompt is self-contained — one violation, no cross-violation context — so the broad, consistent knowledge of a dense model is exactly what's needed.
- At scale (large sites can have 30+ violations), reliability beats cleverness.

Dense wins when you need structured output, repeatedly, reliably.

```js
// Each violation gets its own call to the 31B Dense model
for (const violation of violations) {
  const explanation = await adapter.generate(
    buildExplanationPrompt(violation),  // self-contained prompt
    { model: 'gemma-4-31b-it', ... }
  );
  // Must parse to valid JSON — dense model delivers this reliably
}
```

---

### Model 2: 26B MoE — For Audit Summaries

**Model:** `gemma-4-26b-a4b-it` (Google AI Studio) / `gemma4:26b` (Ollama)

The 26B Mixture-of-Experts model selectively activates specialist sub-networks per token. Google describes it as *"designed for high-throughput, advanced reasoning"* — and that is precisely what the two summary tasks require.

**Logical audit summary** — the model must:
- Hold all violations in context simultaneously
- Identify which functional areas of the site are broken
- Reason about which cluster carries the highest combined risk (severity × element count × legal exposure)
- Produce a prioritised remediation plan

**"In the shoes of a disabled user" persona** — the model must:
- Determine which disability group faces the most cumulative barriers on this page
- Construct a realistic user: specific AT setup, specific goal, specific journey
- Walk through their session step by step, naming the exact violations they hit
- Write it as a first-person narrative that feels human, not clinical

Both prompts use explicit `<think>` chain-of-thought blocks — the model reasons step by step before producing its answer:

```
Think step by step inside a <think>...</think> block before writing your JSON answer:
1. Look at the types of violations present. Which single disability group faces
   the most cumulative barriers?
2. Pick a specific, realistic assistive technology and setup for that person...
3. Walk through their attempt step by step, noting exactly where each violation
   stops them...

After </think>, output ONLY a JSON object...
```

MoE's selective expert activation is well-suited for this kind of multi-step synthesis, where different parts of the reasoning chain draw on different competencies — WCAG knowledge, empathy, technical prioritisation. Two calls. Deep reasoning. MoE wins.

---

### The Split in Practice

| Task | Architecture | Model | Calls per scan |
|---|---|---|---|
| Per-violation analysis | **31B Dense** | `gemma-4-31b-it` | N (one per violation) |
| Logical audit + persona summary | **26B MoE** | `gemma-4-26b-a4b-it` | 2 (once per scan) |

On **Google AI Studio** and **Ollama**, both architectures are available and both are used. On **OpenRouter**, only the 31B Dense is currently available as a free model, so it handles both roles there — the reports still work, but the MoE's reasoning depth is the preferred path.

```js
// analyzer.js — model selection per task
const DEFAULT_MODEL = {
  'google-ai':    'gemma-4-31b-it',            // Dense — analysis
  'ollama':       'gemma4:31b',
};
const DEFAULT_SUMMARY_MODEL = {
  'google-ai':    'gemma-4-26b-a4b-it',        // MoE — summaries
  'ollama':       'gemma4:26b',
};
```

---

### What Gemma 4 Unlocked

The thing that makes Accessibility Guardian different from running axe-core in CI is the **empathy layer**. The first-person user experience narratives — both per-violation and the full persona summary — are only possible with a model capable of genuine reasoning about human experience.

The output shown in the CLI screenshot above — *"I try to jump straight to the main content area, but nothing happens; the screen reader just reads the header navigation again..."* — is not a template. Gemma 4 generated that by reasoning about the specific violations found on that specific page, then inhabiting the perspective of a specific blind user with a specific goal.

That kind of output changes how developers relate to accessibility. It stops being a compliance checkbox and starts being a person.

---

## What's Next

- [ ] Multi-page crawling (full site audit)
- [ ] PDF report export
- [ ] Automated PR comment with violations diff
- [ ] BITV 2.0 (German accessibility law) compliance mode
- [ ] Severity trend tracking across scans

---

**Repository:** [github.com/vpodorozh/Web-Accessibility-Guardian](https://github.com/vpodorozh/Web-Accessibility-Guardian)
**Live example report:** [vpodorozh.github.io/Web-Accessibility-Guardian/reports/example/](https://vpodorozh.github.io/Web-Accessibility-Guardian/reports/example/)
**License:** MIT
