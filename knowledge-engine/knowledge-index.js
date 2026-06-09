// Knowledge Index — builds and maintains a unified in-memory knowledge base
// by pulling from every Coach's Eye engine via lazy imports.

export const DOMAINS = {
  PLAYERS:        'players',
  TEAMS:          'teams',
  COACHES:        'coaches',
  COMMITTEES:     'committees',
  VOLUNTEERS:     'volunteers',
  SPONSORS:       'sponsors',
  FIXTURES:       'fixtures',
  ATTENDANCE:     'attendance',
  TRAINING:       'training',
  MEDICAL:        'medical',
  MEMBERSHIP:     'membership',
  FINANCE:        'finance',
  COMMUNICATIONS: 'communications',
  EVENTS:         'events',
  FACILITIES:     'facilities',
  DOCUMENTS:      'documents',
  POLICIES:       'policies',
  MATCH_HISTORY:  'match_history',
};

// Lazy engine loaders
let _mem = null, _ci = null, _di = null, _comms = null, _wf = null;

async function mem()   { if (!_mem)   { try { _mem   = await import('../memory-engine/index.js');              } catch { _mem   = null; } } return _mem;   }
async function ci()    { if (!_ci)    { try { _ci    = await import('../qa/club-intelligence/index.js');       } catch { _ci    = null; } } return _ci;    }
async function di()    { if (!_di)    { try { _di    = await import('../qa/data-integration/index.js');        } catch { _di    = null; } } return _di;    }
async function comms() { if (!_comms) { try { _comms = await import('../communications-engine/index.js');      } catch { _comms = null; } } return _comms; }

// The live index — { domain → IndexEntry }
const _index = new Map();
let   _lastBuilt = null;
let   _building  = false;

// An IndexEntry is { entries: KnowledgeEntry[], domain, lastIndexed, count, isMock, engine }
// A KnowledgeEntry is { id, domain, type, name, tags: [], data: {}, isMock: false }

function entry(domain, type, id, name, data, tags = [], isMock = false) {
  return { id: id ?? `${domain}-${Math.random().toString(36).slice(2, 8)}`, domain, type, name: name ?? '(unnamed)', tags, data, isMock };
}

// ── Domain builders ────────────────────────────────────────────────────────────

async function buildPlayers() {
  const m = await mem();
  if (!m) return { entries: [], isMock: true, engine: 'memory-engine' };

  const players = (m.getAllPlayers?.() ?? []);
  const entries = players.map(p => {
    const core    = p.core ?? p;
    const injuries = p.injuries ?? core.injuries ?? [];
    const tags    = [
      core.position, core.status,
      ...(injuries.filter(i => i.status === 'active').map(() => 'injured')),
      ...(p.teams ?? []).map(t => t.ageGroup ?? t.name),
    ].filter(Boolean);

    return entry(DOMAINS.PLAYERS, 'player', p.id, core.name ?? core.playerName, p, tags, false);
  });

  return { entries, isMock: entries.length === 0, engine: 'memory-engine' };
}

async function buildTeams() {
  const m = await mem();
  if (!m) return { entries: [], isMock: true, engine: 'memory-engine' };

  const teams = (m.getAllTeams?.() ?? []);
  const entries = teams.map(t => {
    const tags = [t.ageGroup, t.gender, t.division, t.status].filter(Boolean);
    return entry(DOMAINS.TEAMS, 'team', t.id, t.name ?? t.ageGroup, t, tags, false);
  });

  return { entries, isMock: entries.length === 0, engine: 'memory-engine' };
}

