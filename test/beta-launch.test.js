import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found in source`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function extractArrayConst(name) {
  const start = src.indexOf(`const ${name} = [`);
  if (start === -1) throw new Error(`Array const ${name} not found`);
  let depth = 0, i = start + `const ${name} = `.length;
  while (i < src.length) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return src.slice(start, i) + ';';
}

function extractStringConst(name) {
  const pattern = new RegExp(`const ${name}\\s*=\\s*'([^']*)'`);
  const m = src.match(pattern);
  if (!m) throw new Error(`String const ${name} not found`);
  return `const ${name} = '${m[1]}';`;
}

function buildScope() {
  const consts = [
    extractStringConst('BETA_APP_VERSION'),
    extractArrayConst('BETA_COMPLETED_PHASES'),
    extractArrayConst('BETA_KNOWN_LIMITATIONS'),
    extractArrayConst('BETA_SUPPORT_INSTRUCTIONS'),
  ].join('\n');

  const fns = [
    'betaVersionLabel',
    'betaPhaseSummaryText',
    'betaDiagnosticsText',
  ].map(extractFn).join('\n');

  const body = `
    "use strict";
    ${consts}
    ${fns}
    return {
      BETA_APP_VERSION, BETA_COMPLETED_PHASES, BETA_KNOWN_LIMITATIONS,
      BETA_SUPPORT_INSTRUCTIONS,
      betaVersionLabel, betaPhaseSummaryText, betaDiagnosticsText,
    };
  `;
  return new Function(body)();
}

// ── betaVersionLabel ──────────────────────────────────────────────────────────

test('betaVersionLabel: prepends v to version string', () => {
  const { betaVersionLabel } = buildScope();
  assert.equal(betaVersionLabel('1.0.0'), 'v1.0.0');
});

test('betaVersionLabel: uses BETA_APP_VERSION when no arg', () => {
  const { betaVersionLabel, BETA_APP_VERSION } = buildScope();
  const label = betaVersionLabel(undefined);
  assert.ok(label.startsWith('v'), 'must start with v');
  assert.ok(label.includes(BETA_APP_VERSION), 'must include the app version string');
});

test('betaVersionLabel: handles numeric-string version', () => {
  const { betaVersionLabel } = buildScope();
  assert.equal(betaVersionLabel('28.0.0-beta'), 'v28.0.0-beta');
});

test('betaVersionLabel: output is deterministic for same input', () => {
  const { betaVersionLabel } = buildScope();
  assert.equal(betaVersionLabel('1.2.3'), betaVersionLabel('1.2.3'));
});

// ── betaPhaseSummaryText ──────────────────────────────────────────────────────

test('betaPhaseSummaryText: includes app title', () => {
  const { betaPhaseSummaryText } = buildScope();
  const text = betaPhaseSummaryText([], '1.0.0', '2026-07-01');
  assert.ok(text.includes("Coach's Eye"));
});

test('betaPhaseSummaryText: includes version label', () => {
  const { betaPhaseSummaryText } = buildScope();
  const text = betaPhaseSummaryText([], '1.0.0', '2026-07-01');
  assert.ok(text.includes('v1.0.0'));
});

test('betaPhaseSummaryText: includes provided date', () => {
  const { betaPhaseSummaryText } = buildScope();
  const text = betaPhaseSummaryText([], '1.0.0', '2026-07-15');
  assert.ok(text.includes('2026-07-15'));
});

test('betaPhaseSummaryText: empty phases shows 0 completed', () => {
  const { betaPhaseSummaryText } = buildScope();
  const text = betaPhaseSummaryText([], '1.0.0', '2026-07-01');
  assert.ok(text.includes('Completed phases: 0'));
});

test('betaPhaseSummaryText: each phase appears with checkmark', () => {
  const { betaPhaseSummaryText } = buildScope();
  const phases = [
    { phase: 'Phase 16', name: 'Club OS',      desc: 'Club profile, teams' },
    { phase: 'Phase 17', name: 'Player Lifecycle', desc: 'Lifecycle status' },
  ];
  const text = betaPhaseSummaryText(phases, '1.0.0', '2026-07-01');
  assert.ok(text.includes('✅ Phase 16'));
  assert.ok(text.includes('✅ Phase 17'));
  assert.ok(text.includes('Club OS'));
  assert.ok(text.includes('Completed phases: 2'));
});

test('betaPhaseSummaryText: output is deterministic for identical inputs', () => {
  const { betaPhaseSummaryText } = buildScope();
  const phases = [{ phase: 'Phase 16', name: 'Club OS', desc: 'Club profile' }];
  const a = betaPhaseSummaryText(phases, '1.0.0', '2026-07-01');
  const b = betaPhaseSummaryText(phases, '1.0.0', '2026-07-01');
  assert.equal(a, b);
});

