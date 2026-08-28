/**
 * Appearance — Light / Dark / System.
 *
 * (Not to be confused with appearance-adjustments.test.js, which is about match
 * APPEARANCES — caps. This suite is about how the app looks.)
 *
 * CoachEasier's stylesheet is dark-first: the "MIDNIGHT STADIUM" system defines
 * the whole product, and a light-theme section appended after it converted every
 * surface to light. That section won purely by cascade order, so the dark design
 * was unreachable no matter how the app was configured.
 *
 * The fix scopes those light rules to `html:not([data-theme="dark"])`. What
 * these tests protect is therefore not "dark mode exists" but the two invariants
 * that keep it working:
 *
 *   · every light-coloured rule after the banner is scoped — one unscoped white
 *     background is a white card on a black page; and
 *   · the default, for anyone who has never chosen, is LIGHT, so no existing
 *     coach is moved into dark by upgrading.
 *
 * The boot script is extracted and executed against a stubbed document,
 * localStorage and matchMedia, so the resolution rules are tested as behaviour
 * rather than as text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

const SCOPE = 'html:not([data-theme="dark"])';
const STYLE = html.slice(html.indexOf('<style>') + 7, html.indexOf('  </style>'));
const BANNER = 'LIGHT THEME (Beta)';

// ── Harness ───────────────────────────────────────────────────────────────────

/** The <head> boot script, run against a stubbed browser. */
function bootScope({ stored = null, osDark = false, throwOnStorage = false } = {}) {
  const start = html.indexOf('  <script>\n  /* ── Appearance, resolved before the first paint');
  assert.ok(start > 0, 'the appearance boot script must be present in <head>');
  const open = html.indexOf('>', start) + 1;
  const src = html.slice(open, html.indexOf('</script>', open));

  const root = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; } };
  const meta = { content: '#090d14', setAttribute(k, v) { if (k === 'content') this.content = v; }, getAttribute() { return this.content; } };
  const store = new Map(stored === null ? [] : [['coacheasier-appearance', stored]]);
  const listeners = [];
  const win = {
    localStorage: {
      getItem: k => { if (throwOnStorage) throw new Error('storage disabled'); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { if (throwOnStorage) throw new Error('storage disabled'); store.set(k, v); },
    },
    matchMedia: q => ({
      matches: /dark/.test(q) ? osDark : false,
      addEventListener: (_e, fn) => listeners.push(fn),
      addListener: fn => listeners.push(fn),
    }),
    document: { documentElement: root, querySelector: s => (s.includes('theme-color') ? meta : null) },
  };
  win.window = win;
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'localStorage', `with (window) { ${src} }`)(win, win.document, win.localStorage);
  return { win, root, meta, store, listeners, setOsDark: v => { osDark = v; }, fire: () => listeners.forEach(f => f()) };
}

/** Rules in the stylesheet from a given offset, with their selector and body. */
function rulesFrom(offset) {
  const text = STYLE.slice(offset);
  const out = [];
  const walk = (s, inMedia) => {
    let i = 0;
    while (i < s.length) {
      if (s.startsWith('/*', i)) { const j = s.indexOf('*/', i + 2); i = j >= 0 ? j + 2 : s.length; continue; }
      if (' \n\t'.includes(s[i])) { i++; continue; }
      const open = s.indexOf('{', i);
      if (open < 0) break;
      let depth = 0, k = open;
      while (k < s.length) {
        if (s[k] === '{') depth++;
        else if (s[k] === '}') { depth--; if (depth === 0) { k++; break; } }
        k++;
      }
      const sel = s.slice(i, open).trim();
      const body = s.slice(open + 1, k - 1);
      if (sel.startsWith('@')) { if (body.includes('{')) walk(body, true); }
      else out.push({ sel, body, inMedia });
      i = k;
    }
  };
  walk(text, false);
  return out;
}

