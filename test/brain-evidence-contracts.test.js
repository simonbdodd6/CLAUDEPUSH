/**
 * M43 — @brain/evidence-contracts parity / shape + dormancy tests
 *
 * Proves the dormant evidence-contracts package:
 *   1. exposes the exact enum value sets from the approved M42 architecture;
 *   2. keeps every enum + the confidence-weight contract FROZEN and data-only
 *      (no functions, no logic);
 *   3. namespaces every SOURCE_TYPE by a SOURCE_FAMILY;
 *   4. is imported by NOBODY yet (repo-wide scan) — completely dormant.
 *
 * The package is pure data; this test imports it and nothing else from the Brain.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  EVIDENCE_CONTRACT_VERSION,
  SOURCE_FAMILY, SOURCE_TYPE, SUBJECT_TYPE, AUTHOR_KIND, SIGNAL_POLARITY,
  SENSITIVITY, AUDIT_ACTION, DISPUTED_FLAG,
  CONFIDENCE_WEIGHT_CONTRACT,
} from '@brain/evidence-contracts'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)

// ── 1. version + frozen enums ────────────────────────────────────────────────

test('contract version is 1.0', () => {
  assert.equal(EVIDENCE_CONTRACT_VERSION, '1.0')
})

test('every enum is frozen', () => {
  for (const e of [SOURCE_FAMILY, SOURCE_TYPE, SUBJECT_TYPE, AUTHOR_KIND, SIGNAL_POLARITY, SENSITIVITY, AUDIT_ACTION]) {
    assert.ok(Object.isFrozen(e), `enum not frozen: ${JSON.stringify(e)}`)
  }
})

// ── 2. enum value sets match the M42 architecture exactly ─────────────────────

test('SOURCE_FAMILY = { provider, manual }', () => {
  assert.deepEqual(new Set(Object.values(SOURCE_FAMILY)), new Set(['provider', 'manual']))
})

test('SOURCE_TYPE matches the architecture and is namespaced by family', () => {
  assert.deepEqual(Object.values(SOURCE_TYPE).sort(), [
    'manual.coachObservation', 'manual.contextNote', 'manual.matchNote',
    'manual.postMatchQuestionnaire', 'manual.scoutingNote', 'manual.teamSheet',
    'manual.videoTag', 'provider.frameSports', 'provider.statsImport', 'provider.video',
  ])
  const families = new Set(Object.values(SOURCE_FAMILY))
  for (const v of Object.values(SOURCE_TYPE)) {
    assert.ok(families.has(v.split('.')[0]), `sourceType not namespaced by a family: ${v}`)
  }
})

test('SUBJECT_TYPE / AUTHOR_KIND / SIGNAL_POLARITY / SENSITIVITY / AUDIT_ACTION value sets', () => {
  assert.deepEqual(new Set(Object.values(SUBJECT_TYPE)),
    new Set(['player', 'team', 'coach', 'fixture', 'opponent', 'club', 'drill', 'session']))
  assert.deepEqual(new Set(Object.values(AUTHOR_KIND)), new Set(['coach', 'provider', 'system']))
  assert.deepEqual(new Set(Object.values(SIGNAL_POLARITY)), new Set(['strength', 'weakness', 'neutral']))
  assert.deepEqual(new Set(Object.values(SENSITIVITY)), new Set(['public', 'club', 'medical', 'restricted']))
  assert.deepEqual(new Set(Object.values(AUDIT_ACTION)),
    new Set(['received', 'validated', 'normalized', 'deduplicated', 'linked', 'reweighted', 'superseded', 'rejected', 'redacted']))
  assert.equal(DISPUTED_FLAG, 'disputed')
})

// ── 3. confidence-weight contract: deeply frozen, versioned, DATA-ONLY ─────────

test('CONFIDENCE_WEIGHT_CONTRACT is data-only, versioned, and deeply frozen', () => {
  const c = CONFIDENCE_WEIGHT_CONTRACT
  assert.equal(c.version, '1.0')
  assert.deepEqual(Object.keys(c).sort(), ['conflict', 'corroboration', 'recency', 'sourceTrust', 'version', 'volume'])
  // deeply frozen
  assert.ok(Object.isFrozen(c))
  for (const k of ['sourceTrust', 'recency', 'corroboration', 'conflict', 'volume']) {
    assert.ok(Object.isFrozen(c[k]), `${k} not frozen`)
  }
  // data-only: no functions anywhere in the contract
  const walk = (v) => {
    assert.notEqual(typeof v, 'function', 'confidence-weight contract must contain no functions')
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk(c)
  // sane shape + ordering (declared parameters only — no computation here)
  assert.ok(c.sourceTrust.providerVerified >= c.sourceTrust.manualVerified)
  assert.ok(c.sourceTrust.manualVerified > c.sourceTrust.manualUnverified)
  assert.equal(c.conflict.flag, DISPUTED_FLAG)
  for (const w of Object.values(c.sourceTrust)) assert.ok(w >= 0 && w <= 1)
})

// ── 4. DORMANCY: nothing imports @brain/evidence-contracts yet ─────────────────

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', 'data', '.next', '.cache'])
function collectJs(absDir, out = []) {
  let entries
  try { entries = readdirSync(absDir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) collectJs(join(absDir, e.name), out) }
    else if (/\.(js|mjs|cjs|jsx)$/.test(e.name)) out.push(join(absDir, e.name))
  }
  return out
}

// Matches an ACTUAL module import of the package — `from '@brain/evidence-contracts'`,
// `import '@brain/evidence-contracts'`, `require('@brain/evidence-contracts')` — never a
// comment or a dependency-cruiser path string that merely mentions the name.
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/evidence-contracts['"]/

test('completely dormant — no runtime code imports @brain/evidence-contracts', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-evidence-contracts/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-contracts must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