test('betaPhaseSummaryText: does not mutate input phases array', () => {
  const { betaPhaseSummaryText } = buildScope();
  const phases = [{ phase: 'Phase 16', name: 'Club OS', desc: 'desc' }];
  const before = JSON.stringify(phases);
  betaPhaseSummaryText(phases, '1.0.0', '2026-07-01');
  assert.equal(JSON.stringify(phases), before);
});

test('betaPhaseSummaryText: null phases treated as empty', () => {
  const { betaPhaseSummaryText } = buildScope();
  const text = betaPhaseSummaryText(null, '1.0.0', '2026-07-01');
  assert.ok(text.includes('Completed phases: 0'));
});

// ── betaDiagnosticsText ───────────────────────────────────────────────────────

test('betaDiagnosticsText: includes app title', () => {
  const { betaDiagnosticsText } = buildScope();
  const text = betaDiagnosticsText({});
  assert.ok(text.includes("Coach's Eye"));
});

test('betaDiagnosticsText: includes all required fields', () => {
  const { betaDiagnosticsText } = buildScope();
  const text = betaDiagnosticsText({
    version:   '1.0.0',
    today:     '2026-07-01',
    ua:        'Mozilla/5.0 Test',
    screen:    '1440x900',
    view:      'coach/overview',
    role:      'coach',
    clubName:  'Harlequins RFC',
    teamName:  'Seniors',
    storage:   '14 KB (estimate)',
    notifPerm: 'granted',
  });
  assert.ok(text.includes('v1.0.0'));
  assert.ok(text.includes('2026-07-01'));
  assert.ok(text.includes('Mozilla/5.0 Test'));
  assert.ok(text.includes('1440x900'));
  assert.ok(text.includes('coach/overview'));
  assert.ok(text.includes('coach'));
  assert.ok(text.includes('Harlequins RFC'));
  assert.ok(text.includes('Seniors'));
  assert.ok(text.includes('14 KB (estimate)'));
  assert.ok(text.includes('granted'));
});

test('betaDiagnosticsText: missing fields show (unavailable) or (not set)', () => {
  const { betaDiagnosticsText } = buildScope();
  const text = betaDiagnosticsText({});
  assert.ok(text.includes('(unavailable)') || text.includes('(not set)'));
});

test('betaDiagnosticsText: club/team not set shown explicitly', () => {
  const { betaDiagnosticsText } = buildScope();
  const text = betaDiagnosticsText({ clubName: '', teamName: '' });
  assert.ok(text.includes('(not set)'));
});

test('betaDiagnosticsText: output is deterministic for identical inputs', () => {
  const { betaDiagnosticsText } = buildScope();
  const opts = { version: '1.0.0', today: '2026-07-01', ua: 'Chrome', screen: '1280x720',
                 view: 'coach/overview', role: 'coach', clubName: 'Club', teamName: 'Team',
                 storage: '10 KB', notifPerm: 'denied' };
  assert.equal(betaDiagnosticsText(opts), betaDiagnosticsText(opts));
});

test('betaDiagnosticsText: does not mutate input opts', () => {
  const { betaDiagnosticsText } = buildScope();
  const opts   = { version: '1.0.0', today: '2026-07-01', clubName: 'Club' };
  const before = JSON.stringify(opts);
  betaDiagnosticsText(opts);
  assert.equal(JSON.stringify(opts), before);
});

// ── BETA_COMPLETED_PHASES integrity ───────────────────────────────────────────

test('BETA_COMPLETED_PHASES: each entry has phase, name, desc', () => {
  const { BETA_COMPLETED_PHASES } = buildScope();
  assert.ok(BETA_COMPLETED_PHASES.length >= 5, 'must have at least 5 completed phases');
  BETA_COMPLETED_PHASES.forEach(p => {
    assert.ok(typeof p.phase === 'string' && p.phase.length > 0, 'phase must be non-empty string');
    assert.ok(typeof p.name  === 'string' && p.name.length  > 0, 'name must be non-empty string');
    assert.ok(typeof p.desc  === 'string' && p.desc.length  > 0, 'desc must be non-empty string');
  });
});

test('BETA_COMPLETED_PHASES: no duplicate phase identifiers', () => {
  const { BETA_COMPLETED_PHASES } = buildScope();
  const phases = BETA_COMPLETED_PHASES.map(p => p.phase);
  assert.equal(new Set(phases).size, phases.length, 'all phase identifiers must be unique');
});

test('BETA_COMPLETED_PHASES: does not reference Simon Test Player', () => {
  const { BETA_COMPLETED_PHASES } = buildScope();
  const str = JSON.stringify(BETA_COMPLETED_PHASES);
  assert.ok(!str.toLowerCase().includes('simon'), 'phases must not reference simon test player');
  assert.ok(!str.includes('coach-demo'), 'phases must not reference coach-demo id');
});

// ── BETA_KNOWN_LIMITATIONS integrity ─────────────────────────────────────────

