/**
 * Club Trends
 *
 * Tracks how club metrics change over time by snapshotting the Digital Twin
 * on each build and computing trend lines across configurable windows.
 *
 * Storage: lightweight JSONL append file (no database required).
 * Each line = one snapshot, stamped with ISO date.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir        = dirname(fileURLToPath(import.meta.url));
const DATA_DIR     = join(__dir, 'data');
const TRENDS_FILE  = join(DATA_DIR, 'twin-snapshots.jsonl');
const MAX_LINES    = 500; // rolling window

// ── Snapshot schema ───────────────────────────────────────────────────────────

/**
 * Extract a flat metrics object from a full club model.
 * Only store what's needed for trend analysis — keep lines small.
 */
export function extractSnapshot(model) {
  return {
    ts:              new Date().toISOString(),
    healthScore:     model.health?.score       ?? null,
    healthGrade:     model.health?.grade       ?? null,
    playerCount:     model.players?.activeCount ?? 0,
    injuredCount:    model.players?.injuredCount ?? 0,
    availabilityRate: model.players?.availabilityRate ?? null,
    teamCount:       model.teams?.length         ?? 0,
    pendingApprovals: model.committee?.pendingApprovals ?? 0,
    dataCompleteness: model.dataCompleteness     ?? 0,
    retentionRate:   model.membership?.retentionRate ?? null,
    coachCount:      model.coaches?.activeCount  ?? 0,
    actionsRun:      model.actionActivity?.totalActionsRun ?? 0,

    // Dimension scores (flat)
    dim_attendance:          getDim(model, 'attendance'),
    dim_player_availability: getDim(model, 'player_availability'),
    dim_membership:          getDim(model, 'membership'),
    dim_coach_activity:      getDim(model, 'coach_activity'),
    dim_injury_management:   getDim(model, 'injury_management'),
    dim_communication:       getDim(model, 'communication'),
    dim_volunteer_coverage:  getDim(model, 'volunteer_coverage'),
    dim_data_completeness:   getDim(model, 'data_completeness'),
  };
}

function getDim(model, dimId) {
  return model.health?.dimensions?.find(d => d.id === dimId)?.score ?? null;
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function saveSnapshot(model) {
  try {
    ensureDataDir();
    const snap = extractSnapshot(model);
    appendLine(JSON.stringify(snap));
    return snap;
  } catch { return null; }
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function appendLine(line) {
  writeFileSync(TRENDS_FILE, line + '\n', { flag: 'a', encoding: 'utf8' });
  // Rolling compaction — keep last MAX_LINES snapshots
  try {
    const content = readFileSync(TRENDS_FILE, 'utf8');
    const lines   = content.trim().split('\n').filter(Boolean);
    if (lines.length > MAX_LINES) {
      const kept = lines.slice(-MAX_LINES);
      writeFileSync(TRENDS_FILE, kept.join('\n') + '\n', 'utf8');
    }
  } catch { /* non-fatal */ }
}

export function loadSnapshots(n = 90) {
  try {
    if (!existsSync(TRENDS_FILE)) return [];
    const lines = readFileSync(TRENDS_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => JSON.parse(l)).filter(Boolean);
  } catch { return []; }
}

// ── Trend computation ─────────────────────────────────────────────────────────

const WINDOWS = [
  { key: '7d',  days:  7, label: '7 days'  },
  { key: '30d', days: 30, label: '30 days' },
  { key: '90d', days: 90, label: '90 days' },
];

/**
 * Compute trends for all key metrics across all time windows.
 */
export function computeTrends(snapshots = null) {
  const snaps = snapshots ?? loadSnapshots(90);
  if (snaps.length === 0) {
    return { available: false, message: 'No historical snapshots yet. Trends appear after 2+ runs.', windows: {} };
  }

  const now     = new Date();
  const windows = {};

  for (const { key, days, label } of WINDOWS) {
    const cutoff = new Date(now.getTime() - days * 86400_000);
    const slice  = snaps.filter(s => new Date(s.ts) >= cutoff);
    if (slice.length < 2) { windows[key] = { label, message: 'Insufficient data', dataPoints: slice.length }; continue; }

    windows[key] = {
      label,
      dataPoints: slice.length,
      metrics:    computeMetricTrends(slice),
    };
  }

  return { available: true, computedAt: new Date().toISOString(), totalSnapshots: snaps.length, windows };
}

function computeMetricTrends(slice) {
  const metrics = [
    'healthScore', 'playerCount', 'injuredCount', 'availabilityRate',
    'pendingApprovals', 'dataCompleteness', 'retentionRate',
    'dim_attendance', 'dim_player_availability', 'dim_membership',
    'dim_coach_activity', 'dim_injury_management', 'dim_communication',
  ];

  const result = {};
  for (const m of metrics) {
    const values = slice.map(s => s[m]).filter(v => v !== null && v !== undefined);
    if (values.length < 2) continue;
    const first  = values[0];
    const last   = values[values.length - 1];
    const change = last - first;
    const pct    = first !== 0 ? Math.round((change / Math.abs(first)) * 100) : null;
    const dir    = change > 1 ? 'up' : change < -1 ? 'down' : 'flat';
    result[m] = { first, last, change, pct, direction: dir, samples: values.length };
  }
  return result;
}

// ── Narrative trend summary ───────────────────────────────────────────────────

export function narrateTrends(trends) {
  if (!trends.available) return 'No trend data available yet — run the Digital Twin more than once to generate trends.';

  const w30 = trends.windows?.['30d'];
  if (!w30?.metrics) return 'Not enough 30-day data for narrative.';

  const m = w30.metrics;
  const lines = [];

  if (m.healthScore) {
    const { direction, change } = m.healthScore;
    lines.push(`Club health has ${direction === 'up' ? 'improved' : direction === 'down' ? 'declined' : 'been stable'} ${change >= 0 ? '+' : ''}${change} points over 30 days.`);
  }
  if (m.injuredCount?.direction === 'up') {
    lines.push(`Injury count has increased by ${m.injuredCount.change} over the period — review training load.`);
  }
  if (m.injuredCount?.direction === 'down') {
    lines.push(`Injury numbers are falling — down ${Math.abs(m.injuredCount.change)} over 30 days.`);
  }
  if (m.retentionRate?.direction === 'down') {
    lines.push(`Membership retention is trending downward — attention needed.`);
  }
  if (m.dim_communication?.direction === 'up') {
    lines.push(`Communication engagement has improved over the past month.`);
  }

  return lines.length > 0 ? lines.join(' ') : 'Metrics are broadly stable over the past 30 days.';
}

// ── Latest snapshot accessor ──────────────────────────────────────────────────

export function getLatestSnapshot() {
  const snaps = loadSnapshots(1);
  return snaps.length > 0 ? snaps[0] : null;
}

export function getPreviousSnapshot(n = 2) {
  const snaps = loadSnapshots(n + 5);
  return snaps.length >= 2 ? snaps[snaps.length - 2] : null;
}
