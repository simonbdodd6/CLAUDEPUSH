// CoachEasier Performance — athlete profile persistence seam (SC2).
//
// Versioned, fail-safe (de)serialisation of the Performance profile state.
// This module never touches localStorage itself: the host app stores the
// value under its own namespaced key (state.performanceProfile in the
// prototype) and calls normalizeProfileState() on load — exactly how the
// rest of CoachEasier normalises persisted state. Replacing this layer with
// an API adapter later requires no screen changes.
//
// Pure module: no DOM, no fetch, no localStorage.

import { ONBOARDING_STEPS, PROFILE_VERSION, WELLNESS_LOG_MAX } from '../types/athlete-profile.js';
import { createEmptyProfile } from '../domain/athlete-profile.js';

export const PROFILE_STATE_VERSION = 1;

/**
 * Fresh, empty Performance profile state for one athlete.
 * `profile` stays null until onboarding starts — its absence is the
 * "not started" signal.
 */
export function createInitialProfileState() {
  return {
    stateVersion: PROFILE_STATE_VERSION,
    profile: null,
    onboarding: {
      step: 'welcome',
      startedAt: null,
      completedAt: null,
      skippedSteps: [],
    },
    wellnessLog: [],
  };
}

// ── Migrations ──────────────────────────────────────────────────────────────
// Seam for future profile versions: map fromVersion → migration fn. SC2
// ships version 1 with no migrations; when version 2 lands, add
//   1: (state) => ({ ...upgraded, stateVersion: 2 })
// and normalizeProfileState will chain them. Unmigratable data fails safe
// to a fresh state rather than corrupting the app.
export const PROFILE_MIGRATIONS = {};

function applyMigrations(state) {
  let cur = state;
  let guard = 0;
  while (cur.stateVersion < PROFILE_STATE_VERSION && guard++ < 10) {
    const migrate = PROFILE_MIGRATIONS[cur.stateVersion];
    if (!migrate) return null; // no path forward — fail safe
    cur = migrate(cur);
    if (!cur || typeof cur.stateVersion !== 'number') return null;
  }
  return cur.stateVersion === PROFILE_STATE_VERSION ? cur : null;
}

// ── Normalisation ───────────────────────────────────────────────────────────

const VALID_STEP_IDS = new Set(ONBOARDING_STEPS.map((s) => s.id));

/**
 * Normalise raw persisted profile state. Guarantees a well-formed value:
 * malformed, foreign or future-versioned data returns a fresh initial
 * state instead of throwing or half-loading.
 */
export function normalizeProfileState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createInitialProfileState();

  let state = raw;
  if (typeof state.stateVersion !== 'number') return createInitialProfileState();
  if (state.stateVersion > PROFILE_STATE_VERSION) return createInitialProfileState(); // future data — refuse to guess
  if (state.stateVersion < PROFILE_STATE_VERSION) {
    const migrated = applyMigrations(state);
    if (!migrated) return createInitialProfileState();
    state = migrated;
  }

  const base = createInitialProfileState();
  const onboarding = state.onboarding && typeof state.onboarding === 'object' ? state.onboarding : {};
  return {
    stateVersion: PROFILE_STATE_VERSION,
    profile: normalizeProfile(state.profile),
    onboarding: {
      step: VALID_STEP_IDS.has(onboarding.step) ? onboarding.step : base.onboarding.step,
      startedAt: typeof onboarding.startedAt === 'string' ? onboarding.startedAt : null,
      completedAt: typeof onboarding.completedAt === 'string' ? onboarding.completedAt : null,
      skippedSteps: Array.isArray(onboarding.skippedSteps)
        ? onboarding.skippedSteps.filter((s) => VALID_STEP_IDS.has(s))
        : [],
    },
    wellnessLog: Array.isArray(state.wellnessLog)
      ? state.wellnessLog.filter((e) => e && typeof e === 'object').slice(-WELLNESS_LOG_MAX)
      : [],
  };
}

/**
 * Normalise a stored profile against the canonical shape: template-merge so
 * unknown keys are dropped and missing keys pick up safe defaults. A profile
 * that is not an object (or carries a future version) becomes null —
 * onboarding simply restarts rather than trusting bad data.
 */
export function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.version !== 'number' || raw.version > PROFILE_VERSION) return null;
  const template = createEmptyProfile({});
  const merged = mergeIntoTemplate(template, raw);
  merged.version = PROFILE_VERSION;
  return merged;
}

function mergeIntoTemplate(template, source) {
  if (Array.isArray(template)) return Array.isArray(source) ? source : template;
  if (template === null || typeof template !== 'object') {
    return source === undefined ? template : source;
  }
  const out = {};
  for (const key of Object.keys(template)) {
    const t = template[key];
    const s = source?.[key];
    if (t !== null && typeof t === 'object' && !Array.isArray(t)) {
      out[key] = mergeIntoTemplate(t, s && typeof s === 'object' ? s : {});
    } else if (Array.isArray(t)) {
      out[key] = Array.isArray(s) ? s : [];
    } else {
      out[key] = s === undefined ? t : s;
    }
  }
  return out;
}

// ── Serialisation ───────────────────────────────────────────────────────────

/** Round-trip helper: what the host should persist. */
export function serializeProfileState(state) {
  return JSON.parse(JSON.stringify(normalizeProfileState(state)));
}
