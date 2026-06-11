import { kvGet, kvSet } from './_kv.js';
import { key } from './_keys.js';
import { createHash } from 'node:crypto';

const AUDIT_KEY = key('identity:audit_log');

function nowMs() {
  return Date.now();
}

function rateKey(scope, identifier) {
  const digest = createHash('sha256').update(String(identifier || 'unknown')).digest('hex').slice(0, 24);
  return key(`rate:${scope}:${digest}`);
}

export function requestIp(req = {}) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || req.headers?.['X-Forwarded-For'] || '');
  return forwarded.split(',')[0].trim() || String(req.headers?.['x-real-ip'] || req.headers?.['X-Real-IP'] || 'local');
}

export async function enforceRateLimit(scope, identifier, { limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const redisKey = rateKey(scope, identifier);
  const now = nowMs();
  const record = (await kvGet(redisKey)) || { count: 0, resetAt: now + windowMs };
  const resetAt = Number(record.resetAt || 0);
  const current = resetAt > now ? record : { count: 0, resetAt: now + windowMs };
  current.count = Number(current.count || 0) + 1;
  const ttlSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  await kvSet(redisKey, current, ttlSeconds);
  if (current.count > limit) {
    const waitMinutes = Math.max(1, Math.ceil(ttlSeconds / 60));
    const error = new Error(`Too many attempts. Wait ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}, then double-check the exact email spelling and try again.`);
    error.status = 429;
    error.retryAfter = ttlSeconds;
    throw error;
  }
  return { remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export async function auditLog(event, details = {}) {
  const existing = (await kvGet(AUDIT_KEY)) || [];
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    event,
    at: new Date().toISOString(),
    ...details,
  };
  const next = [entry, ...(Array.isArray(existing) ? existing : [])].slice(0, 500);
  await kvSet(AUDIT_KEY, next);
  return entry;
}

export async function loadAuditLog(limit = 100) {
  const existing = (await kvGet(AUDIT_KEY)) || [];
  return (Array.isArray(existing) ? existing : []).slice(0, limit);
}
