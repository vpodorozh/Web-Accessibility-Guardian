'use strict';

/**
 * Downloads the latest "reports-archive" artifact and extracts it to _site/reports/.
 * Called at the start of each workflow run to restore previous reports.
 *
 * Usage: node src/fetch-reports-artifact.js <site-dir>
 * Env:   GITHUB_TOKEN, GITHUB_REPOSITORY (both set automatically in Actions)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ARTIFACT_NAME = 'reports-archive';
const siteDir = process.argv[2] || '_site';
const reportsDir = path.join(siteDir, 'reports');

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;

if (!token || !repo) {
  console.log('No GITHUB_TOKEN or GITHUB_REPOSITORY — skipping restore (local run?)');
  fs.mkdirSync(reportsDir, { recursive: true });
  process.exit(0);
}

(async () => {
  fs.mkdirSync(reportsDir, { recursive: true });

  const artifactId = await findLatestArtifact();
  if (!artifactId) {
    console.log('No previous reports-archive artifact found — starting fresh');
    process.exit(0);
  }

  console.log(`Found artifact ${artifactId} — downloading...`);
  await downloadAndExtract(artifactId);
  console.log('Previous reports restored');
})();

async function findLatestArtifact() {
  const url = `https://api.github.com/repos/${repo}/actions/artifacts?name=${ARTIFACT_NAME}&per_page=1`;
  const res = await fetch(url, { headers: authHeaders() });

  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const artifact = data.artifacts?.find((a) => !a.expired);
  return artifact?.id ?? null;
}

async function downloadAndExtract(artifactId) {
  const zipPath = path.join(siteDir, 'reports-archive.zip');

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/artifacts/${artifactId}/zip`,
    { headers: authHeaders(), redirect: 'follow' }
  );

  if (!res.ok) throw new Error(`Artifact download failed: ${res.status}`);

  const buffer = await res.arrayBuffer();
  fs.writeFileSync(zipPath, Buffer.from(buffer));

  execFileSync('unzip', ['-o', zipPath, '-d', reportsDir], { stdio: 'inherit' });
  fs.unlinkSync(zipPath);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
