// api/_variables.js — Template variable resolver
// Replaces {{tokens}} in message text with per-recipient values.
// Called by api/cron.js and api/push.js before sending.

/**
 * Resolve all {{variable}} tokens in a template string.
 *
 * Available tokens:
 *   {{first_name}}     — recipient's first name (from subscription label)
 *   {{full_name}}      — full label string
 *   {{label}}          — full label string (alias used by custom templates)
 *   {{team_name}}      — hard-coded club name
 *   {{session_day}}    — next Tuesday or Thursday depending on today
 *   {{session_time}}   — "19:45"
 *   {{match_day}}      — nearest upcoming Saturday
 *   {{this_week}}      — week label e.g. "Week of 27 May"
 *   {{date_today}}     — "27 May 2026"
 *   {{coach_name}}     — resolved from context.coachName if provided
 *
 * @param {string}  template  Raw template string containing {{tokens}}
 * @param {object}  context   Optional overrides: { label, coachName }
 * @returns {string}          Resolved string ready to send
 */
export function resolveVariables(template, context = {}) {
  if (!template) return '';

  const now    = new Date();
  const label  = context.label || 'Player';
  const parts  = label.trim().split(/\s+/);
  const first  = parts[0] || 'Player';

  const vars = {
    first_name:   first,
    full_name:    label,
    label,
    team_name:    'Boitsfort RFC',
    session_day:  nextSessionDay(now),
    session_time: '19:45',
    match_day:    nextMatchDay(now),
    this_week:    weekLabel(now),
    date_today:   formatDate(now),
    coach_name:   context.coachName || 'Coach',
  };

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Next Tuesday or Thursday (whichever comes sooner) */
function nextSessionDay(now) {
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const day = now.getDay(); // 0=Sun … 6=Sat
  // Target days: Tuesday=2, Thursday=4
  const candidates = [2, 4].map(target => {
    let diff = target - day;
    if (diff <= 0) diff += 7;
    const d = new Date(now);
    d.setDate(now.getDate() + diff);
    return d;
  });
  candidates.sort((a, b) => a - b);
  const next = candidates[0];
  return `${DAY_NAMES[next.getDay()]} ${next.getDate()} ${monthName(next)}`;
}

/** Nearest upcoming Saturday */
function nextMatchDay(now) {
  const day = now.getDay();
  let diff = 6 - day;
  if (diff <= 0) diff += 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + diff);
  return `Saturday ${sat.getDate()} ${monthName(sat)}`;
}

/** "Week of 27 May 2026" — starting Monday */
function weekLabel(now) {
  const d = new Date(now);
  const day = d.getDay() || 7; // Mon=1 … Sun=7
  d.setDate(d.getDate() - day + 1); // rewind to Monday
  return `Week of ${d.getDate()} ${monthName(d)} ${d.getFullYear()}`;
}

function formatDate(d) {
  return `${d.getDate()} ${monthName(d)} ${d.getFullYear()}`;
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
function monthName(d) { return MONTHS[d.getMonth()]; }