const lightish = hex => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  if (h.length < 6) return false;
  const [r, g, b] = [0, 2, 4].map(o => parseInt(h.slice(o, o + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150;
};

/** Everything before the light-theme banner: the dark design. */
const DARK_SECTION = STYLE.slice(0, STYLE.indexOf(BANNER));

/** Is this hex a light SURFACE — near-neutral and bright — rather than an accent? */
function lightSurface(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  if (h.length < 6) return false;
  const [r, g, b] = [0, 2, 4].map(o => parseInt(h.slice(o, o + 2), 16));
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  // A saturated bright colour is an accent (amber #fbbf24, green #34d399); a
  // near-neutral bright colour is a surface (#ffffff, #f2f6fc, #eef2f9).
  return lightish(hex) && saturation < 0.25;
}

/** Does the dark design also style this selector? Then a light rule for it is an override. */
function overridesDarkDesign(sel) {
  return sel.split(',').map(p => p.trim()).filter(Boolean)
    .some(p => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[,{]').test(DARK_SECTION));
}

/** Declarations carrying a value that only reads on one canvas. */
function themeDependent(body) {
  const clean = body.replace(/var\([^)]*\)/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const decl of clean.split(';')) {
    const [rawProp, ...rest] = decl.split(':');
    if (!rest.length) continue;
    const prop = rawProp.trim().toLowerCase();
    const value = rest.join(':');
    const hexes = value.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    const darkInkRgba = /rgba\(\s*(1\d|2\d|3\d),\s*(1\d|2\d|3\d),\s*(3\d|4\d|5\d)/.test(value);
    if (/^(background|border)/.test(prop) && (hexes.some(lightSurface) || darkInkRgba)) return true;
    // Dark ink only reads on a light surface.
    if (/(^|-)color$/.test(prop) && (hexes.some(h => !lightish(h)) || darkInkRgba)) return true;
  }
  return false;
}

// ── 1. Both appearances exist ─────────────────────────────────────────────────

test('the dark design is present and is NOT conditioned on anything', () => {
  // The three dark layers are the base of the stylesheet. They must stay
  // unscoped: they are what shows through when the light rules step aside.
  const darkTokens = STYLE.slice(0, STYLE.indexOf(BANNER));
  assert.ok(/--page:\s*#0[0-9a-f]/.test(darkTokens), 'the dark page token must exist');
  assert.match(darkTokens, /MIDNIGHT STADIUM/, 'the dark design system must still be here');
  assert.ok(!darkTokens.includes(SCOPE), 'the dark layers must not be scoped to anything');
});

test('the light theme is still present, and still light', () => {
  const lightSection = STYLE.slice(STYLE.indexOf(BANNER));
  assert.match(lightSection, /--page:\s*#f3f4f6/, 'the light page token must survive');
  assert.match(lightSection, /--panel:\s*#ffffff/, 'the light panel token must survive');
  assert.match(lightSection, /--ink:\s*#1b2230/, 'the light ink token must survive');
  assert.ok(lightSection.includes(`${SCOPE} {`), 'the light tokens must be scoped to light');
});

// ── 2. The invariant: no light rule may escape the scope ──────────────────────

/** Everything after the light-theme banner comment closes. */
const LIGHT_SECTION_OFFSET = STYLE.indexOf('*/', STYLE.indexOf(BANNER)) + 2;

test('no unscoped rule in the light section paints a light SURFACE', () => {
  // The headline failure this build exists to prevent: a white card on a black
  // page. Saturated brights (the amber status dot, the green publish button)
  // are accents, not surfaces, and belong to no theme.
  // Documented exceptions: things that are white because of what they ARE, not
  // because of the canvas behind them.
  const NOT_A_SURFACE = {
    '.perf-switch.on i': 'the switch knob, riding on a var(--brand) track — white in both',
  };
  const offenders = rulesFrom(LIGHT_SECTION_OFFSET)
    .filter(r => !r.sel.includes(SCOPE))
    .filter(r => !/pitch/.test(r.sel))            // the rugby pitch is green in both
    .filter(r => !(r.sel.trim() in NOT_A_SURFACE))
    .filter(r => {
      const clean = r.body.replace(/var\([^)]*\)/g, ' ');
      return (clean.match(/background[^;]*?(#[0-9a-fA-F]{3,8})/g) || [])
        .some(d => (d.match(/#[0-9a-fA-F]{3,8}/g) || []).some(lightSurface));
    })
    .map(r => r.sel.slice(0, 70));

  assert.deepEqual(offenders, [],
    'these would paint a light surface on the dark canvas:\n  ' + offenders.join('\n  '));
});

test('a light rule that overrides the dark design must be scoped to light', () => {
  // The subtler failure, and the one that actually got past the first pass:
  // .mc10-chip-val.v-ready darkened the Match Centre readiness colour FOR THE
  // LIGHT CHIP. Unscoped it replaced a readable dark-mode colour with dark ink.
  const offenders = rulesFrom(LIGHT_SECTION_OFFSET)
    .filter(r => !r.sel.includes(SCOPE))
    .filter(r => overridesDarkDesign(r.sel))
    .filter(r => themeDependent(r.body))
    .map(r => r.sel.slice(0, 70) + '  →  ' + r.body.split(';')[0].trim().slice(0, 50));

  assert.deepEqual(offenders, [],
    'these override the dark design with a light-only value:\n  ' + offenders.join('\n  '));
});

test('scoping is applied per selector, so the light rules keep their order', () => {
  // Each selector in a list is prefixed individually. Wrapping a list in :is()
  // would give every member the specificity of the most specific one, which
  // silently reorders how the light rules resolve against each other.
  const scoped = rulesFrom(LIGHT_SECTION_OFFSET).filter(r => r.sel.includes(SCOPE));
  assert.ok(scoped.length > 60, `expected the light section to be scoped, saw ${scoped.length} rules`);
  for (const r of scoped) {
    const parts = r.sel.split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      assert.ok(p.startsWith(SCOPE), `selector part not scoped: ${p.slice(0, 60)}`);
      assert.ok(!/:is\(/.test(p), `:is() would not preserve specificity: ${p.slice(0, 60)}`);
    }
  }
});

test('theme-neutral rules are deliberately left alone', () => {
  // White text on the brand gradient is correct on both canvases; scoping it
  // would break the primary button in dark.
  const lightSection = STYLE.slice(STYLE.indexOf(BANNER));
  const primary = lightSection.match(/^\s*\.btn\.primary\s*\{[^}]*\}/m);
  assert.ok(primary, '.btn.primary must still be styled');
  assert.ok(!primary[0].includes(SCOPE), 'the brand-gradient button needs no theme');
  assert.match(primary[0], /var\(--brand-grad\)/);
});

// ── 3. Default, resolution and persistence ────────────────────────────────────

test('a coach who has never chosen gets LIGHT — even on a dark-mode device', () => {
  // This is the whole "do not move existing users" requirement. Everyone on the
  // app today is on light; an upgrade must not change that under them.
  const a = bootScope({ stored: null, osDark: true });
  assert.equal(a.root.getAttribute('data-theme'), 'light');
  assert.equal(a.win.ceAppearancePreference(), 'light');

  const b = bootScope({ stored: null, osDark: false });
  assert.equal(b.root.getAttribute('data-theme'), 'light');
});

test('a stored preference resolves to the appearance it names', () => {
  assert.equal(bootScope({ stored: 'dark' }).root.getAttribute('data-theme'), 'dark');
  assert.equal(bootScope({ stored: 'light', osDark: true }).root.getAttribute('data-theme'), 'light');
  assert.equal(bootScope({ stored: 'system', osDark: true }).root.getAttribute('data-theme'), 'dark');
  assert.equal(bootScope({ stored: 'system', osDark: false }).root.getAttribute('data-theme'), 'light');
});

test('a corrupt or unknown stored value falls back to light, never to a broken page', () => {
  for (const junk of ['DARK', 'midnight', '', 'true', '{}']) {
    const s = bootScope({ stored: junk, osDark: true });
    assert.equal(s.root.getAttribute('data-theme'), 'light', `stored value ${JSON.stringify(junk)}`);
    assert.equal(s.win.ceAppearancePreference(), 'light');
  }
});

test('storage that throws is survivable — the app still paints', () => {
  // Safari private mode and "block all cookies" both make localStorage throw on
  // access, not return null. An exception here would break the page at <head>.
  const s = bootScope({ throwOnStorage: true, osDark: true });
  assert.equal(s.root.getAttribute('data-theme'), 'light');
});

test('the resolved appearance is stamped before the first paint', () => {
  // The boot script must be in <head>, ahead of <body>: applied later, the app
  // paints light and then flips.
  const script = html.indexOf('Appearance, resolved before the first paint');
  const headEnd = html.indexOf('</head>');
  const bodyStart = html.indexOf('<body');
  assert.ok(script > 0 && script < headEnd, 'the boot script must live in <head>');
  assert.ok(headEnd < bodyStart, 'sanity: </head> precedes <body>');
  assert.match(html.slice(script, script + 2600), /document\.documentElement\.setAttribute\('data-theme'/);
});

test('the mobile browser chrome follows the appearance', () => {
  const dark = bootScope({ stored: 'dark' });
  assert.equal(dark.meta.content, '#090d14');
  const light = bootScope({ stored: 'light' });
  assert.equal(light.meta.content, '#f3f4f6');
});

test('choosing an appearance persists it on the device', () => {
  const s = bootScope({ stored: null });
  s.win.localStorage.setItem('coacheasier-appearance', 'dark');
  s.win.ceApplyAppearance('dark');
  assert.equal(s.store.get('coacheasier-appearance'), 'dark');
  assert.equal(s.root.getAttribute('data-theme'), 'dark');

  // …and a fresh boot with that value restores it, which is what a reload is.
  const reloaded = bootScope({ stored: 'dark' });
  assert.equal(reloaded.root.getAttribute('data-theme'), 'dark');
});

// ── 4. System mode ────────────────────────────────────────────────────────────

test('System follows the device, and an explicit choice makes it inert', () => {
  const src = html.slice(html.indexOf('function initAppearance()'),
                         html.indexOf('async function settingsTogglePref'));
  // The listener must re-read the stored preference rather than close over it,
  // so picking Light or Dark later stops it acting without being removed.
  assert.match(src, /ceAppearancePreference\(\) === 'system'/,
    'the OS listener must re-check the preference each time it fires');
  assert.match(src, /addEventListener/, 'modern change listener');
  assert.match(src, /addListener/, 'older WebKit fallback');
});

test('setAppearance accepts only the three appearances', () => {
  const src = html.slice(html.indexOf('function setAppearance(pref)'),
                         html.indexOf('function initAppearance()'));
  assert.match(src, /pref !== 'light' && pref !== 'dark' && pref !== 'system'/);
  assert.match(src, /return;/, 'anything else is refused');
  assert.match(src, /localStorage\.setItem\(CE_APPEARANCE_KEY, pref\)/);
});

// ── 5. Appearance is a device preference, not an account one ──────────────────

test('appearance never touches the server', () => {
  const src = html.slice(html.indexOf('function setAppearance(pref)'),
                         html.indexOf('async function settingsTogglePref'));
  assert.ok(!/fetch\(/.test(src), 'appearance must not call an API');
  assert.ok(!/api\/identity/.test(src), 'it is not an account preference');
  assert.ok(!/update_preferences/.test(src), 'it must not ride on the notification prefs');
});

test('the Settings card offers exactly Light, Dark and System', () => {
  const choices = html.slice(html.indexOf('const APPEARANCE_CHOICES'),
                             html.indexOf('function renderSettings()'));
  assert.match(choices, /id: 'light'/);
  assert.match(choices, /id: 'dark'/);
  assert.match(choices, /id: 'system'/);
  const card = html.slice(html.indexOf('<!-- Appearance —'), html.indexOf('<!-- Notifications -->'));
  assert.match(card, /role="radiogroup"/, 'the control must be a radio group for assistive tech');
  assert.match(card, /aria-checked="\$\{on\}"/, 'each option reports its own state');
  assert.match(card, /setAppearance\('\$\{c\.id\}'\)/);
});

// ── 6. Nothing else moved ─────────────────────────────────────────────────────

test('no role, permission or entitlement behaviour rides along', () => {
  const src = html.slice(html.indexOf('function setAppearance(pref)'),
                         html.indexOf('async function settingsTogglePref'));
  for (const forbidden of ['canI(', 'canUseFeature(', 'isCoach(', 'platformRole', 'accessScope', 'teamPlan']) {
    assert.ok(!src.includes(forbidden), `appearance must not consult ${forbidden}`);
  }
  // The card itself sits inside renderSettings, which is already coach-gated;
  // it adds no gate of its own and removes none.
  const card = html.slice(html.indexOf('<!-- Appearance —'), html.indexOf('<!-- Notifications -->'));
  assert.ok(!/canI\(|canUseFeature\(/.test(card), 'appearance is not a paid or privileged feature');
});

test('the Overview data-integrity fixes are untouched', () => {
  // Released immediately before this build; the appearance work must not have
  // reached into them.
  for (const fn of ['overviewRoster', 'overviewAvailableCount', 'overviewAnswerMap',
                    'overviewAnswerCounts', 'availabilityNonResponders']) {
    assert.ok(html.includes(`function ${fn}(`), `${fn} must still exist`);
  }
  const map = html.slice(html.indexOf('function overviewAnswerMap('),
                         html.indexOf('function overviewAnswerCounts('));
  assert.match(map, /sessionRows\(String\(id\)\)/, 'still reads the authoritative rows');
  assert.ok(!/state\.fixtureAvailability/.test(map), 'still not the device-local map');
});

test('dialogs use the shared surface token instead of a hard-coded white', () => {
  // A modal that hard-codes #fff paints a white sheet under near-white text the
  // moment the app is dark. The Weekly Availability editor did exactly that.
  const panels = html.match(/style="background:var\(--panel\);color:var\(--ink\);border-radius:20px;/g) || [];
  assert.equal(panels.length, 4, 'all four modal panels must use the token');
  const jsOnly = html.slice(html.indexOf('  </style>'));
  const strayWhite = jsOnly.match(/background:\s*#fff[;"']/g) || [];
  // Exactly one remains on purpose: a QR code needs its light quiet zone to
  // scan. Its "QR unavailable" placeholder is a card, not a code, and follows
  // the theme like every other surface.
  assert.equal(strayWhite.length, 1, 'only the QR quiet zone may stay white');
  assert.match(html, /quiet zone is part of the QR code, not the theme/,
    'and that exception must say why');
});
