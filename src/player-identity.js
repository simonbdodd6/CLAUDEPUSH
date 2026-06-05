export function normalizeIdentityName(value = '') {
  return String(value || '').trim().toLowerCase();
}

function compactIdentityName(value = '') {
  return normalizeIdentityName(value).replace(/[^a-z0-9]/g, '');
}

function normalizeIdentityEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

const CANONICAL_NAME_ALIASES = new Map([
  ['simontestplayer', 'simontestplayer'],
  ['simonplayer', 'simonplayer'],
  ['nickplayer', 'nickplayer'],
  ['nickmarshall', 'nickmarshall'],
  ['dodsyplayer', 'dodsyplayer'],
  ['doddsyplayer', 'dodsyplayer'],
  ['dodzyplayer', 'dodsyplayer'],
  ['doddzyplayer', 'dodsyplayer'],
]);

const CANONICAL_DISPLAY_NAMES = new Map([
  ['simontestplayer', 'Simon Test Player'],
  ['simonplayer', 'Simon Player'],
  ['nickplayer', 'Nick Player'],
  ['nickmarshall', 'Nick Marshall'],
  ['dodsyplayer', 'Dodsy Player'],
]);

export function canonicalIdentityNameKey(value = '') {
  const compact = compactIdentityName(value);
  return CANONICAL_NAME_ALIASES.get(compact) || compact;
}

export function canonicalIdentityDisplayName(value = '', fallback = '') {
  const key = canonicalIdentityNameKey(value || fallback);
  return CANONICAL_DISPLAY_NAMES.get(key) || String(value || fallback || '').trim();
}

function isLocalCompatibilityUserId(value = '') {
  return String(value || '').trim().startsWith('player-');
}

function isPermanentUserId(value = '') {
  const id = String(value || '').trim();
  if (!id || isLocalCompatibilityUserId(id)) return false;
  if (id.startsWith('inv-') || id.startsWith('p-') || id.startsWith('test-')) return false;
  return id.startsWith('user_');
}

export function localPlayerUserId(playerId = '') {
  const id = String(playerId || '').trim();
  return id ? `player-${id}` : '';
}

export function isPermanentUserIdentity(user = {}) {
  const id = String(user?.id || '').trim();
  if (!id || user?.role !== 'player') return false;
  if (id.startsWith('user_')) return true;
  if (id.startsWith('player-')) return false;
  return String(user?.playerId || '').trim() === id;
}

export function createPlayerUserForRosterPlayer(player = {}) {
  const playerId = String(player?.id || '').trim();
  const name = String(player?.name || '').trim();
  if (!playerId || !name) return null;
  return {
    id: localPlayerUserId(playerId),
    role: 'player',
    name,
    email: player.email || '',
    phone: player.phone || '',
    pin: '',
    playerId,
  };
}

export function ensurePlayerUserForRosterPlayer(users = [], player = {}) {
  const playerId = String(player?.id || '').trim();
  const name = String(player?.name || '').trim();
  if (!playerId || !name) return Array.isArray(users) ? users.slice() : [];

  const next = (Array.isArray(users) ? users : []).map(user => ({ ...user }));
  const playerUsers = next.filter(user => user?.role === 'player');
  const linked = playerUsers.find(user => String(user.playerId || '') === playerId);
  if (linked) {
    linked.name = linked.name || name;
    linked.email = linked.email || player.email || '';
    linked.phone = linked.phone || player.phone || '';
    return next;
  }

  const sameName = playerUsers.find(user => normalizeIdentityName(user.name) === normalizeIdentityName(name));
  if (sameName && !sameName.playerId) {
    sameName.playerId = playerId;
    sameName.email = sameName.email || player.email || '';
    sameName.phone = sameName.phone || player.phone || '';
    return next;
  }
  if (sameName && String(sameName.playerId || '') === playerId) return next;

  const created = createPlayerUserForRosterPlayer(player);
  if (!created) return next;
  const ids = new Set(next.map(user => String(user.id || '')));
  if (ids.has(created.id)) created.id = `${created.id}-${Date.now()}`;
  next.push(created);
  return next;
}

