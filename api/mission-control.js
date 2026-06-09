import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { kvConfigured, kvGet, kvLrange } from './_kv.js';
import { key } from './_keys.js';
import { requireTenantRole } from './_tenant.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['.git', '.vercel', 'node_modules', '.next', 'coverage']);
const NODE_LIMIT = 220;

function json(res, status, payload) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function authError(res, error) {
  return json(res, error?.status || 403, { ok: false, error: error?.message || 'Not authorized' });
}

function safeGit(args = []) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1200 }).trim();
  } catch {
    return '';
  }
}

function safeGh(args = []) {
  try {
    return JSON.parse(execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).trim() || '[]');
  } catch {
    return [];
  }
}

function walk(dir, files = []) {
  if (files.length >= NODE_LIMIT) return files;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  entries
    .filter(entry => !IGNORE_DIRS.has(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .forEach(entry => {
      if (files.length >= NODE_LIMIT) return;
      const abs = join(dir, entry.name);
      const rel = relative(ROOT, abs) || '.';
      if (entry.isDirectory()) {
        files.push({ path: rel, kind: 'dir', size: 0 });
        walk(abs, files);
        return;
      }
      if (!/\.(js|mjs|html|css|json|md|svg|webmanifest)$/i.test(entry.name)) return;
      let size = 0;
      try { size = statSync(abs).size; } catch {}
      files.push({ path: rel, kind: 'file', size });
    });
  return files;
}

function readText(filePath) {
  try { return readFileSync(join(ROOT, filePath), 'utf8'); } catch { return ''; }
}

function collectGit() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF || safeGit(['branch', '--show-current']) || 'unknown';
  const latestSha = process.env.VERCEL_GIT_COMMIT_SHA || safeGit(['rev-parse', '--short=12', 'HEAD']) || 'unknown';
  const latestMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE || safeGit(['log', '-1', '--pretty=%s']) || 'No commit metadata';
  const rawCommits = safeGit(['log', '--pretty=%h%x09%s%x09%cr', '-8']);
  const commits = rawCommits ? rawCommits.split('\n').map(line => {
    const [sha, subject, when] = line.split('\t');
    return { sha, subject, when };
  }) : [];
  const branches = safeGit(['branch', '--format=%(refname:short)'])
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 12);
  const pullRequests = safeGh(['pr', 'list', '--json', 'number,title,headRefName,state,url', '--limit', '10']);
  return {
    branch,
    latestSha,
    latestMessage,
    commits,
    branches,
    pullRequests,
    mode: latestSha === 'unknown' ? 'demo' : 'live',
  };
}

