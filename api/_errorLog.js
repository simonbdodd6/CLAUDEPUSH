// api/_errorLog.js — production error telemetry: what may be recorded, and
// what must never be.
//
// Underscore-prefixed on purpose: Vercel's Hobby plan allows exactly 12
// serverless functions and we are at the ceiling (see DEPLOY.md), so this is a
// shared module, not a route. Ingest and read are folded into api/config.js —
// the same "fold into an existing function" pattern /api/roster uses.
//
// The rules below are the whole point of the file. H1 (f8859e47) removed live
// invitation tokens from server logs; an error reporter is exactly the sort of
// well-meaning feature that would put them straight back, because the easiest
// context to attach is "the page the user was on" — and an invite link IS
// `/?inv=<token>`. So:
//
//   1. URLs keep origin + path ONLY. Every query string and fragment is
//      dropped, unconditionally, before anything is stored. This is a
//      structural guarantee rather than a blocklist: a token parameter added
//      in future is redacted by a rule written today.
//   2. Free text is swept for credential-shaped material anyway, because a
//      thrown Error can embed a URL in its message.
//   3. Every field is length-capped and `kind` is a fixed enum, so a client —
//      broken, or hostile — cannot use this as arbitrary storage.

/** Kinds of event worth recording. Anything else is rejected outright. */
export const ERROR_KINDS = ['uncaught', 'unhandled_rejection', 'api_failure', 'app_error'];

/** Recording limits. The list is trimmed to MAX_ENTRIES on every write, so
 *  total storage is bounded no matter how much traffic arrives. */
export const MAX_ENTRIES = 200;
const MAX_MESSAGE = 300;
const MAX_SOURCE = 200;
const MAX_ROUTE = 120;
const MAX_STACK_FRAMES = 4;
const MAX_STACK = 500;

// Query keys that carry a credential in this app today. Used only for the
// belt-and-braces text sweep — URL fields are stripped structurally above.
const CREDENTIAL_KEYS = 'inv|invite|token|reset|auth|key|secret|password|session|bearer|code';

/**
 * A URL reduced to origin + pathname. No query, no fragment, ever.
 * Returns '' for anything unparseable rather than passing the raw value on.
 */
export function safeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, 'https://placeholder.invalid');
    if (u.hostname === 'placeholder.invalid') return u.pathname.slice(0, MAX_ROUTE);
    return `${u.origin}${u.pathname}`.slice(0, MAX_SOURCE);
  } catch {
    // Not a URL — keep the path-looking prefix only, never a query/fragment.
    return raw.split(/[?#]/)[0].slice(0, MAX_SOURCE);
  }
}

/**
 * Scrub credential-shaped material out of free text.
 *
 * Handles the two shapes that actually occur: a `key=value` pair (`?inv=abc`,
 * `token: abc`) and a bare URL embedded in a message. Long opaque strings are
 * NOT blanket-redacted — that would eat legitimate stack content — but any URL
 * inside the text loses its query string, which is where tokens live.
 */
export function scrubText(value, max = MAX_MESSAGE) {
  let out = String(value == null ? '' : value);
  // Strip the query/fragment off any URL embedded in the text.
  out = out.replace(/(https?:\/\/[^\s"'<>]+?)[?#][^\s"'<>]*/gi, '$1');
  // Redact key=value / key: value credential pairs wherever they appear.
  out = out.replace(new RegExp(`\\b(${CREDENTIAL_KEYS})\\b\\s*[=:]\\s*["']?[^\\s&"'<>,;]+`, 'gi'),
    (_m, k) => `${k}=[redacted]`);
  return out.trim().slice(0, max);
}

/**
 * Keep a stack usable but small: the first few frames, each reduced to its
 * function name and a safe file path. Frame URLs are run through safeUrl, so
 * a bundle URL carrying a query string cannot smuggle one in.
 */
export function scrubStack(stack) {
  const raw = String(stack || '');
  if (!raw) return '';
  return raw
    .split('\n')
    .slice(0, MAX_STACK_FRAMES + 1)
    .map(line => line.replace(/(https?:\/\/[^\s)]+)/g, m => safeUrl(m)).trim())
    .filter(Boolean)
    .join(' | ')
    .slice(0, MAX_STACK);
}

/**
 * Is this HTTP status worth recording as a production failure?
 *
 * Deliberately NO for the everyday ones. 401/403 are the auth system working;
 * 404/410 are a missing or expired thing; 409/422/429 are the server correctly
 * refusing bad or excessive input. Recording those would bury a real incident
 * in routine noise, which is how monitoring gets ignored. A 5xx is always
 * worth knowing about: it means our own code failed.
 */
export const EXPECTED_STATUSES = [400, 401, 403, 404, 409, 410, 422, 429];
export function isReportableStatus(status) {
  const code = Number(status);
  if (!Number.isFinite(code)) return false;
  if (EXPECTED_STATUSES.includes(code)) return false;
  return code >= 500;
}

/**
 * Normalise a client-submitted report into the record we are willing to store.
 * Returns null when the payload is not something we accept — the caller
 * answers 202 either way, because telemetry must never become a way to probe
 * the server.
 */
export function normalizeErrorReport(input = {}, context = {}) {
  if (!input || typeof input !== 'object') return null;
  const kind = String(input.kind || '').trim();
  if (!ERROR_KINDS.includes(kind)) return null;

  const message = scrubText(input.message);
  if (!message) return null;

  const status = Number(input.status);
  // An api_failure only earns a record when the status is genuinely unexpected.
  if (kind === 'api_failure' && !isReportableStatus(status)) return null;

  return {
    at: context.at || new Date().toISOString(),
    kind,
    message,
    // Where in the app, as a path — never a full location with a query string.
    route: safeUrl(input.route).slice(0, MAX_ROUTE),
    // Where in the code.
    source: safeUrl(input.source),
    line: Number.isFinite(Number(input.line)) ? Number(input.line) : null,
    stack: scrubStack(input.stack),
    ...(Number.isFinite(status) ? { status } : {}),
    // Deployment identity, so an error can be tied to the release that caused
    // it — the first question during an incident.
    version: String(context.version || '').slice(0, 40),
    // Coarse client hint for reproducing. Trimmed hard; no fingerprinting.
    agent: String(input.agent || '').slice(0, 120),
    // Anonymous correlation only: never a user id, name or email.
    ref: String(input.ref || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16),
  };
}