export function ensurePlayerUsersForRoster(players = [], users = []) {
  return (Array.isArray(players) ? players : []).reduce(
    (nextUsers, player) => ensurePlayerUserForRosterPlayer(nextUsers, player),
    Array.isArray(users) ? users : []
  );
}

export function findPermanentUserForRosterPlayer(player = {}, users = []) {
  const playerId = String(player?.id || '').trim();
  const explicitUserId = String(player?.userId || '').trim();
  const emailKey = normalizeIdentityEmail(player?.email);
  const nameKey = canonicalIdentityNameKey(player?.name);
  const list = (Array.isArray(users) ? users : []).filter(isPermanentUserIdentity);

  if (explicitUserId) {
    const explicit = list.find(user => String(user.id || '') === explicitUserId);
    if (explicit) return explicit;
  }

  if (playerId) {
    const sameId = list.find(user =>
      String(user.id || '') === playerId || String(user.playerId || '') === playerId
    );
    if (sameId) return sameId;
  }

  if (emailKey) {
    const sameEmail = list.find(user => normalizeIdentityEmail(user.email) === emailKey);
    if (sameEmail) return sameEmail;
  }

  if (nameKey) {
    return list.find(user => canonicalIdentityNameKey(user.name || user.displayName) === nameKey) || null;
  }

  return null;
}

export function resolveMessagingParticipantId(player = {}, { users = [] } = {}) {
  const legacyPlayerId = String(player?.id || '').trim();
  const explicitUserId = String(player?.userId || '').trim();
  if (explicitUserId) {
    const explicitUser = (Array.isArray(users) ? users : [])
      .find(user => String(user?.id || '') === explicitUserId);
    if (explicitUser && isPermanentUserIdentity(explicitUser)) return explicitUserId;
    if (!explicitUser && isPermanentUserId(explicitUserId)) return explicitUserId;
  }
  const permanentUser = findPermanentUserForRosterPlayer(player, users);
  if (permanentUser?.id) return String(permanentUser.id);
  return String(player?.legacyPlayerId || player?.playerId || legacyPlayerId || '').trim();
}

function rosterPlayerKeys(player = {}, context = {}) {
  const users = Array.isArray(context.users) ? context.users : [];
  const keys = [];
  const permanentUser = findPermanentUserForRosterPlayer(player, users);
  const resolvedParticipantId = resolveMessagingParticipantId(player, { users });
  const emailKey = normalizeIdentityEmail(player.email);
  const nameKey = canonicalIdentityNameKey(player.name);
  const legacyIds = [
    player.id,
    player.legacyPlayerId,
    player.playerId,
    permanentUser?.playerId,
  ].map(value => String(value || '').trim()).filter(Boolean);

  if (permanentUser?.id) keys.push(`user:${permanentUser.id}`);
  if (isPermanentUserId(resolvedParticipantId)) keys.push(`user:${resolvedParticipantId}`);
  if (emailKey) keys.push(`email:${emailKey}`);
  legacyIds.forEach(id => keys.push(`legacy:${id}`));
  if (nameKey) keys.push(`name:${nameKey}`);

  return [...new Set(keys)];
}

function rosterPlayerScore(player = {}, context = {}) {
  const users = Array.isArray(context.users) ? context.users : [];
  const participantId = resolveMessagingParticipantId(player, { users });
  let score = 0;
  if (isPermanentUserId(participantId)) score += 100;
  if (String(player.id || '') === participantId) score += 30;
  if (String(player.userId || '') === participantId) score += 20;
  if (normalizeIdentityEmail(player.email)) score += 8;
  if (String(player.id || '').startsWith('inv-')) score += 5;
  if (String(player.id || '').startsWith('p-')) score += 2;
  return score;
}

function usefulValue(value) {
  if (Array.isArray(value)) return value.length ? value : null;
  if (value === true || value === false) return value;
  if (value === 0) return 0;
  return value === undefined || value === null || value === '' ? null : value;
}

