// CoachEasier Performance — pure formatting helpers (SC1).
// Free of DOM, fetch, and localStorage.

/**
 * "45 min" / "1 h 15 min" style duration label.
 * @param {number} minutes
 */
export function formatMinutes(minutes) {
  const m = Math.max(Math.round(Number(minutes) || 0), 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/**
 * Signed trend label for analytics tiles: "+4.2%", "−1.8%", "0%".
 * Uses a true minus sign for negatives, matching the app's typography.
 * @param {number} pct
 */
export function formatTrend(pct) {
  const n = Number(pct) || 0;
  if (n === 0) return '0%';
  const abs = Math.abs(n).toFixed(1).replace(/\.0$/, '');
  return n > 0 ? `+${abs}%` : `−${abs}%`;
}

/**
 * Relative day label for activity feeds: "Today", "Yesterday", "3 d ago".
 * `now` is injectable for tests.
 * @param {string} iso ISO datetime
 * @param {Date} [now]
 */
export function relativeDay(iso, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} d ago`;
}

/**
 * "Week 3 of 8" progress label.
 * @param {{currentWeek:number, weeks:number}} programme
 */
export function weekLabel(programme) {
  const week = Math.max(Number(programme?.currentWeek) || 0, 0);
  const weeks = Math.max(Number(programme?.weeks) || 0, 0);
  return `Week ${week} of ${weeks}`;
}
