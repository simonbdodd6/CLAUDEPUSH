// Resolves a logical audience spec into a list of recipients with contact info.
// Pulls data from the Data Integration Layer and Memory Engine.

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

let _mem = null;
async function mem() {
  if (!_mem) { try { _mem = await import('../memory-engine/index.js'); } catch { _mem = null; } }
  return _mem;
}

export const AUDIENCE_TYPES = {
  PLAYERS:              'players',
  PARENTS:              'parents',
  COACHES:              'coaches',
  COMMITTEE:            'committee',
  SPONSORS:             'sponsors',
  VOLUNTEERS:           'volunteers',
  MEMBERS:              'members',
  FORMER_MEMBERS:       'former_members',
  SUPPORTERS:           'supporters',
  NEWSLETTER:           'newsletter_subscribers',
  ALL:                  'all',
};

// Build a minimal recipient stub from a player record.
function playerToRecipient(p, role = 'player') {
  const name = p.name ?? p.core?.name ?? 'Player';
  const email = p.email ?? p.core?.email ?? null;
  const phone = p.phone ?? p.core?.phone ?? null;
  const pushToken = p.pushToken ?? p.core?.pushToken ?? null;

  return {
    id:          p.id,
    name,
    firstName:   name.split(' ')[0],
    role,
    ageGroup:    p.ageGroup ?? p.core?.ageGroup ?? null,
    teamId:      p.teamId   ?? p.core?.teamId   ?? null,
    email,
    phone,
    pushToken,
    membershipStatus: p.membershipStatus ?? 'active',
    preferredChannel: pushToken ? 'push' : email ? 'email' : 'in-app',
    language:    p.language ?? 'en',
    _source:     p._source  ?? 'memory',
    _isMock:     p._isMock  ?? true,
  };
}

// Select recipients matching criteria.
// criteria: { type, ageGroup, teamId, membershipStatus, hasEmail, hasPushToken, limit }
export async function selectAudience(type, criteria = {}, role = 'coach') {
  const { ageGroup, teamId, membershipStatus, hasEmail, hasPushToken, limit } = criteria;
  let recipients = [];

  const m = await mem();
  const d = await di();

  if (type === AUDIENCE_TYPES.PLAYERS || type === AUDIENCE_TYPES.ALL) {
    if (m) {
      const players = m.getAllPlayers?.() ?? [];
      players.forEach(p => recipients.push(playerToRecipient(p, 'player')));
    } else if (d) {
      const res = await d.queryPlayerData({ role });
      (res.data ?? []).forEach(p => recipients.push(playerToRecipient(p, 'player')));
    }
  }

  if (type === AUDIENCE_TYPES.COACHES || type === AUDIENCE_TYPES.ALL) {
    if (d) {
      const res = await d.query({ source: 'coaches', role: 'manager' });
      (res.data ?? []).forEach(c => recipients.push({
        id:          c.id,
        name:        c.name,
        firstName:   (c.name ?? '').split(' ')[0],
        role:        'coach',
        email:       c.email ?? null,
        phone:       c.phone ?? null,
        pushToken:   null,
        preferredChannel: c.email ? 'email' : 'in-app',
        language:    'en',
        _source:     'coaches',
        _isMock:     c._isMock ?? true,
      }));
    }
  }

  if (type === AUDIENCE_TYPES.VOLUNTEERS || type === AUDIENCE_TYPES.ALL) {
    if (d) {
      const res = await d.query({ source: 'volunteers', role: 'manager' });
      (res.data ?? []).forEach(v => recipients.push({
        id:          v.id,
        name:        v.name,
        firstName:   (v.name ?? '').split(' ')[0],
        role:        'volunteer',
        email:       v.email ?? null,
        phone:       v.phone ?? null,
        pushToken:   null,
        preferredChannel: v.email ? 'email' : 'in-app',
        language:    'en',
        _source:     'volunteers',
        _isMock:     v._isMock ?? true,
      }));
    }
  }

  if (type === AUDIENCE_TYPES.SPONSORS) {
    if (d) {
      const res = await d.query({ source: 'sponsors', role: 'manager' });
      (res.data ?? []).forEach(s => recipients.push({
        id:          s.id,
        name:        s.contactName ?? s.name,
        firstName:   (s.contactName ?? s.name ?? '').split(' ')[0],
        role:        'sponsor',
        orgName:     s.name,
        email:       s.contactEmail ?? null,
        phone:       s.contactPhone ?? null,
        pushToken:   null,
        tier:        s.tier ?? 'silver',
        preferredChannel: 'email',
        language:    'en',
        _source:     'sponsors',
        _isMock:     s._isMock ?? true,
      }));
    }
  }

  if (type === AUDIENCE_TYPES.MEMBERS) {
    if (d) {
      const res = await d.query({ source: 'membership', role: 'manager' });
      (res.data ?? []).forEach(m => recipients.push({
        id:          m.id ?? m.playerId,
        name:        m.playerName ?? m.name,
        firstName:   (m.playerName ?? m.name ?? '').split(' ')[0],
        role:        'member',
        email:       m.email ?? null,
        membershipStatus: m.status,
        membershipType:   m.membershipType,
        validUntil:  m.validUntil,
        preferredChannel: m.email ? 'email' : 'in-app',
        language:    'en',
        _source:     'membership',
        _isMock:     m._isMock ?? true,
      }));
    }
  }

  if (type === AUDIENCE_TYPES.FORMER_MEMBERS) {
    if (d) {
      const res = await d.query({ source: 'membership', role: 'manager' });
      (res.data ?? []).filter(m => m.status === 'lapsed' || m.status === 'expired').forEach(m => recipients.push({
        id:          m.id ?? m.playerId,
        name:        m.playerName ?? m.name,
        firstName:   (m.playerName ?? m.name ?? '').split(' ')[0],
        role:        'former_member',
        email:       m.email ?? null,
        membershipStatus: m.status,
        preferredChannel: m.email ? 'email' : null,
        language:    'en',
        _source:     'membership',
        _isMock:     m._isMock ?? true,
      }));
    }
  }

  // Fallback — if no real audience data, return sample stubs
  if (recipients.length === 0) {
    recipients = buildSampleRecipients(type);
  }

  // Apply filters
  if (ageGroup)         recipients = recipients.filter(r => r.ageGroup === ageGroup);
  if (teamId)           recipients = recipients.filter(r => r.teamId === teamId);
  if (membershipStatus) recipients = recipients.filter(r => r.membershipStatus === membershipStatus);
  if (hasEmail)         recipients = recipients.filter(r => r.email);
  if (hasPushToken)     recipients = recipients.filter(r => r.pushToken);

  const limited = limit ? recipients.slice(0, limit) : recipients;

  return {
    type,
    criteria,
    recipients: limited,
    count:      limited.length,
    total:      recipients.length,
    isMock:     limited.some(r => r._isMock),
  };
}

