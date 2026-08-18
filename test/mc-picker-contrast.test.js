/**
 * Match Centre player-picker search — typed text must be readable.
 *
 * Bug pinned here: the picker popup (#mc-picker) is a hard-coded DARK surface
 * (#14151c) in both themes, but its text used var(--ink). The light theme
 * (appended last, wins the cascade) flips --ink to near-black #1b2230, so
 * typed player names and the player rows rendered ~1.1:1 against the popup —
 * invisible. The placeholder (var(--faint) = #9aa3b2 in light) stayed
 * readable, which is exactly the reported symptom.
 *
 * Contract: the picker's own text colours are FIXED dark-surface inks that
 * never follow page theme tokens, and they clear WCAG AA against the popup
 * background; the search wiring (filtering) is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const rule = sel => {
  const m = src.match(new RegExp(sel.replace(/[.#]/g, '\\$&') + '\\s*{[^}]*}'));
  assert.ok(m, `CSS rule ${sel} exists`);
  return m[0];
};

// WCAG relative-luminance contrast for #rrggbb values
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const POPUP_BG = '#14151c';   // the picker's hard-coded dark chrome

test('picker popup keeps its dark chrome (the reason text must not follow theme tokens)', () => {
  assert.match(rule('#mc-picker'), /background:\s*#14151c/i);
});

test('typed search text uses a fixed dark-surface ink, never var(--ink)', () => {
  const r = rule('.mc-picker-search');
  assert.doesNotMatch(r, /color:\s*var\(--ink\)/, 'theme token would flip near-black in light mode');
  const c = r.match(/(?<!caret-)color:\s*(#[0-9a-f]{6})/i);
  assert.ok(c, 'a fixed hex ink is declared');
  assert.ok(contrast(c[1], POPUP_BG) >= 7, `typed ink ${c[1]} clears 7:1 on the popup (got ${contrast(c[1], POPUP_BG).toFixed(2)})`);
  assert.match(r, /caret-color:\s*#/i, 'caret is explicitly visible too');
});

test('player rows use the same fixed dark-surface ink', () => {
  const r = rule('.mc-picker-row');
  assert.doesNotMatch(r, /color:\s*var\(--ink\)/);
  const c = r.match(/color:\s*(#[0-9a-f]{6})/i);
  assert.ok(c && contrast(c[1], POPUP_BG) >= 7, `row ink readable (${c && c[1]})`);
});

test('placeholder stays readable and visually distinct from typed ink', () => {
  // Placeholder keeps var(--faint); in the light theme that resolves to
  // #9aa3b2 — readable on the dark popup and dimmer than the typed ink.
  assert.match(rule('.mc-picker-search:empty:before'), /color:\s*var\(--faint\)/);
  assert.ok(contrast('#9aa3b2', POPUP_BG) >= 2.5, 'light-theme --faint readable on the popup');
});

test('the light-theme layer never re-themes the picker back onto page tokens', () => {
  const lightStart = src.indexOf('LIGHT THEME (Beta)');
  assert.ok(lightStart > 0);
  const lightBlock = src.slice(lightStart, src.indexOf('</style>', lightStart));
  assert.doesNotMatch(lightBlock, /mc-picker/, 'no light-theme override targets the picker');
});

test('search wiring (filtering) is unchanged', () => {
  const el = src.match(/<div class="mc-picker-search"[^>]*>/);
  assert.ok(el, 'search element present');
  assert.match(el[0], /oninput="mcRenderPickerList\(this\.textContent\)"/, 'same filter entry point');
  assert.match(el[0], /contenteditable="true"/, 'same input mechanism');
});
