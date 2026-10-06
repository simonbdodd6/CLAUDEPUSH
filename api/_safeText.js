/**
 * SAFE TEXT AT THE SERVER BOUNDARY (Build 133).
 *
 * Build 132 found player-controlled values reaching coach screens as markup:
 * a position like `1<img src=x onerror=…>` passed the rugby-position check (it
 * contains "1"), a chat reply id was stored verbatim and placed inside an
 * inline click handler, and reaction keys were stored as sent. The client now
 * escapes every one of those sinks; these checks are the second wall, so a
 * value that could only ever be markup is REFUSED where it enters, not
 * cleaned up and kept.
 *
 * The rules refuse only characters no real value of that kind needs:
 *   names      — no < > " ` and no control characters (O'Brien, Zoë, Jean-Luc,
 *                "Dr. Smith Jr." all pass);
 *   positions  — letters, digits, spaces and . , ' & ( ) / + # and dashes
 *                ("2 — Hooker", "No. 8", "Back row (6/7)");
 *   ids        — letters, digits and _ . : - (dm:<a>:<b>, group:<gid>, msg_…);
 *   reactions  — emoji code points only.
 * Each returns a boolean; callers decide the status and the message.
 */

const CONTROL = /[\u0000-\u001f\u007f]/;
const NAME_FORBIDDEN = /[<>"`]/;

/** A person's (or a conversation's) display name: present, bounded, inert. */
export function isSafeName(value, { max = 80 } = {}) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > max) return false;
  return !NAME_FORBIDDEN.test(v) && !CONTROL.test(v);
}

const POSITION_CHARS = /^[\p{L}\p{N} .,'&()/+#‐-―-]+$/u;

/** A playing position as typed or chosen: bounded, from the position charset. */
export function isSafePosition(value, { max = 40 } = {}) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > max) return false;
  return POSITION_CHARS.test(v);
}

const ID_CHARS = /^[A-Za-z0-9_.:-]+$/;

/** An identifier that will be placed in markup or a handler: a plain token. */
export function isSafeId(value, { max = 120 } = {}) {
  if (typeof value !== 'string') return false;
  return value.length > 0 && value.length <= max && ID_CHARS.test(value);
}

// One reaction = one emoji: pictographs, skin-tone modifiers, regional-indicator
// pairs (flags), keycaps, joined by ZWJ / variation selectors. Nothing else.
const EMOJI = /^(?:[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}]|[0-9#*]️?⃣|‍|️)+$/u;

/** A chat reaction key. */
export function isSafeReaction(value, { max = 16 } = {}) {
  if (typeof value !== 'string') return false;
  if (!value || value.length > max) return false;
  if (!EMOJI.test(value)) return false;
  // At least one pictograph — a bare ZWJ / selector run is not an emoji.
  return /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}⃣]/u.test(value);
}

/** A short label (a conversation icon): an emoji, or one-to-four inert characters. */
export function isSafeIcon(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 16) return false;
  if (isSafeReaction(value)) return true;
  return value.trim().length <= 4 && !NAME_FORBIDDEN.test(value) && !CONTROL.test(value) && !/[&'=]/.test(value);
}

/** An email address that can never be markup (the shape check lives with the caller). */
export function isSafeEmailText(value) {
  if (typeof value !== 'string') return false;
  return !/[\s<>"`(),;:\\[\]]/.test(value) && !CONTROL.test(value);
}