function collectProject() {
  const files = walk(ROOT).slice(0, NODE_LIMIT);
  const apiFiles = files.filter(file => file.path.startsWith('api/') && file.path.endsWith('.js'));
  const testFiles = files.filter(file => file.path.startsWith('test/') && file.path.endsWith('.test.js'));
  const packageJson = readText('package.json');
  const indexHtml = readText('index.html');
  const endpoints = apiFiles.map(file => ({
    path: file.path,
    route: `/${file.path.replace(/\.js$/, '')}`,
    methods: [...new Set((readText(file.path).match(/req\.method\s*===\s*['"]([A-Z]+)['"]/g) || [])
      .map(match => match.match(/['"]([A-Z]+)['"]/)?.[1])
      .filter(Boolean))],
  }));
  const testCases = testFiles.map(file => ({
    path: file.path,
    count: (readText(file.path).match(/\btest\s*\(/g) || []).length,
  }));
  return {
    files,
    endpoints,
    tests: testCases,
    packageName: (() => { try { return JSON.parse(packageJson).name || 'Coach Eye'; } catch { return 'Coach Eye'; } })(),
    appSurface: {
      hasMissionShortcut: /mission-control/.test(indexHtml),
      hasServiceWorker: /serviceWorker/.test(indexHtml),
    },
  };
}

async function collectRedis() {
  if (!kvConfigured()) {
    return {
      mode: 'demo',
      activeUsers: 0,
      memberCount: 0,
      playerProfileCount: 0,
      conversationCount: 0,
      messageCount: 0,
      messagesToday: 0,
      notificationCount: 0,
      notificationsToday: 0,
      conversations: [],
    };
  }

  try {
    const [users, members, profiles, conversations, subscriptions] = await Promise.all([
      kvGet(key('identity:users')).catch(() => []),
      kvGet(key('identity:team_members')).catch(() => []),
      kvGet(key('identity:player_profiles')).catch(() => []),
      kvGet(key('chat:convs')).catch(() => []),
      kvGet(key('subscriptions')).catch(() => []),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    let messageCount = 0;
    let messagesToday = 0;
    const convs = Array.isArray(conversations) ? conversations.slice(0, 40) : [];
    await Promise.all(convs.map(async conv => {
      const messages = await kvLrange(key(`chat:conv:${conv.id}:msgs`), 0, 199).catch(() => []);
      messageCount += messages.length;
      messagesToday += messages.filter(message => {
        const ts = Number(message?.ts || 0);
        if (!ts) return false;
        return new Date(ts).toISOString().slice(0, 10) === today;
      }).length;
    }));
    return {
      mode: 'live',
      activeUsers: Array.isArray(users) ? users.length : 0,
      memberCount: Array.isArray(members) ? members.filter(member => member.status === 'active').length : 0,
      playerProfileCount: Array.isArray(profiles) ? profiles.length : 0,
      conversationCount: convs.length,
      messageCount,
      messagesToday,
      notificationCount: Array.isArray(subscriptions) ? subscriptions.length : 0,
      notificationsToday: 0,
      conversations: convs.map(conv => ({ id: conv.id, name: conv.name, type: conv.type, participants: conv.participants || [] })),
    };
  } catch (error) {
    return { mode: 'demo', error: error.message };
  }
}

// ─── Market Intelligence — reads the JSON summary written by qa/market-intel-agent.js ──

function collectMarketIntel() {
  const summaryPath = join(ROOT, 'qa/market-reports/market-intel-summary.json');
  try {
    const raw = readFileSync(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Discovery Agent — reads the JSON summary written by qa/discovery/discovery.js ──

function collectDiscovery() {
  const summaryPath = join(ROOT, 'qa/discovery-state/discovery-summary.json');
  try {
    const raw = readFileSync(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Rugby Intelligence Agent — reads summary written by qa/rugby-intel/rugby-intel.js ──

function collectRugbyIntel() {
  const summaryPath = join(ROOT, 'qa/rugby-knowledge/rugby-intel-summary.json');
  try {
    const raw = readFileSync(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Rugby Coaching Assistant — reads activity summary from assistant data dir ──

function collectRugbyAssistant() {
  const summaryPath = join(ROOT, 'qa/rugby-assistant/data/assistant-summary.json');
  try {
    const raw = readFileSync(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Lead Personalisation — reads summary written by lead-personalisation.js ──

function collectLeadPersonalisation() {
  const summaryPath = join(ROOT, 'qa/lead-personalisation/data/personalisation-summary.json');
  try {
    const raw = readFileSync(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function node(id, label, type, meta = {}) {
  return { id, label, type, meta };
}

function link(source, target, type = 'relates') {
  return { source, target, type };
}

function buildGraph({ git, project, redis }) {
  const nodes = [
    node('project', 'Coach’s Eye', 'Core', { package: project.packageName }),
    node('git', 'Git', 'System', { branch: git.branch, latestSha: git.latestSha }),
    node('deployment', 'Deployment', 'Deployment', {
      status: process.env.VERCEL ? 'Vercel live context' : 'Local workspace',
      url: process.env.VERCEL_URL || '',
      env: process.env.VERCEL_ENV || 'local',
    }),
    node('tests', 'Test Matrix', 'Test', { suites: project.tests.length, cases: project.tests.reduce((n, suite) => n + suite.count, 0) }),
    node('api', 'API Surface', 'API', { endpoints: project.endpoints.length }),
    node('users', 'Users', 'User', { activeUsers: redis.activeUsers, members: redis.memberCount }),
    node('messages', 'Messages', 'Message', { conversations: redis.conversationCount, messages: redis.messageCount }),
    node('notifications', 'Notifications', 'Notification', { devices: redis.notificationCount }),
  ];
  const links = [
    link('project', 'git', 'versioned by'),
    link('project', 'deployment', 'deployed through'),
    link('project', 'tests', 'validated by'),
    link('project', 'api', 'served by'),
    link('api', 'users', 'resolves identity'),
    link('api', 'messages', 'moves chat'),
    link('api', 'notifications', 'sends alerts'),
    link('users', 'messages', 'participates in'),
    link('messages', 'notifications', 'triggers'),
  ];

  git.commits.slice(0, 8).forEach(commit => {
    nodes.push(node(`commit:${commit.sha}`, commit.sha, 'Commit', commit));
    links.push(link('git', `commit:${commit.sha}`, 'history'));
  });
  git.branches.slice(0, 8).forEach(branch => {
    nodes.push(node(`branch:${branch}`, branch, 'Branch', { current: branch === git.branch }));
    links.push(link('git', `branch:${branch}`, 'branch'));
  });
  git.pullRequests.slice(0, 8).forEach(pr => {
    nodes.push(node(`pr:${pr.number}`, `PR #${pr.number}`, 'Pull Request', pr));
    links.push(link('git', `pr:${pr.number}`, 'review'));
  });
  project.endpoints.slice(0, 26).forEach(endpoint => {
    nodes.push(node(`api:${endpoint.route}`, endpoint.route, 'API', endpoint));
    links.push(link('api', `api:${endpoint.route}`, 'route'));
  });
  project.tests.slice(0, 20).forEach(suite => {
    nodes.push(node(`test:${suite.path}`, suite.path.replace(/^test\//, ''), 'Test', suite));
    links.push(link('tests', `test:${suite.path}`, 'suite'));
  });
  project.files
    .filter(file => file.kind === 'file')
    .slice(0, 60)
    .forEach(file => {
      const type = file.path.startsWith('api/') ? 'API File' : file.path.startsWith('test/') ? 'Test File' : 'File';
      nodes.push(node(`file:${file.path}`, file.path.split('/').at(-1), type, file));
      links.push(link('project', `file:${file.path}`, 'contains'));
      if (file.path.startsWith('api/')) links.push(link(`file:${file.path}`, 'api', 'implements'));
      if (file.path.startsWith('test/')) links.push(link(`file:${file.path}`, 'tests', 'asserts'));
    });
  redis.conversations?.slice(0, 24).forEach(conv => {
    nodes.push(node(`conversation:${conv.id}`, conv.name || conv.id, 'Conversation', conv));
    links.push(link('messages', `conversation:${conv.id}`, 'stores'));
  });

  return { nodes, links };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    await requireTenantRole(req, ['coach', 'admin']);
  } catch (error) {
    return authError(res, error);
  }

  // Market Intelligence summary — reads pre-generated JSON from the agent
  if (req.query?.action === 'market-intel') {
    const marketIntel = collectMarketIntel();
    return json(res, 200, { ok: true, marketIntel });
  }

  // Discovery Agent summary — reads pre-generated JSON from the discovery agent
  if (req.query?.action === 'discovery') {
    const discovery = collectDiscovery();
    return json(res, 200, { ok: true, discovery });
  }

  // Rugby Intelligence Agent summary — reads pre-generated JSON from rugby-intel pipeline
  if (req.query?.action === 'rugby-intel') {
    const rugbyIntel = collectRugbyIntel();
    return json(res, 200, { ok: true, rugbyIntel });
  }

  // Rugby Coaching Assistant — reads activity summary from assistant data dir
  if (req.query?.action === 'rugby-assistant') {
    const rugbyIntel    = collectRugbyIntel();
    const assistantData = collectRugbyAssistant();
    return json(res, 200, { ok: true, rugbyIntel, assistantData });
  }

  // Lead Personalisation — reads summary written by lead-personalisation pipeline
  if (req.query?.action === 'lead-personalise') {
    const leadData = collectLeadPersonalisation();
    return json(res, 200, { ok: true, leadData });
  }

  const git = collectGit();
  const project = collectProject();
  const redis = await collectRedis();
  const graph = buildGraph({ git, project, redis });
  json(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    mode: redis.mode === 'live' || git.mode === 'live' ? 'live' : 'demo',
    git,
    project,
    redis,
    graph,
    metrics: {
      branch: git.branch,
      latestCommit: git.latestSha,
      latestCommitMessage: git.latestMessage,
      deploymentStatus: process.env.VERCEL ? 'READY' : 'LOCAL',
      activeUsers: redis.activeUsers || 0,
      messagesToday: redis.messagesToday || 0,
      notificationsToday: redis.notificationsToday || 0,
    },
  });
}
