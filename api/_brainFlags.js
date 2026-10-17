// api/_brainFlags.js — Brain activation flags (READ-ONLY).
//
// Off by default so production behaviour is completely unchanged. Two gates, both required:
//   1. Global kill-switch: env BRAIN_ENABLED === 'true'  (unset in production ⇒ feature off)
//   2. Per-team premium flag: Redis key `app:brain:flags:{teamId}` → { enabled: true }
//
// This module only READS (env + kvGet). It never writes.
import { kvGet } from './_kv.js';
import { key } from './_keys.js';

export function brainGloballyEnabled(env = process.env) {
  return String(env?.BRAIN_ENABLED || '').trim().toLowerCase() === 'true';
}

function defaultGetFlag(teamId) {
  return kvGet(key(`brain:flags:${teamId}`));
}

export async function teamFlagEnabled(teamId, getFlag = defaultGetFlag) {
  if (!teamId) return false;
  const flag = await getFlag(teamId);
  return Boolean(flag && flag.enabled === true);
}

export async function brainEnabledForTeam(teamId, { env, getFlag } = {}) {
  if (!brainGloballyEnabled(env)) return false;
  return teamFlagEnabled(teamId, getFlag);
}