async function buildFixtures() {
  const d = await di();
  if (!d) return { entries: [], isMock: true, engine: 'data-integration' };

  const res = await d.query({ source: 'fixtures', role: 'public' }).catch(() => ({ data: [] }));
  const entries = (res.data ?? []).map(f => {
    const name   = `${f.homeTeam ?? '—'} vs ${f.awayTeam ?? '—'}`;
    const tags   = [f.competition, f.venue, f.status, f.ageGroup, f.result ? 'played' : 'upcoming'].filter(Boolean);
    return entry(DOMAINS.FIXTURES, 'fixture', f.id, name, f, tags, res.isMock);
  });

  return { entries, isMock: res.isMock, engine: 'data-integration' };
}

async function buildMatchHistory() {
  const d = await di();
  if (!d) return { entries: [], isMock: true, engine: 'data-integration' };

  const res = await d.query({ source: 'fixtures', role: 'public' }).catch(() => ({ data: [] }));
  const played = (res.data ?? []).filter(f => f.result || f.status === 'played' || f.homeScore !== undefined);
  const entries = played.map(f => {
    const result = f.result ?? (f.homeScore !== undefined ? `${f.homeScore}-${f.awayScore}` : '—');
    const name   = `${f.homeTeam ?? '—'} vs ${f.awayTeam ?? '—'} (${result})`;
    const tags   = [f.competition, f.ageGroup, result.includes('-') ? (parseInt(f.homeScore) > parseInt(f.awayScore) ? 'win' : 'loss') : null].filter(Boolean);
    return entry(DOMAINS.MATCH_HISTORY, 'match', f.id, name, f, tags, res.isMock);
  });

  return { entries, isMock: res.isMock, engine: 'data-integration' };
}

async function buildAttendance() {
  const d = await di();
  if (!d) return { entries: [], isMock: true, engine: 'data-integration' };

  const res = await d.query({ source: 'attendance', role: 'coach' }).catch(() => ({ data: [] }));
  const entries = (res.data ?? []).map(s => {
    const name = `Session ${s.date ? new Date(s.date).toLocaleDateString('en-IE') : s.id}`;
    const tags = [s.ageGroup, s.venue, s.type].filter(Boolean);
    return entry(DOMAINS.ATTENDANCE, 'session', s.id, name, s, tags, res.isMock);
  });

  return { entries, isMock: res.isMock, engine: 'data-integration' };
}

async function buildTraining() {
  const d = await di();
  if (!d) return { entries: [], isMock: true, engine: 'data-integration' };

  const res = await d.query({ source: 'sessions', role: 'coach' }).catch(() => ({ data: [] }));
  const entries = (res.data ?? []).map(s => {
    const name = `${s.ageGroup ?? 'Squad'} training ${s.date ? new Date(s.date).toLocaleDateString('en-IE') : ''}`;
    const tags = [s.ageGroup, s.focus, s.venue, s.status].filter(Boolean);
    return entry(DOMAINS.TRAINING, 'session', s.id, name, s, tags, res.isMock);
  });

  return { entries, isMock: res.isMock, engine: 'data-integration' };
}

async function buildMedical() {
  const d = await di();
  if (!d) {
    // Fall back to injury data embedded in players
    const m = await mem();
    if (!m) return { entries: [], isMock: true, engine: 'memory-engine' };
    const players = m.getAllPlayers?.() ?? [];
    const entries = players.flatMap(p => {
      const injuries = p.injuries ?? p.core?.injuries ?? [];
      return injuries.map(inj => {
        const name = `${p.core?.name ?? p.name ?? p.id}: ${inj.type ?? 'injury'}`;
        const tags = [inj.type, inj.status, inj.bodyPart, p.core?.position].filter(Boolean);
        return entry(DOMAINS.MEDICAL, 'injury', `${p.id}-${inj.type}`, name, { ...inj, playerId: p.id, playerName: p.core?.name ?? p.name }, tags, false);
      });
    });
    return { entries, isMock: entries.length === 0, engine: 'memory-engine' };
  }

  const res = await d.query({ source: 'injuries', role: 'manager' }).catch(() => ({ data: [] }));
  const entries = (res.data ?? []).map(inj => {
    const name = `${inj.playerName ?? inj.playerId ?? '—'}: ${inj.type ?? 'injury'}`;
    const tags = [inj.type, inj.status, inj.bodyPart, inj.position].filter(Boolean);
    return entry(DOMAINS.MEDICAL, 'injury', inj.id, name, inj, tags, res.isMock);
  });

  return { entries, isMock: res.isMock, engine: 'data-integration' };
}

