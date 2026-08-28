/**
 * installDemoSquad must never inject a fabricated roster into a real club.
 *
 * The function REPLACES state.players with 30 invented players, sets a
 * Match Centre fixture ("Kituro RFC"), fills the starting XV and bench, and
 * then saveState()s the result. On a real club's device that overwrites their
 * squad with fiction and persists it.
 *
 * Its guard was _isLocalDemoHost(), which tests location.hostname ALONE — so
 * every packaged origin qualified: capacitor://localhost (iOS),
 * http://localhost (Android) and ionic://localhost. Production and Vercel
 * preview were already refused by hostname; native runtimes were not.
 *
 * It now shares perfDemoDataAllowed() with the Performance fixtures: the
 * boundary ("an explicitly permitted development environment") is the same
 * question, so there is one definition of it rather than two.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start)), d = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') d++;
    else if (src[b] === '}') { d--; if (!d) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}
const codeOnly = body => body.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/**
 * Run the REAL guard in a simulated environment and report whether the
 * installer's body would be reached.
 */
function wouldInstall({ hostname = '', protocol = 'https:', devLogin = false,
                        native = null, query = '?demo' } = {}) {
  return new Function('hostname', 'protocol', 'devLogin', 'native', 'query', `
    "use strict";
    const location = { hostname, protocol, search: query, hash: '' };
    const window = { _devLoginEnabled: devLogin };
    if (native === 'capacitor') window.Capacitor = { isNativePlatform: () => true };
    if (native === 'cordova') window.cordova = {};
    ${fn('perfDemoDataAllowed')}
    // The installer's first statement, in isolation.
    let reached = false;
    (function installProbe() {
      if (!perfDemoDataAllowed()) return;
      reached = true;
    })();
    return reached;
  `)(hostname, protocol, devLogin, native, query);
}

const DEV = { hostname: 'localhost', protocol: 'http:', devLogin: true };

// ─── The one environment that may install ───────────────────────────────────

test('SQUAD-1: genuine local development keeps the ?demo workflow', () => {
  assert.equal(wouldInstall(DEV), true, 'the developer workflow is preserved');
  assert.equal(wouldInstall({ ...DEV, hostname: '127.0.0.1' }), true);
  assert.equal(wouldInstall({ ...DEV, hostname: '0.0.0.0' }), true);
});

// ─── Everything else must refuse ────────────────────────────────────────────

test('SQUAD-2: production can never install a fabricated squad', () => {
  assert.equal(wouldInstall({ hostname: 'www.coacheasier.com', protocol: 'https:', devLogin: false }), false);
  // Even a production deployment misconfigured with DEV_LOGIN is refused: the
  // origin is not local.
  assert.equal(wouldInstall({ hostname: 'www.coacheasier.com', protocol: 'https:', devLogin: true }), false);
});

test('SQUAD-3: Vercel preview deployments can never install one', () => {
  assert.equal(wouldInstall({ hostname: 'boitsfort-abc.vercel.app', protocol: 'https:', devLogin: false }), false);
  assert.equal(wouldInstall({ hostname: 'boitsfort-abc.vercel.app', protocol: 'https:', devLogin: true }), false);
});

test('SQUAD-4: no packaged/native runtime can install one — this is the gap that was open', () => {
  // iOS: capacitor:// scheme.
  assert.equal(wouldInstall({ hostname: 'localhost', protocol: 'capacitor:', devLogin: true }), false);
  // Ionic scheme.
  assert.equal(wouldInstall({ hostname: 'localhost', protocol: 'ionic:', devLogin: true }), false);
  // file:// packaging.
  assert.equal(wouldInstall({ hostname: '', protocol: 'file:', devLogin: true }), false);
  // ANDROID is the one no protocol/hostname test can catch: Capacitor serves
  // http://localhost. The runtime itself is asked.
  assert.equal(wouldInstall({ hostname: 'localhost', protocol: 'http:', devLogin: true, native: 'capacitor' }), false,
    'a packaged Android build must never overwrite a real squad');
  assert.equal(wouldInstall({ hostname: 'localhost', protocol: 'http:', devLogin: true, native: 'cordova' }), false);
});

