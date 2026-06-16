import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found in source`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function extractObjectConst(name) {
  const pattern = new RegExp(`const ${name}\\s*=\\s*\\{([^}]*?)\\}`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Const ${name} not found`);
  return m[0];
}

function buildScope(stateOverride) {
  const objectConsts = [
    'MEDICAL_SEVERITY_LABELS', 'MEDICAL_SEVERITY_COLORS',
    'MEDICAL_CLEARANCE_LABELS', 'MEDICAL_CLEARANCE_COLORS',
    'MEDICAL_TRAINING_LABELS', 'MEDICAL_TRAINING_COLORS',
    'MEDICAL_TIMELINE_LABELS', 'MEDICAL_TIMELINE_COLORS',
  ];
  const arrayConsts = [
    "const MEDICAL_TIMELINE_TYPES = ['injury','physio','clearance','return','surgery','note'];",
    "const MEDICAL_BODY_LOCATIONS = ['Head','Neck','Shoulder','Collarbone','Chest','Ribs','Abdomen','Lower Back','Hip','Groin','Hamstring','Quad','Knee','Calf','Shin','Ankle','Foot','Thumb','Wrist','Elbow','Other'];",
  ];
  const fns = [
    'medicalSeverityColor', 'medicalTrainingStatusColor', 'medicalTrainingStatusLabel',
    'normalizeMedicalRecord', 'medicalDashboardSummary',
  ];
  const helpers = `
    function playerIsArchived(p) {
      return !!(p && (p.lifecycleStatus === 'archived' || p._archived === true));
    }
    function activeRosterPlayers(players) {
      return (players || []).filter(p => !playerIsArchived(p));
    }
  `;

  const constSrcs = objectConsts.map(extractObjectConst).join(';\n') + ';\n' + arrayConsts.join('\n');
  const fnSrcs    = fns.map(extractFn).join('\n');
  const stateJson = JSON.stringify(stateOverride || { players:[], medicalRecords:{}, medicalNotes:{} });

  const body = `
    "use strict";
    ${constSrcs};
    ${helpers}
    let state = ${stateJson};
    ${fnSrcs}
    return { medicalSeverityColor, medicalTrainingStatusColor, medicalTrainingStatusLabel,
             normalizeMedicalRecord, medicalDashboardSummary };
  `;
  return new Function(body)();
}

// ── medicalSeverityColor ──────────────────────────────────────────────────────

test('medicalSeverityColor: minor → amber', () => {
  const scope = buildScope();
  assert.equal(scope.medicalSeverityColor('minor'), '#fbbf24');
});

test('medicalSeverityColor: moderate → orange', () => {
  const scope = buildScope();
  assert.equal(scope.medicalSeverityColor('moderate'), '#f97316');
});

test('medicalSeverityColor: severe → red', () => {
  const scope = buildScope();
  assert.equal(scope.medicalSeverityColor('severe'), '#f87171');
});

test('medicalSeverityColor: empty → muted', () => {
  const scope = buildScope();
  assert.equal(scope.medicalSeverityColor(''), '#94a3b8');
});

test('medicalSeverityColor: unknown → muted fallback', () => {
  const scope = buildScope();
  assert.equal(scope.medicalSeverityColor('unknown'), '#94a3b8');
});

// ── medicalTrainingStatusColor ────────────────────────────────────────────────

test('medicalTrainingStatusColor: full → green', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusColor('full'), '#34d399');
});

test('medicalTrainingStatusColor: modified → amber', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusColor('modified'), '#fbbf24');
});

test('medicalTrainingStatusColor: unavailable → red', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusColor('unavailable'), '#f87171');
});

test('medicalTrainingStatusColor: gymOnly → blue', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusColor('gymOnly'), '#60a5fa');
});

test('medicalTrainingStatusColor: noContact → orange', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusColor('noContact'), '#f97316');
});

test('medicalTrainingStatusColor: empty string → muted', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusColor(''), '#94a3b8');
});

// ── medicalTrainingStatusLabel ────────────────────────────────────────────────