async function buildMembership() {
  const c = await comms();
  if (!c) return { entries: [], isMock: true, engine: 'communications-engine' };

  try {
    const stats = await c.getMembershipStats();
    const all   = [
      ...(stats.active ?? []), ...(stats.pending ?? []),
      ...(stats.lapsed ?? []), ...(stats.expiringSoon ?? []),
    ].filter(m => m && m.id != null);

    const entries = all.map(m => {
      const name = m.playerName ?? m.name ?? m.id;
      const tags = [m.membershipType, m.status, m.ageGroup].filter(Boolean);
      return entry(DOMAINS.MEMBERSHIP, 'membership', m.id, name, m, tags, stats.isMock);
    });

    if (entries.length === 0 && stats.total > 0) {
      // Stats-only mode (no individual records)
      entries.push(entry(DOMAINS.MEMBERSHIP, 'summary', 'membership-summary', 'Membership Summary', stats, ['summary'], stats.isMock));
    }

    return { entries, isMock: stats.isMock, engine: 'communications-engine' };
  } catch { return { entries: [], isMock: true, engine: 'communications-engine' }; }
}

async function buildSponsors() {
  const c = await comms();
  if (!c) return { entries: [], isMock: true, engine: 'communications-engine' };

  try {
    const stats = await c.getSponsorStats();
    const sponsors = stats.sponsors ?? stats.active ?? [];
    const entries  = sponsors.map(s => {
      const name = s.name ?? s.companyName ?? s.id;
      const tags = [s.tier, s.status, s.category, s.validUntil ? 'has-expiry' : null].filter(Boolean);
      return entry(DOMAINS.SPONSORS, 'sponsor', s.id, name, s, tags, stats.isMock);
    });

    if (entries.length === 0) {
      entries.push(entry(DOMAINS.SPONSORS, 'summary', 'sponsor-summary', 'Sponsor Summary', stats, ['summary'], stats.isMock));
    }

    return { entries, isMock: stats.isMock, engine: 'communications-engine' };
  } catch { return { entries: [], isMock: true, engine: 'communications-engine' }; }
}

async function buildVolunteers() {
  const c = await comms();
  if (!c) return { entries: [], isMock: true, engine: 'communications-engine' };

  try {
    const stats = await c.getVolunteerStats();
    const volunteers = stats.volunteers ?? stats.all ?? [];
    const entries = volunteers.map(v => {
      const name = v.name ?? v.playerName ?? v.id;
      const tags = [v.role, v.status, v.team, v.lastActive ? 'has-activity' : 'no-activity'].filter(Boolean);
      return entry(DOMAINS.VOLUNTEERS, 'volunteer', v.id, name, v, tags, stats.isMock);
    });

    if (entries.length === 0) {
      entries.push(entry(DOMAINS.VOLUNTEERS, 'summary', 'volunteer-summary', 'Volunteer Summary', stats, ['summary'], stats.isMock));
    }

    return { entries, isMock: stats.isMock, engine: 'communications-engine' };
  } catch { return { entries: [], isMock: true, engine: 'communications-engine' }; }
}

