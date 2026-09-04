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

// BUILD AG — the service worker's SW_VERSION is the deploy lever: a changed
// value makes the new worker install (skipWaiting), claim the open windows
// and refresh each one ONCE, so installed PWAs pick up the current bundle.
// It used to be a hand-edited constant and sat unchanged across ~13 deploys,
// leaving installed PWAs on weeks-old builds. Stamping it here — with the
// deploy sha AND the build time, so even a redeploy of the same sha pulls
// the lever — makes every production deploy reach every installed device.
let sw = readFileSync('sw.js', 'utf8');
sw = sw.replace(
  /const SW_VERSION = '[^']*';/,
  `const SW_VERSION = '${sha}.${buildTime}';`
);
writeFileSync('sw.js', sw);

console.log(`[build-inject] ${env} @ ${sha} (${branch}) — ${buildTime} · sw ${sha}.${buildTime}`);
