/**
 * Fabricated Performance data must never reach a real club.
 *
 * PERF_SAMPLE_ATHLETES/PROGRAMMES/TODAY/METRICS/ACTIVITY are development
 * fixtures: invented names, invented readiness and adherence scores, invented
 * injury statuses ("modified", "unavailable"), an invented PB and an invented
 * "hamstring tightness" note. Rendered to a real club they are indistinguishable
 * from that club's own data.
 *
 * Two exposures existed:
 *   · perfDashboardHtml() was gated on _isLocalDemoHost(), which tests the
 *     HOSTNAME alone — so capacitor://localhost, and any future localhost-shaped
 *     origin, would have qualified.
 *   · perfAnalyticsHtml() had NO environment gate whatsoever. Fabricated squad
 *     averages rendered for every entitled club in production, carrying only a
 *     "Preview — sample data" pill. That was the live one.
 *
 * The rule now: fabricated material requires the SERVER to declare a development
 * deployment (DEV_LOGIN, which DEPLOY.md forbids in production), a non-native
 * runtime, and a genuinely local origin. It fails closed.
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

/** Evaluate the REAL predicate in a simulated environment. */
function allowed({ hostname = '', protocol = 'https:', devLogin = false, native = null } = {}) {
  return new Function('hostname', 'protocol', 'devLogin', 'native', `
    "use strict";
    const location = { hostname, protocol };
    const window = { _devLoginEnabled: devLogin };
    if (native === 'capacitor') window.Capacitor = { isNativePlatform: () => true };
    if (native === 'cordova') window.cordova = {};
    ${fn('perfDemoDataAllowed')}
    return perfDemoDataAllowed();
  `)(hostname, protocol, devLogin, native);
}

const PROD = { hostname: 'www.coacheasier.com', protocol: 'https:' };
const PREVIEW = { hostname: 'boitsfort-coachseye-abc.vercel.app', protocol: 'https:' };

// ─── 1-3: the environments that must NEVER see fabricated data ──────────────

test('DEMO-1: production can never receive fabricated Performance data', () => {
  assert.equal(allowed({ ...PROD, devLogin: false }), false);
  // Even if DEV_LOGIN were mistakenly set in production, the origin is not local.
  assert.equal(allowed({ ...PROD, devLogin: true }), false,
    'a misconfigured production deployment still shows nothing invented');
});

test('DEMO-2: Vercel preview deployments can never receive fabricated data', () => {
  assert.equal(allowed({ ...PREVIEW, devLogin: false }), false);
  assert.equal(allowed({ ...PREVIEW, devLogin: true }), false,
    'a preview with DEV_LOGIN set is still not a local development browser');
});

test('DEMO-3: a packaged app can never receive fabricated data, by any route', () => {
  // iOS: capacitor:// scheme.
  assert.equal(allowed({ hostname: 'localhost', protocol: 'capacitor:', devLogin: true }), false);
  // Ionic and file:// variants.
  assert.equal(allowed({ hostname: 'localhost', protocol: 'ionic:', devLogin: true }), false);
  assert.equal(allowed({ hostname: '', protocol: 'file:', devLogin: true }), false);
  // ANDROID is the hard case: Capacitor serves http://localhost, which protocol
  // and hostname alone cannot tell from a developer's machine. The runtime is
  // asked directly, so it is refused even with DEV_LOGIN set.
  assert.equal(allowed({ hostname: 'localhost', protocol: 'http:', devLogin: true, native: 'capacitor' }), false,
    'PACKAGED APP != DEVELOPMENT DEMO — even on http://localhost');
  assert.equal(allowed({ hostname: 'localhost', protocol: 'http:', devLogin: true, native: 'cordova' }), false);
});

// ─── 4-5: local development, both ways ──────────────────────────────────────

test('DEMO-4: local development receives fabricated data ONLY with the explicit switch', () => {
  assert.equal(allowed({ hostname: 'localhost', protocol: 'http:', devLogin: true }), true);
  assert.equal(allowed({ hostname: '127.0.0.1', protocol: 'http:', devLogin: true }), true);
  assert.equal(allowed({ hostname: '0.0.0.0', protocol: 'http:', devLogin: true }), true);
});