test('medicalTrainingStatusLabel: full → Full Training', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusLabel('full'), 'Full Training');
});

test('medicalTrainingStatusLabel: modified → Modified Training', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusLabel('modified'), 'Modified Training');
});

test('medicalTrainingStatusLabel: gymOnly → Gym Only', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusLabel('gymOnly'), 'Gym Only');
});

test('medicalTrainingStatusLabel: noContact → No Contact', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusLabel('noContact'), 'No Contact');
});

test('medicalTrainingStatusLabel: unavailable → Unavailable', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusLabel('unavailable'), 'Unavailable');
});

test('medicalTrainingStatusLabel: empty → Not set', () => {
  const scope = buildScope();
  assert.equal(scope.medicalTrainingStatusLabel(''), 'Not set');
});

// ── normalizeMedicalRecord ────────────────────────────────────────────────────

test('normalizeMedicalRecord: null returns complete empty record', () => {
  const scope = buildScope();
  const r = scope.normalizeMedicalRecord(null);
  assert.deepEqual(r, {
    currentInjury:'', bodyLocation:'', severity:'', dateInjured:'',
    expectedReturn:'', clearanceStatus:'', physiNotes:'', surgeryHistory:'',
    allergies:'', medication:'', concussionCount:0, concussionNotes:'', timeline:[],
  });
});

test('normalizeMedicalRecord: undefined returns complete empty record', () => {
  const scope = buildScope();
  const r = scope.normalizeMedicalRecord(undefined);
  assert.equal(r.currentInjury, '');
  assert.equal(r.concussionCount, 0);
  assert.deepEqual(r.timeline, []);
});

test('normalizeMedicalRecord: existing fields are preserved', () => {
  const scope = buildScope();
  const r = scope.normalizeMedicalRecord({
    currentInjury: 'Hamstring strain',
    severity: 'moderate',
    bodyLocation: 'Hamstring',
    concussionCount: 2,
    timeline: [{ id:'t1', date:'2026-01-01', type:'injury', notes:'ACL' }],
  });
  assert.equal(r.currentInjury,  'Hamstring strain');
  assert.equal(r.severity,       'moderate');
  assert.equal(r.bodyLocation,   'Hamstring');
  assert.equal(r.concussionCount, 2);
  assert.equal(r.timeline.length, 1);
});

test('normalizeMedicalRecord: concussionCount 0 stays 0', () => {
  const scope = buildScope();
  const r = scope.normalizeMedicalRecord({ concussionCount: 0 });
  assert.equal(r.concussionCount, 0);
});

test('normalizeMedicalRecord: non-array timeline defaults to []', () => {
  const scope = buildScope();
  const r = scope.normalizeMedicalRecord({ timeline: 'bad' });
  assert.deepEqual(r.timeline, []);
});

test('normalizeMedicalRecord: all 13 fields are present', () => {
  const scope = buildScope();
  const r = scope.normalizeMedicalRecord({});
  const keys = ['currentInjury','bodyLocation','severity','dateInjured','expectedReturn',
                 'clearanceStatus','physiNotes','surgeryHistory','allergies','medication',
                 'concussionCount','concussionNotes','timeline'];
  keys.forEach(k => assert.ok(Object.prototype.hasOwnProperty.call(r, k), 'missing key: ' + k));
});

// ── medicalDashboardSummary ───────────────────────────────────────────────────

test('medicalDashboardSummary: empty squad returns zeroes', () => {
  const scope = buildScope({ players:[], medicalRecords:{}, medicalNotes:{} });
  const r = scope.medicalDashboardSummary([], {}, {});
  assert.equal(r.injured.length,   0);
  assert.equal(r.rehab.length,     0);
  assert.equal(r.returning.length, 0);
  assert.equal(r.cleared.length,   0);
  assert.equal(r.alerts.length,    0);
});

