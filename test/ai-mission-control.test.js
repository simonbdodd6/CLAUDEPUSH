import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createAIOpsMockAdapter, GRAPH_DOMAINS } from '../ai-mission-control/adapters.js';

function makeNode(id, label, group, x, y, size = 7, meta = {}) {
  return { id, label, group, x, y, size, meta };
}

function makeEdge(source, target, type = 'signal', strength = 1) {
  return { source, target, type, strength };
}

test('AI mission control adapter exposes project operations graph domains', () => {
  assert.deepEqual(GRAPH_DOMAINS, [
    'Repository',
    'Commits',
    'Files',
    'Tests',
    'Deployments',
    'AI Tasks',
    'Builds',
    'Structure',
  ]);
});

test('AI mission control mock adapter creates a read-only operations graph', () => {
  const adapter = createAIOpsMockAdapter({ makeNode, makeEdge });
  const graph = adapter.load();

  assert.equal(graph.adapter, 'mock-ai-ops-network');
  assert.ok(graph.nodes.some(node => node.id === 'repo-main'));
  assert.ok(graph.nodes.some(node => node.group === 'Commits'));
  assert.ok(graph.nodes.some(node => node.group === 'Files'));
  assert.ok(graph.nodes.some(node => node.group === 'Tests'));
  assert.ok(graph.nodes.some(node => node.group === 'Deployments'));
  assert.ok(graph.nodes.some(node => node.group === 'AI Tasks'));
  assert.ok(graph.nodes.some(node => node.group === 'Builds'));
  assert.ok(graph.nodes.filter(node => node.group === 'Structure').length >= 5);
  assert.ok(graph.edges.length > 80);
});

test('AI mission control is a standalone static app with no production API calls', async () => {
  const html = await readFile(new URL('../ai-mission-control/index.html', import.meta.url), 'utf8');
  const appJs = await readFile(new URL('../ai-mission-control/app.js', import.meta.url), 'utf8');
  const adaptersJs = await readFile(new URL('../ai-mission-control/adapters.js', import.meta.url), 'utf8');
  const packageJson = await readFile(new URL('../ai-mission-control/package.json', import.meta.url), 'utf8');

  assert.match(html, /id="networkCanvas"/);
  assert.match(html, /Standalone AI Operations Center/);
  assert.match(appJs, /createAIOpsMockAdapter/);
  assert.match(packageJson, /4173/);

  const bundledText = `${html}\n${appJs}\n${adaptersJs}`;
  assert.doesNotMatch(bundledText, /fetch\(/);
  assert.doesNotMatch(bundledText, /\/api\//);
  assert.doesNotMatch(bundledText, /Redis|UPSTASH|VAPID/);
});

test('/dev/network route includes fixed navigation back to the main app', async () => {
  const routeHtml = await readFile(new URL('../dev/network/index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../ai-mission-control/styles.css', import.meta.url), 'utf8');

  assert.match(routeHtml, /class="mission-nav"/);
  assert.match(routeHtml, /🏉 Coach's Eye/);
  assert.match(routeHtml, /🏠 Home/);
  assert.match(routeHtml, /href="\/"/);
  assert.match(routeHtml, /\/ai-mission-control\/app\.js/);
  assert.match(routeHtml, /id="networkCanvas"/);
  assert.match(styles, /\.mission-nav\s*\{/);
  assert.match(styles, /position:\s*fixed/);
  assert.match(styles, /pointer-events:\s*none/);
  assert.match(styles, /\.mission-nav a\s*\{[\s\S]*pointer-events:\s*auto/);
});
