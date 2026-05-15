'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const { scan } = require('./scanner');
const { analyze } = require('./analyzer');
const { summarize } = require('./summarizer');
const { reportHTML } = require('./reporter');

const app = express();
const PORT = process.env.PORT || 3000;

const jobs = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/api/scan', async (req, res) => {
  const { url, noAI } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  jobs.set(jobId, { status: 'scanning', progress: [], url });

  res.json({ jobId });

  runJob(jobId, url, noAI);
});

app.get('/api/scan/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

async function runJob(jobId, url, noAI) {
  const job = jobs.get(jobId);

  try {
    job.status = 'scanning';
    job.message = 'Launching browser and scanning for violations...';

    const scanResult = await scan(url);
    job.scanResult = {
      violationCount: scanResult.violationCount,
      passCount: scanResult.passCount,
      incompleteCount: scanResult.incompleteCount,
    };

    if (!noAI && scanResult.violationCount > 0) {
      job.status = 'analyzing';
      job.message = `Analyzing ${scanResult.violationCount} violations with Gemma4...`;
      job.total = scanResult.violationCount;
      job.current = 0;

      const enriched = await analyze(scanResult, (current, total) => {
        job.current = current;
        job.total = total;
        job.message = `Analyzing violation ${current}/${total} with Gemma4...`;
      });

      job.status = 'summarizing';
      job.message = 'Generating logical and persona summaries...';

      let insights = null;
      try {
        insights = await summarize(enriched, {
          backend: process.env.GEMMA_BACKEND || 'ollama',
          summaryModel: process.env.SUMMARY_MODEL || undefined,
          apiKey: process.env.OPENROUTER_API_KEY || process.env.GEMMA_API_KEY || null,
        });
      } catch {
        // non-fatal — report still renders without insights
      }

      const enrichedWithInsights = insights ? { ...enriched, insights } : enriched;
      job.html = reportHTML(enrichedWithInsights);
      job.summary = buildSummary(enrichedWithInsights);
      job.insights = insights;
    } else {
      job.html = reportHTML(scanResult);
      job.summary = buildSummary(scanResult);
    }

    job.status = 'done';
    job.message = 'Scan complete';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
  }
}

function buildSummary(result) {
  const byImpact = result.violations.reduce((acc, v) => {
    acc[v.impact] = (acc[v.impact] || 0) + 1;
    return acc;
  }, {});
  return {
    total: result.violationCount,
    critical: byImpact.critical || 0,
    serious: byImpact.serious || 0,
    moderate: byImpact.moderate || 0,
    minor: byImpact.minor || 0,
    passed: result.passCount,
  };
}

app.listen(PORT, () => {
  console.log(`\n♿ Accessibility Guardian`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Make sure Ollama is running: ollama serve\n`);
});

module.exports = app;