test('medicalDashboardSummary: archived players are excluded', () => {
  const players = [
    { id:'p1', name:'Alice', trainingStatus:'unavailable', game:'injured' },
    { id:'p2', name:'Bob',   trainingStatus:'unavailable', lifecycleStatus:'archived' },
  ];
  const scope = buildScope({ players, medicalRecords:{}, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, {}, {});
  assert.equal(r.injured.length, 1);
  assert.equal(r.injured[0].id, 'p1');
});

test('medicalDashboardSummary: trainingStatus unavailable counts as injured', () => {
  const players = [
    { id:'p1', name:'Alice', trainingStatus:'unavailable', game:'available' },
    { id:'p2', name:'Bob',   trainingStatus:'full',        game:'available' },
  ];
  const scope = buildScope({ players, medicalRecords:{}, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, {}, {});
  assert.equal(r.injured.length, 1);
  assert.equal(r.injured[0].id, 'p1');
});

test('medicalDashboardSummary: p.game injured counts as injured', () => {
  const players = [
    { id:'p1', name:'Alice', trainingStatus:'', game:'injured' },
    { id:'p2', name:'Bob',   trainingStatus:'', game:'available' },
  ];
  const scope = buildScope({ players, medicalRecords:{}, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, {}, {});
  assert.equal(r.injured.length, 1);
});

test('medicalDashboardSummary: modified/gymOnly/noContact count as rehab', () => {
  const players = [
    { id:'p1', name:'A', trainingStatus:'modified',  game:'available' },
    { id:'p2', name:'B', trainingStatus:'gymOnly',   game:'available' },
    { id:'p3', name:'C', trainingStatus:'noContact', game:'available' },
    { id:'p4', name:'D', trainingStatus:'full',      game:'available' },
  ];
  const scope = buildScope({ players, medicalRecords:{}, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, {}, {});
  assert.equal(r.rehab.length, 3);
});

test('medicalDashboardSummary: clearanceStatus cleared appears in cleared list', () => {
  const players = [{ id:'p1', name:'Alice', trainingStatus:'', game:'available' }];
  const medRecs = { p1: { clearanceStatus:'cleared' } };
  const scope = buildScope({ players, medicalRecords: medRecs, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, medRecs, {});
  assert.equal(r.cleared.length, 1);
});

test('medicalDashboardSummary: p.medical string generates alert', () => {
  const players = [
    { id:'p1', name:'Alice', trainingStatus:'', game:'available', medical:'Known knee condition' },
    { id:'p2', name:'Bob',   trainingStatus:'', game:'available', medical:'' },
  ];
  const scope = buildScope({ players, medicalRecords:{}, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, {}, {});
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].id, 'p1');
});

test('medicalDashboardSummary: severe medicalRecord generates alert', () => {
  const players = [{ id:'p1', name:'Alice', trainingStatus:'', game:'available', medical:'' }];
  const medRecs = { p1: { severity:'severe' } };
  const scope = buildScope({ players, medicalRecords: medRecs, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, medRecs, {});
  assert.equal(r.alerts.length, 1);
});

test('medicalDashboardSummary: returning requires expectedReturn + non-cleared + in rehab/injured', () => {
  const players = [
    { id:'p1', name:'Alice', trainingStatus:'noContact', game:'available' },
    { id:'p2', name:'Bob',   trainingStatus:'full',      game:'available' },
  ];
  const medRecs = {
    p1: { expectedReturn:'2026-06-30', clearanceStatus:'pending' },
    p2: { expectedReturn:'2026-06-30', clearanceStatus:'pending' },
  };
  const scope = buildScope({ players, medicalRecords: medRecs, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, medRecs, {});
  assert.equal(r.returning.length, 1);
  assert.equal(r.returning[0].id, 'p1');
});

test('medicalDashboardSummary: already cleared player not in returning', () => {
  const players = [{ id:'p1', name:'Alice', trainingStatus:'unavailable', game:'injured' }];
  const medRecs = { p1: { expectedReturn:'2026-06-30', clearanceStatus:'cleared' } };
  const scope = buildScope({ players, medicalRecords: medRecs, medicalNotes:{} });
  const r = scope.medicalDashboardSummary(players, medRecs, {});
  assert.equal(r.returning.length, 0);
});
