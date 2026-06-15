// Runs at Vercel build time (via "build" script in package.json).
// Replaces the _BUILD_INFO placeholder in index.html with real values
// from Vercel's system environment variables.

import { readFileSync, writeFileSync } from 'fs';

const sha      = (process.env.VERCEL_GIT_COMMIT_SHA   || 'DEV').slice(0, 7);
const env      = process.env.VERCEL_ENV                || 'local';
const branch   = process.env.VERCEL_GIT_COMMIT_REF    || 'local';
const buildTime = new Date().toISOString();

const replacement = `{"sha":"${sha}","env":"${env}","branch":"${branch}","time":"${buildTime}"}`;

let html = readFileSync('index.html', 'utf8');

html = html.replace(
  /const _BUILD_INFO = \{[^}]+\};/,
  `const _BUILD_INFO = ${replacement};`
);

writeFileSync('index.html', html);

console.log(`[build-inject] ${env} @ ${sha} (${branch}) — ${buildTime}`);
