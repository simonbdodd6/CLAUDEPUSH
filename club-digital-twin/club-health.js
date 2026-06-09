/**
 * Club Health
 *
 * Computes a live, multi-dimensional Club Health Score (0–100).
 * Each dimension is independently scored and then weighted.
 * Tracks deltas so the UI can explain why the score changed.
 *
 * Weight distribution (must sum to 100):
 *   Attendance             20
 *   Player availability    15
 *   Membership             15
 *   Coach activity         15
 *   Injury management      10
 *   Communication          10
 *   Volunteer coverage     10
 *   Data completeness       5
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR  = join(__dir, 'data');
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, 'health-snapshots.jsonl');

const DIMENSIONS = [
  { id: 'attendance',          label: 'Attendance',          weight: 20 },
  { id: 'player_availability', label: 'Player Availability', weight: 15 },
  { id: 'membership',          label: 'Membership',          weight: 15 },
  { id: 'coach_activity',      label: 'Coach Activity',      weight: 15 },
  { id: 'injury_management',   label: 'Injury Management',   weight: 10 },
  { id: 'communication',       label: 'Communication',       weight: 10 },
  { id: 'volunteer_coverage',  label: 'Volunteer Coverage',  weight: 10 },
  { id: 'data_completeness',   label: 'Data Completeness',   weight:  5 },
];

// ── Score individual dimensions from club model ───────────────────────────────

export function scoreDimensions(model) {
  return DIMENSIONS.map(dim => {
    const { score, drivers } = scoreOneDimension(dim.id, model);
    return {
      id:      dim.id,
      label:   dim.label,
      weight:  dim.weight,
      score:   clamp(score),
      drivers, // what drove this score (for UI tooltips)
    };
  });
}

function scoreOneDimension(id, model) {
  const players = model.players ?? {};
  const coaches = model.coaches ?? {};
  const health  = model.health  ?? {};
  const comms   = model.communications ?? {};
  const vols    = model.volunteers ?? {};

  switch (id) {
    case 'attendance': {
      // Use CI health attendance dimension if available
      const ciDim = health.dimensions?.find(d => d.dimension?.toLowerCase().includes('attend'));
      if (ciDim?.score != null) return { score: ciDim.score, drivers: [`CI engine: ${ciDim.score}`] };
      // Fallback: derive from team attendance rates
      const teams = model.teams ?? [];
      const rates = teams.map(t => parseFloat(t.avgAttendance) || null).filter(r => r !== null);
      if (rates.length === 0) return { score: 50, drivers: ['No attendance data'] };
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      return { score: Math.round(avg), drivers: [`Average team attendance: ${avg.toFixed(0)}%`] };
    }

    case 'player_availability': {
      const rate = players.availabilityRate;
      if (rate == null) return { score: 70, drivers: ['No availability data — using baseline'] };
      // 95–100% → 100, 80–95% → 80, 60–80% → 60, <60% → 30
      const s = rate >= 95 ? 100 : rate >= 80 ? 80 : rate >= 60 ? 60 : 30;
      return { score: s, drivers: [`${rate}% players available (${players.injuredCount ?? 0} injured)`] };
    }

    case 'membership': {
      const retention = model.membership?.retentionRate;
      if (retention == null) return { score: 60, drivers: ['No membership data'] };
      const s = retention >= 90 ? 100 : retention >= 75 ? 80 : retention >= 60 ? 60 : 35;
      const trend = model.membership?.trend;
      const bonus = trend === 'growing' ? 5 : trend === 'shrinking' ? -10 : 0;
      return { score: clamp(s + bonus), drivers: [`Retention: ${retention}%`, `Trend: ${trend ?? 'stable'}`] };
    }

    case 'coach_activity': {
      const ratio = coaches.playerRatio;
      const sessions = coaches.sessionsDelivered ?? 0;
      // Player:coach ratio — ideal is 1:10 to 1:20
      const ratioScore = ratio == null ? 60 : ratio <= 20 ? 95 : ratio <= 30 ? 75 : ratio <= 40 ? 55 : 35;
      const sessionScore = sessions === 0 ? 40 : sessions < 5 ? 65 : sessions < 20 ? 85 : 100;
      return { score: Math.round((ratioScore + sessionScore) / 2), drivers: [`Player:coach ratio 1:${ratio ?? '?'}`, `Sessions delivered: ${sessions}`] };
    }

    case 'injury_management': {
      const total    = players.activeCount ?? 0;
      const injured  = players.injuredCount ?? 0;
      if (total === 0) return { score: 75, drivers: ['No player data'] };
      const injRate  = injured / total;
      const s = injRate === 0 ? 100 : injRate <= 0.05 ? 90 : injRate <= 0.10 ? 75 : injRate <= 0.20 ? 55 : 30;
      return { score: s, drivers: [`${injured}/${total} players injured (${(injRate*100).toFixed(0)}%)`] };
    }

    case 'communication': {
      const openRate = comms.openRate;
      const pending  = comms.pendingDrafts ?? 0;
      const openScore  = openRate == null ? 60 : openRate >= 40 ? 100 : openRate >= 25 ? 80 : openRate >= 15 ? 60 : 35;
      const queueScore = pending <= 1 ? 100 : pending <= 3 ? 80 : pending <= 6 ? 60 : 40;
      return {
        score:   Math.round((openScore + queueScore) / 2),
        drivers: [
          openRate != null ? `Email open rate: ${openRate}%` : 'No open-rate data',
          `${pending} pending drafts`,
        ],
      };
    }

    case 'volunteer_coverage': {
      const coverage = vols.coveragePercent;
      if (coverage == null) return { score: 65, drivers: ['No volunteer data'] };
      const s = coverage >= 90 ? 100 : coverage >= 70 ? 75 : coverage >= 50 ? 55 : 30;
      return { score: s, drivers: [`${coverage}% roles filled`, `${vols.missingRoles?.length ?? 0} gaps`] };
    }

    case 'data_completeness': {
      const dc = model.dataCompleteness ?? 0;
      return { score: dc, drivers: [`${dc}% of model fields populated`] };
    }

    default:
      return { score: 50, drivers: ['Unknown dimension'] };
  }
}

// ── Composite score ───────────────────────────────────────────────────────────

export function computeHealthScore(dimensions) {
  const total  = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weighted = dimensions.reduce((sum, d) => sum + (d.score * d.weight), 0);
  return clamp(Math.round(weighted / total));
}

export function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

export function scoreToStatus(score) {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 35) return 'poor';
  return 'critical';
}

// ── Full health report ────────────────────────────────────────────────────────

export function buildHealthReport(model) {
  const dimensions = scoreDimensions(model);
  const score  = computeHealthScore(dimensions);
  const grade  = scoreToGrade(score);
  const status = scoreToStatus(score);

  // Get previous snapshot to compute delta
  const previous = getLastSnapshot();
  const delta    = previous ? score - previous.score : null;
  const deltaLabel = delta === null ? null : delta > 0 ? `+${delta}` : `${delta}`;

  // Which dimensions changed most vs previous
  const dimensionDeltas = previous
    ? dimensions.map(d => {
        const prev = previous.dimensions?.find(p => p.id === d.id);
        return { ...d, delta: prev ? d.score - prev.score : null };
      })
    : dimensions;

  const report = {
    score,
    grade,
    status,
    delta,
    deltaLabel,
    trend:      deriveTrend(delta),
    summary:    buildHealthSummary(score, grade, status, delta, dimensions),
    dimensions: dimensionDeltas,
    weights:    DIMENSIONS,
    computedAt: new Date().toISOString(),
  };

  // Persist snapshot for future delta calculations
  saveSnapshot({ score, grade, dimensions, computedAt: report.computedAt });

  return report;
}

function buildHealthSummary(score, grade, status, delta, dimensions) {
  const changeText = delta === null ? '' : delta > 3 ? ' (+improving)' : delta < -3 ? ' (declining)' : '';
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  return `Club Health: ${score}/100 (${grade}) — ${status}${changeText}. ` +
         `Weakest area: ${weakest.label} (${weakest.score}/100).`;
}

function deriveTrend(delta) {
  if (delta === null) return 'unknown';
  if (delta >  5) return 'improving';
  if (delta < -5) return 'declining';
  return 'stable';
}

// ── Snapshot persistence ──────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function saveSnapshot(snapshot) {
  try {
    ensureDataDir();
    const line = JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }) + '\n';
    writeFileSync(SNAPSHOT_FILE, line, { flag: 'a', encoding: 'utf8' });
  } catch { /* non-fatal */ }
}

function getLastSnapshot() {
  try {
    if (!existsSync(SNAPSHOT_FILE)) return null;
    const lines = readFileSync(SNAPSHOT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;
  } catch { return null; }
}

export function getHealthHistory(n = 30) {
  try {
    if (!existsSync(SNAPSHOT_FILE)) return [];
    const lines = readFileSync(SNAPSHOT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => JSON.parse(l));
  } catch { return []; }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function clamp(n) { return Math.max(0, Math.min(100, n)); }