test('DEMO-5: localhost WITHOUT the explicit switch receives nothing fabricated', () => {
  assert.equal(allowed({ hostname: 'localhost', protocol: 'http:', devLogin: false }), false,
    'being on localhost is not by itself a development demo');
  assert.equal(allowed({ hostname: '127.0.0.1', protocol: 'http:', devLogin: false }), false);
  // Undefined / missing flag must not be truthy-coerced.
  assert.equal(allowed({ hostname: 'localhost', protocol: 'http:', devLogin: undefined }), false);
});

test('DEMO-6: the switch is server-controlled and cannot be self-asserted', () => {
  const guard = fn('perfDemoDataAllowed');
  assert.match(guard, /window\._devLoginEnabled !== true/,
    'requires the flag the server sets from /api/config devLogin');
  assert.match(guard, /window\.Capacitor|window\.cordova/, 'asks the native runtime directly');
  assert.match(guard, /catch \{ return false; \}/, 'any failure denies rather than allows');
  // The client must not be able to turn this on for itself via the URL.
  assert.ok(!/location\.search|location\.hash/.test(guard),
    'a query parameter must never enable fabricated data');
});

// ─── 7-9: the call sites, and the honest state ──────────────────────────────

test('DEMO-7: every Performance fabricated-data path goes through the guard', () => {
  const dash = fn('perfDashboardHtml');
  assert.match(dash, /if \(!perfDemoDataAllowed\(\)\) return perfDashboardEmptyHtml\(\);/);
  const analytics = fn('perfAnalyticsHtml');
  assert.match(analytics, /if \(!perfDemoDataAllowed\(\)\) return perfAnalyticsEmptyHtml\(\);/,
    'Analytics was completely ungated — this is the live exposure');
  // The guard must come FIRST, before any fixture is read. Compare CODE, not
  // prose — the comment explaining the fix names the fixtures it guards.
  const codeOf = body => body.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const aCode = codeOf(analytics), dCode = codeOf(dash);
  assert.ok(aCode.indexOf('perfDemoDataAllowed') < aCode.indexOf('PERF_SAMPLE_METRICS'),
    'the guard must return before any sample data is touched');
  assert.ok(dCode.indexOf('perfDemoDataAllowed') < dCode.indexOf('PERF_SAMPLE_TODAY'));
  // No Performance sample path may use the hostname-only predicate any more.
  const perfRegion = src.slice(src.indexOf('const PERF_SAMPLE_ATHLETES'), src.indexOf('function perfWkNoAssignmentHtml'));
  const code = perfRegion.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/if \(!_isLocalDemoHost\(\)\)/.test(code),
    'hostname-alone gating must not remain on any Performance sample path');
});

test('DEMO-8: the empty states fabricate nothing', () => {
  for (const name of ['perfAnalyticsEmptyHtml', 'perfDashboardEmptyHtml']) {
    const body = fn(name);
    assert.ok(!/PERF_SAMPLE_/.test(body), `${name} must not read any fixture`);
    // No invented athlete, score or programme may appear as literal copy.
    for (const invented of ['Tom Bradshaw', 'Ethan Kavanagh', 'Marcus Ashworth',
                            '142 kg', '48.5 cm', 'Pre-Season Strength', 'Return to Play']) {
      assert.ok(!body.includes(invented), `${name} must not contain "${invented}"`);
    }
    // And no bare numeric metric masquerading as a measurement.
    assert.ok(!/perf-big">\s*\d/.test(body), `${name} must not render a headline figure`);
  }
  assert.match(fn('perfAnalyticsEmptyHtml'), /No squad trends yet/, 'says plainly that there is nothing');
  assert.match(fn('perfAnalyticsEmptyHtml'), /need measurement data/, 'and why');
});

test('DEMO-9: entitlement and isolation are untouched', () => {
  // The premium gate still runs before anything, independent of demo state.
  const render = src.slice(src.indexOf('function renderPerformance'), src.indexOf('function perfDashboardEmptyHtml'));
  assert.match(render, /if \(!canUseFeature\('performance'\)\)/, 'premium gate intact');
  assert.ok(!/perfDemoDataAllowed/.test(render.slice(0, render.indexOf("canUseFeature('performance')"))),
    'demo state must never be consulted before the entitlement gate');
  // Athletes still come from the scoped server list, never club-wide state.players.
  const athletes = fn('perfAthletesHtml');
  assert.match(athletes, /perfScopedAthletes\(\)/, 'group-scoped athlete source intact');
  assert.ok(!/state\.players/.test(athletes.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')),
    'club-wide state.players must never be the athlete source');
});
