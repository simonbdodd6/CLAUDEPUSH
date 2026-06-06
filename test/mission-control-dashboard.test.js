import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { default: missionControlHandler } = await import('../api/mission-control.js');

function response() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = '') {
      this.payload = JSON.parse(String(chunk || '{}'));
    },
  };
}

test('/mission-control route is a standalone installable dashboard', async () => {
  const html = await readFile(new URL('../mission-control/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../mission-control/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../mission-control/app.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../mission-control/manifest.json', import.meta.url), 'utf8'));
  const sw = await readFile(new URL('../mission-control/sw.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

  assert.match(html, /id="missionCanvas"/);
  assert.match(css, /glass/);
  assert.match(css, /#22d3ee/);
  assert.match(app, /requestAnimationFrame/);
  assert.match(app, /\/api\/mission-control/);
  assert.equal(manifest.start_url, '/mission-control');
  assert.equal(manifest.display, 'standalone');
  assert.match(sw, /coach-eye-mission-control-v1/);
  assert.ok(vercel.rewrites.some(rule => rule.source === '/mission-control' && rule.destination === '/mission-control/index.html'));
});

test('main app exposes keyboard shortcut M to open Mission Control', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /event\.key[\s\S]*toLowerCase\(\)[\s\S]*=== 'm'/);
  assert.match(html, /window\.location\.href = '\/mission-control'/);
});

test('mission-control API requires coach or admin authentication', async () => {
  const res = response();
  await missionControlHandler({ method: 'GET' }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.ok, false);
  assert.match(res.payload.error, /session|auth/i);
});