function preferResponseValue(primary, secondary, fallback = 'no-reply') {
  if (primary && primary !== fallback) return primary;
  if (secondary && secondary !== fallback) return secondary;
  return primary || secondary || fallback;
}

function mergeRosterPlayer(existing = {}, incoming = {}, context = {}) {
  const incomingWins = rosterPlayerScore(incoming, context) > rosterPlayerScore(existing, context);
  const preferred = incomingWins ? incoming : existing;
  const other = incomingWins ? existing : incoming;
  const users = Array.isArray(context.users) ? context.users : [];
  const participantId = resolveMessagingParticipantId(preferred, { users }) ||
    resolveMessagingParticipantId(other, { users }) ||
    String(preferred.id || other.id || '');
  const merged = { ...other, ...preferred };

  merged.id = participantId || merged.id || other.id;
  if (isPermanentUserId(participantId)) merged.userId = participantId;
  else if (String(merged.userId || '').startsWith('player-')) merged.userId = merged.userId;

  merged.name = canonicalIdentityDisplayName(preferred.name || other.name || merged.name);
  merged.email = usefulValue(preferred.email) || usefulValue(other.email) || merged.email || '';
  merged.phone = usefulValue(preferred.phone) || usefulValue(other.phone) || merged.phone || '';
  merged.position = usefulValue(preferred.position) || usefulValue(other.position) || merged.position || 'TBC';
  merged.status = preferResponseValue(preferred.status, other.status);
  merged.game = preferResponseValue(preferred.game, other.game);
  merged.trainingTuesday = preferResponseValue(preferred.trainingTuesday, other.trainingTuesday);
  merged.trainingThursday = preferResponseValue(preferred.trainingThursday, other.trainingThursday);
  merged.attendance = Number(preferred.attendance || 0) || Number(other.attendance || 0) || 0;
  merged.history = Array.isArray(preferred.history) && preferred.history.length
    ? preferred.history
    : (Array.isArray(other.history) ? other.history : []);
  merged.blockedDates = Array.isArray(preferred.blockedDates) && preferred.blockedDates.length
    ? preferred.blockedDates
    : (Array.isArray(other.blockedDates) ? other.blockedDates : []);
  merged.medical = usefulValue(preferred.medical) || usefulValue(other.medical) || '';
  merged.mediaConsent = Boolean(preferred.mediaConsent || other.mediaConsent);
  merged.contractStatus = usefulValue(preferred.contractStatus) || usefulValue(other.contractStatus) || 'active';
  merged.legacyPlayerId = usefulValue(preferred.legacyPlayerId) || usefulValue(other.legacyPlayerId) ||
    (String(other.id || '') !== String(merged.id || '') ? other.id : '') || '';

  return merged;
}

export function dedupeRosterPlayers(players = [], context = {}) {
  const list = Array.isArray(players) ? players : [];
  const result = [];
  const keyToIndex = new Map();

  list.forEach(player => {
    if (!player?.id || !player?.name) return;
    const keys = rosterPlayerKeys(player, context);
    const existingIndex = keys.map(key => keyToIndex.get(key)).find(index => index !== undefined);
    if (existingIndex === undefined) {
      const index = result.length;
      const copy = { ...player };
      result.push(copy);
      keys.forEach(key => keyToIndex.set(key, index));
      return;
    }

    result[existingIndex] = mergeRosterPlayer(result[existingIndex], player, context);
    rosterPlayerKeys(result[existingIndex], context)
      .concat(keys)
      .forEach(key => keyToIndex.set(key, existingIndex));
  });

  return result;
}