test('SQUAD-5: localhost alone is not enough — the explicit switch is required', () => {
  assert.equal(wouldInstall({ hostname: 'localhost', protocol: 'http:', devLogin: false }), false);
  assert.equal(wouldInstall({ hostname: 'localhost', protocol: 'http:', devLogin: undefined }), false,
    'a missing flag must not be truthy-coerced');
});

// ─── The query parameter cannot be used to get around it ───────────────────

test('SQUAD-6: no ?demo spelling bypasses the guard', () => {
  const prod = { hostname: 'www.coacheasier.com', protocol: 'https:', devLogin: false };
  for (const query of ['?demo', '?DEMO', '?x=1&demo', '#demo', '?demo=1', '?demo&demo', '']) {
    assert.equal(wouldInstall({ ...prod, query }), false,
      `production must refuse regardless of query (${query || 'none'})`);
  }
  // The guard is evaluated BEFORE the query is even considered at the call site.
  // Anchor on the trigger itself — the phrase "TEMPORARY DEMO SQUAD" also heads
  // the block comment and appears in the roster-sync guard.
  const trig = src.indexOf('setTimeout(installDemoSquad, 450)');
  assert.ok(trig > -1, 'the ?demo auto-install trigger exists');
  const boot = src.slice(trig - 400, trig + 60);
  assert.match(boot, /if \(perfDemoDataAllowed\(\) &&/,
    'the environment is checked first, the query second');
  assert.ok(boot.indexOf('perfDemoDataAllowed') < boot.indexOf('demo\\b'),
    'the guard is the left operand, so the query is never even parsed outside development');
});

test('SQUAD-7: the installer refuses independently of its caller', () => {
  // Defence in depth: the trigger is gated AND the installer re-checks, so being
  // called from the console, a bookmarklet or any other path is still refused.
  const installer = codeOnly(fn('installDemoSquad'));
  assert.match(installer, /if \(!perfDemoDataAllowed\(\)\)/, 'the installer has its own guard');
  assert.ok(installer.indexOf('perfDemoDataAllowed') < installer.indexOf('state.players ='),
    'the guard returns before any state is written');
  assert.match(installer, /return;/, 'and it returns rather than continuing');
});

// ─── One definition of the boundary ─────────────────────────────────────────

test('SQUAD-8: one shared rule, not a second competing definition', () => {
  assert.equal((src.match(/function perfDemoDataAllowed\s*\(/g) || []).length, 1,
    'exactly one definition of the safe-demo boundary');
  // Every path that can write fabricated data uses it.
  for (const f of ['installDemoSquad', 'perfDashboardHtml', 'perfAnalyticsHtml', 'perfWkAssignment']) {
    assert.match(codeOnly(fn(f)), /perfDemoDataAllowed\(\)/, `${f} must use the shared rule`);
  }
  // The hostname-only helper survives ONLY for premium nav visibility, which is
  // presentation and is gated again by the renderer's mandatory entitlement check.
  const remaining = src.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /_isLocalDemoHost\(\)/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/function _isLocalDemoHost/.test(l));
  assert.equal(remaining.length, 1, `only the nav-visibility site may remain, found ${remaining.length}`);
  assert.match(remaining[0][1], /BETA_HIDE_COMMERCIAL/, 'and that site is the sidebar visibility one');
});

test('SQUAD-9: entitlement and real roster behaviour are untouched', () => {
  // The premium gate is unchanged and independent of demo state.
  const render = src.slice(src.indexOf('function renderPerformance'), src.indexOf('function perfDashboardEmptyHtml'));
  assert.match(render, /if \(!canUseFeature\('performance'\)\)/, 'premium gate intact');
  // The demo installer still flags itself so the roster sync stays frozen —
  // a demo squad must never be pushed to a server.
  assert.match(fn('installDemoSquad'), /window\.__DEMO_SQUAD__ = true/, 'demo roster is never synced');
  assert.match(fn('queueRosterSync'), /__DEMO_SQUAD__/, 'the sync still refuses demo data');
});
