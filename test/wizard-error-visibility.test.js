/**
 * Launch blocker (2026-08-05) — wizard failures must be VISIBLE.
 *
 * The first real onboarding attempt failed twice with no readable feedback:
 * the error toast sat at z-index 9999 behind the club-wizard overlay at 10000,
 * so pressing "Create my club" looked like a silent hang. These tests pin the
 * layering, the in-modal error surface, and the 5xx message mapping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Slice a top-level function body out of index.html. */
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('{', start), depth = 0, end = i;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

function cssBlock(selector) {
  const start = src.indexOf(`${selector} {`);
  assert.ok(start > 0, `${selector} rule exists`);
  return src.slice(start, src.indexOf('}', start));
}

test('toasts layer ABOVE modal overlays', () => {
  const toastZ = Number((cssBlock('.toast').match(/z-index:\s*(\d+)/) || [])[1]);
  const overlayZ = Number((cssBlock('.ce-modal-overlay').match(/z-index:\s*(\d+)/) || [])[1]);
  assert.ok(Number.isFinite(toastZ) && Number.isFinite(overlayZ), `parsed ${toastZ} / ${overlayZ}`);
  assert.ok(toastZ > overlayZ,
    `toast (${toastZ}) must render above the modal overlay (${overlayZ}) or errors are invisible`);
});

test('the wizard has an in-modal error region on the final step', () => {
  assert.match(src, /id="cw-error" role="alert"/, 'accessible alert region exists');
  const finish = src.indexOf('id="cw-finish-btn"');
  const errBox = src.indexOf('id="cw-error"');
  assert.ok(errBox > 0 && errBox < finish, 'error region sits with the finish button, inside the modal');
});

test('clubWizFinish shows the error inside the modal and clears it on retry', () => {
  const body = fn('clubWizFinish');
  assert.match(body, /getElementById\('cw-error'\)/, 'references the in-modal region');
  assert.match(body, /errBox\.textContent = msg/, 'failure text is written into the modal');
  assert.match(body, /prevErr\.style\.display = 'none'/, 'stale error cleared when retrying');
  assert.match(body, /showToast\(msg\)/, 'toast retained as reinforcement');
  assert.match(body, /_cwFinishing = false/, 'submit guard always released');
});

test('5xx maps to an actionable message and never echoes server internals', () => {
  const source = fn('clubWizErrorMessage');
  // Evaluate the standalone helper and exercise the mapping directly.
  const clubWizErrorMessage = new Function(`return ${source}`)();
  const msg503 = clubWizErrorMessage(503, 'Storage temporarily unavailable');
  assert.match(msg503, /temporarily unavailable/i);
  assert.match(msg503, /details are saved|try again/i, 'tells the coach their input is kept');
  const msg500 = clubWizErrorMessage(500, 'TypeError: Failed to parse URL from SECRET');
  assert.equal(msg500.includes('SECRET'), false, 'server internals never surface for 5xx');
  assert.equal(msg500.includes('TypeError'), false);
  assert.equal(clubWizErrorMessage(409, 'x'), 'This club or team already exists. Please choose a different name.');
  assert.match(clubWizErrorMessage(400, 'Club name is required'), /Club name is required/,
    'validation messages still reach the coach');
});
