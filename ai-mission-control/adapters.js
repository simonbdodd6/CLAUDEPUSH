export const GRAPH_DOMAINS = [
  'Repository',
  'Commits',
  'Files',
  'Tests',
  'Deployments',
  'AI Tasks',
  'Builds',
  'Structure',
];

export function createAIOpsMockAdapter({ makeNode, makeEdge }) {
  return {
    id: 'mock-ai-ops-network',
    label: 'AI Operations Mock Network',
    domains: GRAPH_DOMAINS,
    load() {
      const nodes = [];
      const edges = [];
      const add = (...args) => { const node = makeNode(...args); nodes.push(node); return node; };

      const repo = add('repo-main', 'Repository Core', 'Repository', 0, 0, 24, {
        status: 'Read-only observer',
        load: '99%',
        branch: 'main',
      });

      const structure = [
        add('dir-api', '/api', 'Structure', -430, -260, 15, { status: 'Server routes', files: '12' }),
        add('dir-src', '/src', 'Structure', -210, -350, 15, { status: 'State modules', files: '6' }),
        add('dir-test', '/test', 'Structure', 210, -350, 15, { status: 'Regression suites', files: '9' }),
        add('dir-public', '/public', 'Structure', 430, -260, 15, { status: 'Static assets', files: '18' }),
        add('dir-tools', '/ai-mission-control', 'Structure', 0, -470, 16, { status: 'Standalone ops dashboard', files: '6' }),
      ];

      structure.forEach(dir => {
        edges.push(makeEdge(repo.id, dir.id, 'contains', 1.3));
      });

      const systems = [
        add('sys-commits', 'Commit Stream', 'Commits', -530, 10, 17, { status: '8 recent commits indexed', load: '82%' }),
        add('sys-files', 'File Delta Map', 'Files', -310, 250, 17, { status: 'Modified files tracked', load: '76%' }),
        add('sys-tests', 'Test Matrix', 'Tests', 0, 340, 18, { status: '40 passing tests', load: '94%' }),
        add('sys-deploy', 'Deployment Radar', 'Deployments', 330, 245, 17, { status: 'Preview channel online', load: '71%' }),
        add('sys-ai', 'AI Task Cortex', 'AI Tasks', 530, 0, 18, { status: 'Planning and code review active', load: '89%' }),
        add('sys-builds', 'Build Pipeline', 'Builds', 0, 150, 16, { status: 'Static app build clean', load: '68%' }),
      ];

      systems.forEach(system => {
        edges.push(makeEdge(repo.id, system.id, 'signal', 1.5));
        edges.push(makeEdge(system.id, structure[systems.indexOf(system) % structure.length].id, 'observes', 1.1));
      });

      const commits = [
        ['c-2e8c798', '2e8c798 messaging restore', 'Direct message notification repair', 'main'],
        ['c-91c7f5e', '91c7f5e stable baseline', 'Production stable checkpoint', 'main'],
        ['c-4945c7f', '4945c7f auth guards', 'Firebase guard phase', 'backup/phase1-auth-guards'],
        ['c-a11y-742', 'a11y-742 modal focus', 'New Message picker focus fix', 'preview'],
        ['c-layout-215', 'layout-215 panel geometry', 'Dashboard layout refinement', 'preview'],
        ['c-ui-908', 'ui-908 workspace cleanup', 'Interface consolidation', 'preview'],
        ['c-ident-311', 'ident-311 session model', 'Identity foundation skeleton', 'preview'],
        ['c-ops-001', 'ops-001 dashboard', 'AI Mission Control standalone', 'local'],
      ];

      commits.forEach((commit, index) => {
        const angle = -2.85 + index * 0.42;
        const node = add(commit[0], commit[1], 'Commits', Math.cos(angle) * 720, Math.sin(angle) * 300 + 35, 10, {
          status: commit[2],
          branch: commit[3],
          load: `${64 + index * 4}%`,
        });
        edges.push(makeEdge(node.id, 'sys-commits', 'commit', 1.15));
        edges.push(makeEdge(node.id, structure[index % structure.length].id, 'touches', 0.82));
      });

      const files = [
        ['file-index', 'index.html', 'Main monolith surface', '/'],
        ['file-chat', 'src/chat-state.js', 'Messaging state helpers', '/src'],
        ['file-auth', 'api/_auth.js', 'Auth guard helpers', '/api'],
        ['file-chat-api', 'api/chat.js', 'Server message route', '/api'],
        ['file-push', 'api/push.js', 'Push delivery API', '/api'],
        ['file-identity', 'api/identity.js', 'Identity skeleton', '/api'],
        ['file-tests-chat', 'test/chat-state.test.js', 'Messaging regression tests', '/test'],
        ['file-tests-push', 'test/push-system.test.js', 'Push test harness', '/test'],
        ['file-tests-ops', 'test/ai-mission-control.test.js', 'Ops dashboard tests', '/test'],
        ['file-package', 'package.json', 'Root scripts and deps', '/'],
        ['file-vercel', 'vercel.json', 'Preview and platform config', '/'],
        ['file-dashboard', 'ai-mission-control/app.js', 'Animated graph runtime', '/ai-mission-control'],
      ];

      files.forEach((file, index) => {
        const ring = index % 2 ? 650 : 560;
        const angle = (index / files.length) * Math.PI * 2 + 0.28;
        const node = add(file[0], file[1], 'Files', Math.cos(angle) * ring, Math.sin(angle) * ring * 0.58 + 55, 8.5, {
          status: file[2],
          path: file[3],
          load: `${38 + ((index * 9) % 54)}%`,
        });
        edges.push(makeEdge(node.id, 'sys-files', 'file', 0.9));
        edges.push(makeEdge(node.id, structure[index % structure.length].id, 'located in', 0.75));
        if (index % 3 === 0) edges.push(makeEdge(node.id, 'sys-tests', 'covered by', 0.9));
      });

      const tests = [
        ['test-chat', 'Chat regression suite', 'PASS 21 checks', 21],
        ['test-identity', 'Identity helper suite', 'PASS 11 checks', 11],
        ['test-push', 'Notification suite', 'PASS 4 checks', 4],
        ['test-api', 'API contract suite', 'PASS 2 checks', 2],
        ['test-ops', 'Ops dashboard suite', 'PASS 3 checks', 3],
      ];

      tests.forEach((suite, index) => {
        const x = -360 + index * 180;
        const node = add(suite[0], suite[1], 'Tests', x, 540, 11.5, {
          status: suite[2],
          checks: String(suite[3]),
          load: '100%',
        });
        edges.push(makeEdge(node.id, 'sys-tests', 'asserts', 1.2));
        edges.push(makeEdge(node.id, files[(index + 6) % files.length][0], 'covers', 0.86));
      });

      const deployments = [
        ['deploy-preview', 'Preview Deployment', 'READY · latest local branch', 1.35],
        ['deploy-prod', 'Production Deployment', 'Protected · not touched', 0.72],
        ['deploy-build-cache', 'Build Cache', 'Warm cache available', 0.9],
        ['deploy-vercel', 'Vercel Project Link', 'Preview channel configured', 1.1],
      ];

      deployments.forEach((deployment, index) => {
        const node = add(deployment[0], deployment[1], 'Deployments', 500 + Math.cos(index) * 190, 300 + index * 78, 12, {
          status: deployment[2],
          load: `${Math.round(deployment[3] * 58)}%`,
        });
        edges.push(makeEdge(node.id, 'sys-deploy', 'deploy', deployment[3]));
        edges.push(makeEdge(node.id, 'sys-builds', 'artifact', 0.95));
      });

      const tasks = [
        ['task-audit', 'Forensic Architecture Audit', 'Completed', 'analysis'],
        ['task-messaging', 'Message Stability Fixes', 'Validated', 'implementation'],
        ['task-auth', 'Auth Foundation Planning', 'Paused safely', 'planning'],
        ['task-layout', 'Workspace Layout Review', 'Preview tested', 'ui'],
        ['task-cleanup', 'Interface Consolidation', 'UI local state', 'ui'],
        ['task-ops', 'Standalone AI Ops Center', 'Active now', 'implementation'],
        ['task-risk', 'Risk Scanner', 'Watching uncommitted work', 'diagnostic'],
        ['task-preview', 'Preview Verifier', 'Ready for localhost checks', 'verification'],
      ];

      tasks.forEach((task, index) => {
        const angle = -0.75 + index * 0.34;
        const node = add(task[0], task[1], 'AI Tasks', Math.cos(angle) * 680, Math.sin(angle) * 350 - 35, 10.5, {
          status: task[2],
          mode: task[3],
          load: `${58 + ((index * 11) % 37)}%`,
        });
        edges.push(makeEdge(node.id, 'sys-ai', 'task', 1.05));
        edges.push(makeEdge(node.id, systems[index % systems.length].id, 'coordinates', 0.82));
      });

      const builds = [
        ['build-install', 'Install Dependencies', 'up to date', -190, 55],
        ['build-test', 'Run Tests', '40 passing', -75, 75],
        ['build-bundle', 'Static Bundle', 'syntax clean', 70, 75],
        ['build-preview', 'Preview Publish', 'standalone local target', 190, 55],
      ];

      builds.forEach((build, index) => {
        const node = add(build[0], build[1], 'Builds', build[3], 465 + build[4], 10, {
          status: build[2],
          load: `${76 + index * 6}%`,
        });
        edges.push(makeEdge(node.id, 'sys-builds', 'stage', 1.15));
        if (index > 0) edges.push(makeEdge(builds[index - 1][0], node.id, 'pipeline', 1.35));
      });

      return { nodes, edges, adapter: this.id };
    },
  };
}