function buildSampleRecipients(type) {
  const base = [
    { id: 'sample-1', name: 'Darragh Byrne',   firstName: 'Darragh',  role: type, email: null, pushToken: 'token-1', preferredChannel: 'push',   ageGroup: 'Senior', _isMock: true },
    { id: 'sample-2', name: 'Ciarán Murphy',   firstName: 'Ciarán',   role: type, email: null, pushToken: 'token-2', preferredChannel: 'push',   ageGroup: 'Senior', _isMock: true },
    { id: 'sample-3', name: 'Éanna Quinn',     firstName: 'Éanna',    role: type, email: null, pushToken: 'token-3', preferredChannel: 'push',   ageGroup: 'U18',    _isMock: true },
    { id: 'sample-4', name: 'Fionn Kavanagh',  firstName: 'Fionn',    role: type, email: null, pushToken: null,      preferredChannel: 'in-app', ageGroup: 'U16',    _isMock: true },
  ];
  base.forEach(r => Object.assign(r, { language: 'en', _source: 'sample' }));
  return base;
}

// Deduplicate recipients by id.
export function deduplicateAudience(recipients) {
  const seen = new Set();
  return recipients.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// Filter to recipients who can receive a given channel.
export function filterByChannel(recipients, channel) {
  return recipients.filter(r => {
    if (channel === 'push')   return !!r.pushToken;
    if (channel === 'email')  return !!r.email;
    if (channel === 'sms')    return !!r.phone;
    return true; // in-app, website-news — always reachable
  });
}

export function audienceSummary(audience) {
  const byChannel = {};
  audience.recipients.forEach(r => {
    byChannel[r.preferredChannel] = (byChannel[r.preferredChannel] ?? 0) + 1;
  });
  return `${audience.count} ${audience.type} (${Object.entries(byChannel).map(([k,v]) => `${v} via ${k}`).join(', ')})`;
}