test('BETA_KNOWN_LIMITATIONS: is a non-empty array of strings', () => {
  const { BETA_KNOWN_LIMITATIONS } = buildScope();
  assert.ok(Array.isArray(BETA_KNOWN_LIMITATIONS));
  assert.ok(BETA_KNOWN_LIMITATIONS.length >= 3, 'must have at least 3 known limitations');
  BETA_KNOWN_LIMITATIONS.forEach(lim => {
    assert.ok(typeof lim === 'string' && lim.length > 0, 'each limitation must be a non-empty string');
  });
});

test('BETA_KNOWN_LIMITATIONS: no duplicate entries', () => {
  const { BETA_KNOWN_LIMITATIONS } = buildScope();
  assert.equal(new Set(BETA_KNOWN_LIMITATIONS).size, BETA_KNOWN_LIMITATIONS.length);
});

// ── BETA_SUPPORT_INSTRUCTIONS integrity ───────────────────────────────────────

test('BETA_SUPPORT_INSTRUCTIONS: is a non-empty array of strings', () => {
  const { BETA_SUPPORT_INSTRUCTIONS } = buildScope();
  assert.ok(Array.isArray(BETA_SUPPORT_INSTRUCTIONS));
  assert.ok(BETA_SUPPORT_INSTRUCTIONS.length >= 3, 'must have at least 3 support instructions');
  BETA_SUPPORT_INSTRUCTIONS.forEach(inst => {
    assert.ok(typeof inst === 'string' && inst.length > 0, 'each instruction must be non-empty string');
  });
});

// ── BETA_APP_VERSION ──────────────────────────────────────────────────────────

test('BETA_APP_VERSION: is a non-empty string', () => {
  const { BETA_APP_VERSION } = buildScope();
  assert.ok(typeof BETA_APP_VERSION === 'string' && BETA_APP_VERSION.length > 0);
});

test('BETA_APP_VERSION: contains beta indicator', () => {
  const { BETA_APP_VERSION } = buildScope();
  assert.ok(
    BETA_APP_VERSION.toLowerCase().includes('beta') ||
    BETA_APP_VERSION.includes('-'),
    'version string should indicate beta status'
  );
});

// ── Source-level checks ───────────────────────────────────────────────────────

test('beta nav entry exists in coachSections', () => {
  assert.ok(src.includes('"beta"') && src.includes('"Beta Info"'),
    'coachSections must include [\"beta\", \"Beta Info\"] entry');
});

test('coach-beta section div exists in HTML', () => {
  assert.ok(src.includes('id="coach-beta"'), 'HTML must have coach-beta section div');
});

test('safeRender call for coach-beta exists', () => {
  assert.ok(src.includes("safeRender('coach-beta'") && src.includes('renderBetaLaunch()'),
    'must have safeRender call for coach-beta');
});

test('betaBuildDiagnosticsOpts function exists in source', () => {
  assert.ok(src.includes('function betaBuildDiagnosticsOpts'),
    'betaBuildDiagnosticsOpts must be defined');
});

test('betaCopyDiagnostics function exists in source', () => {
  assert.ok(src.includes('function betaCopyDiagnostics'),
    'betaCopyDiagnostics must be defined');
});

test('no new API files introduced', () => {
  const apiFiles = fs.readdirSync(new URL('../api', import.meta.url))
    .filter(f => f.endsWith('.js'));
  apiFiles.forEach(f => {
    const apiSrc = fs.readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
    assert.ok(!apiSrc.includes('betaDiagnosticsText'),
      `API file ${f} must not contain beta launch helpers`);
  });
});

// ── Integration: real BETA_COMPLETED_PHASES through summary ───────────────────

test('integration: betaPhaseSummaryText with real BETA_COMPLETED_PHASES', () => {
  const { BETA_COMPLETED_PHASES, betaPhaseSummaryText } = buildScope();
  const text = betaPhaseSummaryText(BETA_COMPLETED_PHASES, '28.0.0-beta', '2026-07-01');
  assert.ok(text.includes('Completed phases: ' + BETA_COMPLETED_PHASES.length));
  BETA_COMPLETED_PHASES.forEach(p => {
    assert.ok(text.includes(p.phase), `text must include ${p.phase}`);
  });
});

test('integration: betaDiagnosticsText with populated opts produces structured output', () => {
  const { betaDiagnosticsText } = buildScope();
  const text = betaDiagnosticsText({
    version: '28.0.0-beta', today: '2026-07-01',
    ua: 'Test Browser 1.0', screen: '390x844',
    view: 'coach/calendar', role: 'coach',
    clubName: 'Test Club', teamName: 'Seniors',
    storage: '22 KB (estimate)', notifPerm: 'default',
  });
  const lines = text.split('\n');
  assert.ok(lines.length >= 10, 'diagnostics block must have at least 10 lines');
  assert.ok(lines[0].includes("Coach's Eye"), 'first line must be the app title');
});