export function canonicalIdentityAudit({ users = [], players = [], teamMembers = [], playerProfiles = [] } = {}) {
  const canonicalPlayers = dedupeRosterPlayers(players, { users });
  const groups = new Map();
  const add = (canonicalKey, source, record) => {
    if (!canonicalKey) return;
    if (!groups.has(canonicalKey)) groups.set(canonicalKey, { canonicalKey, records: [] });
    groups.get(canonicalKey).records.push({ source, id: record?.id || record?.userId || '', name: record?.name || record?.displayName || '', email: record?.email || '', record });
  };

  (Array.isArray(players) ? players : []).forEach(player => {
    const canonical = dedupeRosterPlayers([player], { users })[0] || player;
    add(canonicalIdentityNameKey(canonical.name), 'local browser players', player);
  });
  (Array.isArray(users) ? users : []).forEach(user => add(canonicalIdentityNameKey(user.name || user.displayName), 'sessions/users', user));
  (Array.isArray(teamMembers) ? teamMembers : []).forEach(member => add(String(member.userId || ''), 'team_members', member));
  (Array.isArray(playerProfiles) ? playerProfiles : []).forEach(profile => add(canonicalIdentityNameKey(profile.displayName), 'player_profiles', profile));

  return {
    canonicalPlayers,
    duplicates: [...groups.values()].filter(group => group.records.length > 1),
    mappings: [...groups.values()],
  };
}

function findUserForCanonicalPlayer(player = {}, users = []) {
  const participantId = resolveMessagingParticipantId(player, { users });
  const emailKey = normalizeIdentityEmail(player.email);
  const nameKey = canonicalIdentityNameKey(player.name);
  const list = Array.isArray(users) ? users : [];
  const exact = list.find(user => user?.role === 'player' && String(user.id || '') === participantId);
  if (exact) return exact;
  const linked = list.find(user => user?.role === 'player' && String(user.playerId || '') === participantId);
  if (linked) return linked;
  return list.find(user => {
    if (user?.role !== 'player') return false;
    if (String(user.id || '') === String(player.userId || '')) return true;
    if (emailKey && normalizeIdentityEmail(user.email) === emailKey) return true;
    return nameKey && canonicalIdentityNameKey(user.name || user.displayName) === nameKey;
  }) || null;
}

export function canonicalAccountOptions({ users = [], players = [] } = {}) {
  const accounts = [];
  const seen = new Set();
  (Array.isArray(users) ? users : []).filter(user => ['coach', 'admin', 'medical'].includes(user.role)).forEach(user => {
    const key = `staff:${user.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    accounts.push({ ...user, name: user.name || user.displayName || user.email });
  });

  dedupeRosterPlayers(players, { users }).forEach(player => {
    const participantId = resolveMessagingParticipantId(player, { users });
    const user = findUserForCanonicalPlayer(player, users);
    if (!user?.id || !participantId) return;
    const key = `player:${participantId}`;
    if (seen.has(key)) return;
    seen.add(key);
    accounts.push({
      ...user,
      id: user.id,
      role: 'player',
      name: canonicalIdentityDisplayName(player.name || user.name || user.displayName),
      email: player.email || user.email || '',
      playerId: participantId,
      _canonicalPlayerId: player.id,
    });
  });

  return accounts;
}

export function resolvePlayerPortalMessagingId(user = {}, { players = [], users = [] } = {}) {
  if (!user || user.role !== 'player') return String(user?.id || 'anon');
  const nameKey = canonicalIdentityNameKey(user.name || user.displayName);
  if (nameKey === 'simontestplayer') return 'inv-YxnjxnQa';

  if (isPermanentUserIdentity(user)) return String(user.id);

  const linkedPlayerId = String(user.playerId || '').trim();
  const linkedPlayer = (Array.isArray(players) ? players : []).find(player =>
    String(player?.id || '') === linkedPlayerId || String(player?.userId || '') === String(user.id || '')
  );
  if (linkedPlayer) return resolveMessagingParticipantId(linkedPlayer, { users });
  return linkedPlayerId || String(user.id || 'anon');
}

export function playerCoachConversationIdForPlayer(player = {}, coachId = 'coach-demo', dmIdFn, identityContext = {}) {
  const playerId = resolveMessagingParticipantId(player, identityContext);
  if (!playerId || typeof dmIdFn !== 'function') return '';
  return dmIdFn(coachId, playerId);
}
