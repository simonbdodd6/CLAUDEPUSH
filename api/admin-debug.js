// api/admin-debug.js — Read-only Redis state dump for diagnosing stale user data.
// Protected by CRON_SECRET. Call with: GET /api/admin-debug?secret=<CRON_SECRET>
// Returns raw contents of all identity and chat Redis keys plus migration flags.

import { kvGet } from './_kv.js';
import { key } from './_keys.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query?.secret || req.headers?.['x-debug-secret'];
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const [users, teamMembers, playerProfiles, convs, migrationIdentity, migrationConv] =
    await Promise.all([
      kvGet(key('identity:users')),
      kvGet(key('identity:team_members')),
      kvGet(key('identity:player_profiles')),
      kvGet(key('chat:convs')),
      kvGet(key('migrate:legacy-cleanup-v1')),
      kvGet(key('migrate:conv-cleanup-v1')),
    ]);

  const safeUsers = (Array.isArray(users) ? users : []).map(u => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    authProvider: u.authProvider,
  }));

  const safeMembers = (Array.isArray(teamMembers) ? teamMembers : []).map(m => ({
    id: m.id,
    teamId: m.teamId,
    userId: m.userId,
    role: m.role,
    status: m.status,
  }));

  const safeProfiles = (Array.isArray(playerProfiles) ? playerProfiles : []).map(p => ({
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    legacyPlayerId: p.legacyPlayerId,
    teamId: p.teamId,
  }));

  const safeConvs = (Array.isArray(convs) ? convs : []).map(c => ({
    id: c.id,
    type: c.type,
    name: c.name,
    participants: c.participants,
    teamId: c.teamId,
  }));

  return res.status(200).json({
    ok: true,
    keyPrefix: process.env.APP_KEY_PREFIX || 'app',
    users: safeUsers,
    userCount: safeUsers.length,
    teamMembers: safeMembers,
    memberCount: safeMembers.length,
    playerProfiles: safeProfiles,
    profileCount: safeProfiles.length,
    conversations: safeConvs,
    convCount: safeConvs.length,
    migrationFlags: {
      'migrate:legacy-cleanup-v1': migrationIdentity,
      'migrate:conv-cleanup-v1': migrationConv,
    },
    diagnosis: {
      obsoleteUsersPresent: safeUsers
        .filter(u => ['player-nick', 'player-simon-player', 'player-nick-marshall', 'player-dodsy-compat'].includes(u.id))
        .map(u => u.id),
      obsoleteDmsPresent: safeConvs
        .filter(c => c.id?.startsWith('dm:') && c.id.split(':').slice(1).some(part =>
          ['player-nick', 'inv-nick1234', 'player-simon-player', 'p-simon-player',
           'player-nick-marshall', 'p-nick-marshall', 'player-dodsy-compat', 'p-dodsy-001'].includes(part)
        ))
        .map(c => c.id),
      migrationFlagWasSet: Boolean(migrationIdentity),
      migrationRanAt: migrationIdentity?.migratedAt || null,
    },
  });
}