async function buildCommunications() {
  const c = await comms();
  if (!c) return { entries: [], isMock: true, engine: 'communications-engine' };

  try {
    const scheduled = c.getScheduled?.() ?? [];
    const recent    = c.getRecentHistory?.(20) ?? [];
    const entries   = [
      ...scheduled.map(s => {
        const name = `Scheduled: ${s.type ?? 'communication'}`;
        return entry(DOMAINS.COMMUNICATIONS, 'scheduled', s.scheduleId, name, s, [s.type, 'scheduled'], false);
      }),
      ...recent.map(r => {
        const name = `${r.event ?? 'comm'}: ${r.type ?? '—'}`;
        return entry(DOMAINS.COMMUNICATIONS, 'history', r.id, name, r, [r.event, r.channel, r.type].filter(Boolean), false);
      }),
    ];
    return { entries, isMock: false, engine: 'communications-engine' };
  } catch { return { entries: [], isMock: true, engine: 'communications-engine' }; }
}

async function buildClubHealth() {
  const c = await ci();
  if (!c) return { entries: [], isMock: true, engine: 'club-intelligence' };

  try {
    const health  = await c.getClubHealth();
    const insights = await c.getInsights();
    const entries = [
      entry(DOMAINS.FACILITIES, 'health', 'club-health', 'Club Health Score', health, ['health', 'score'], false),
      ...(insights.insights ?? []).map(i =>
        entry(DOMAINS.DOCUMENTS, 'insight', `insight-${i.category}-${Math.random().toString(36).slice(2,5)}`,
          i.title ?? i.category ?? 'Insight', i, [i.category, i.priority].filter(Boolean), false)
      ),
    ];
    return { entries, isMock: false, engine: 'club-intelligence' };
  } catch { return { entries: [], isMock: true, engine: 'club-intelligence' }; }
}

// ── Index builder ──────────────────────────────────────────────────────────────

const DOMAIN_BUILDERS = {
  [DOMAINS.PLAYERS]:        buildPlayers,
  [DOMAINS.TEAMS]:          buildTeams,
  [DOMAINS.FIXTURES]:       buildFixtures,
  [DOMAINS.MATCH_HISTORY]:  buildMatchHistory,
  [DOMAINS.ATTENDANCE]:     buildAttendance,
  [DOMAINS.TRAINING]:       buildTraining,
  [DOMAINS.MEDICAL]:        buildMedical,
  [DOMAINS.MEMBERSHIP]:     buildMembership,
  [DOMAINS.SPONSORS]:       buildSponsors,
  [DOMAINS.VOLUNTEERS]:     buildVolunteers,
  [DOMAINS.COMMUNICATIONS]: buildCommunications,
};

export async function buildIndex(domains = null) {
  if (_building) return _index;
  _building = true;

  const targets = domains ?? Object.keys(DOMAIN_BUILDERS);

  try {
    await Promise.all(targets.map(async domain => {
      const builder = DOMAIN_BUILDERS[domain];
      if (!builder) return;
      try {
        const result = await builder();
        _index.set(domain, { ...result, domain, lastIndexed: new Date().toISOString(), count: result.entries.length });
      } catch (err) {
        _index.set(domain, { entries: [], domain, lastIndexed: new Date().toISOString(), count: 0, isMock: true, error: err.message });
      }
    }));
    _lastBuilt = new Date().toISOString();
  } finally {
    _building = false;
  }

  return _index;
}

export async function getIndex(domain = null) {
  if (!_lastBuilt) await buildIndex();
  if (domain) return _index.get(domain) ?? { entries: [], domain, count: 0, isMock: true };
  return _index;
}

export async function refreshDomain(domain) {
  const builder = DOMAIN_BUILDERS[domain];
  if (!builder) return null;
  const result = await builder();
  _index.set(domain, { ...result, domain, lastIndexed: new Date().toISOString(), count: result.entries.length });
  return _index.get(domain);
}

export function indexStats() {
  let total = 0, live = 0, mock = 0;
  const byDomain = {};
  for (const [domain, idx] of _index.entries()) {
    byDomain[domain] = idx.count;
    total += idx.count;
    if (idx.isMock) mock += idx.count;
    else live += idx.count;
  }
  return { total, live, mock, domains: _index.size, byDomain, lastBuilt: _lastBuilt };
}

export function getLastBuilt() { return _lastBuilt; }
