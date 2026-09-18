/**
 * MATCH CENTRE — AVAILABLE PLAYER ROW LAYOUT.
 *
 * Each candidate row shows three things: the player (avatar + name), a status
 * label ("Available" / "Maybe" / "Out" / "No reply") and a status dot. The row
 * was a grid whose template came from two rules:
 *
 *   .mc7-trow.has-st { grid-template-columns: minmax(0,1fr) auto 16px; }   (meant: 3 columns)
 *   .mc7-thead, .mc7-trow { grid-template-columns: minmax(0,1fr) 16px !important; }
 *
 * The later-loaded !important two-column rule won, so the label was squeezed
 * into the 16px dot column ("Available" clipped) and the dot wrapped onto a
 * second grid row — at 390px it hung below the row itself.
 *
 * Now the label and dot travel as ONE group (.mc7-st) and the status row is two
 * columns: the name takes the flexible space, the status group its natural
 * width. Presentation only — the label text, the dot, the row's data
 * attributes and its drag handlers are exactly as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = html.indexOf('(', start), paren = 0;
  for (; i < html.length; i++) {
    if (html[i] === '(') paren++;
    else if (html[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = html.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < html.length; b++) {
    if (html[b] === '{') depth++;
    else if (html[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return html.slice(start, end + 1);
}

// The REAL row template: the callback renderMatchday maps over the rail list.
const matchday = fn('renderMatchday');
const ROW_FN = (() => {
  const a = matchday.indexOf('${_railStats.map(') + '${_railStats.map('.length;
  const b = matchday.indexOf('}).join("")', a);
  assert.ok(a > 20 && b > a);
  return matchday.slice(a, b + 1);
})();

function renderRow(p, match, { lockXV = false, alsoIn = false } = {}) {
  return new Function('p', 'match', 'lockXV', 'alsoIn', `
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const mcPersonKey = n => String(n || '').trim().toLowerCase();
    const playerAvatarColor = () => '#123456';
    const _railLockXV = new Set(lockXV ? [mcPersonKey(p.name)] : []);
    const _railLockBench = new Set();
    const dupNames = new Set(alsoIn ? [p.name] : []);
    const _mcOtherSide = { teamName: 'U18 Second' };
    return (${ROW_FN})({ p, match });`)(p, match, lockXV, alsoIn);
}

const LABELS = { available: 'Available', maybe: 'Maybe', unavailable: 'Out', noreply: 'No reply' };
const player = { id: 'p7', name: 'Sam Openside', position: '7 — Openside flanker' };

test('the row renders the name, the status label and the status dot', () => {
  for (const [match, label] of Object.entries(LABELS)) {
    const row = renderRow(player, match);
    assert.match(row, /<span class="mc7-nm" title="Sam Openside">Sam Openside/, match);
    assert.match(row, new RegExp(`<span class="mc7-match ${match}">${label}</span>`), match);
    assert.match(row, new RegExp(`<span class="mc7-dot ${match}" title="${label}" aria-label="${label}"></span>`), match);
  }
});

test('label and dot are ONE group: the row has exactly two parts', () => {
  for (const match of Object.keys(LABELS)) {
    const row = renderRow(player, match);
    assert.match(row, new RegExp(`<span class="mc7-st"><span class="mc7-match ${match}">[^<]+</span><span class="mc7-dot ${match}"[^>]*></span></span>`), match);
    // Direct children of the row: the player block and the status group — nothing else.
    const inner = row.slice(row.indexOf('>') + 1, row.lastIndexOf('</div>')).trim();
    const top = inner.replace(/<span class="mc7-pl">[\s\S]*?<\/span><\/span>\s*/, '');
    assert.ok(inner.startsWith('<span class="mc7-pl">'), match);
    assert.ok(top.startsWith('<span class="mc7-st">') && top.endsWith('</span></span>'), match);
  }
});

test('the status text and dot logic are unchanged', () => {
  assert.match(matchday, /const mLbl = match === 'available' \? 'Available' : match === 'maybe' \? 'Maybe' : \(match === 'unavailable' \? 'Out' : 'No reply'\);/);
});

test('long names keep their full value; only the display truncates', () => {
  const long = { id: 'p9', name: 'Maximilian-Alexander Vanderlinden-Oosterhuis the Third' };
  const row = renderRow(long, 'available');
  assert.match(row, /data-player-name="Maximilian-Alexander Vanderlinden-Oosterhuis the Third"/);
  assert.match(row, /<span class="mc7-nm" title="Maximilian-Alexander Vanderlinden-Oosterhuis the Third">/);
  assert.match(html, /\.mc7-nm \{ font-size: 12\.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/);
  assert.match(html, /\.mc7-pl \{ display: flex; align-items: center; gap: 8px; min-width: 0; \}/, 'the name block may shrink');
});

test('locked and "Also:" rows keep the same two-part layout', () => {
  const locked = renderRow(player, 'available', { lockXV: true });
  assert.match(locked, /mc7-locked/);
  assert.match(locked, /draggable="false"/);
  assert.match(locked, /<span class="mc7-st">/);
  const also = renderRow(player, 'maybe', { alsoIn: true });
  assert.match(also, /Also: U18 Second/);
  assert.match(also, /<span class="mc7-st">/);
});

test('drag, search and selection hooks are exactly as before', () => {
  const row = renderRow(player, 'available');
  assert.match(row, /class="mc7-trow has-st squad-player-drag" draggable="true"/);
  assert.match(row, /data-player-name="Sam Openside" data-player-id="p7" data-player-pos="7 — Openside flanker"/);
  assert.match(row, /ondragstart="handlePlayerDragStart\(event\)" ondragend="mcDragEnd\(event\)"/);
  // Search reads the row's own data attributes, which are untouched.
  assert.match(fn('mcAvailSearch'), /getAttribute\('data-player-name'\)/);
});

// ── CSS: the rule that must win ──────────────────────────────────────────────

test('the status row is two columns: flexible name, natural-width status', () => {
  assert.match(html, /\.mc7-trow\.has-st \{ grid-template-columns: minmax\(0,1fr\) auto !important; \}/);
  // It must beat the generic two-column !important template: same importance,
  // higher specificity (.mc7-trow.has-st > .mc7-trow).
  assert.match(html, /\.mc7-thead, \.mc7-trow \{ grid-template-columns: minmax\(0,1fr\) 16px !important;/);
  assert.doesNotMatch(html, /\.mc7-trow\.has-st \{ grid-template-columns: minmax\(0,1fr\) auto 16px; \}/, 'the dead 3-column rule is gone');
});

test('the status group never wraps and keeps the dot beside its label', () => {
  assert.match(html, /\.mc7-st \{ display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; white-space: nowrap; \}/);
  assert.match(html, /\.mc7-st \.mc7-dot \{ justify-self: auto; \}/);
  // Colours per status are unchanged.
  for (const rule of [/\.mc7-match\.available \{ color: #34d399; \}/, /\.mc7-match\.maybe \{ color: #fbbf24; \}/,
                      /\.mc7-dot\.available \{ background: #34d399; \}/, /\.mc7-dot\.maybe \{ background: #fbbf24; \}/])
    assert.match(html, rule);
});
