// CoachEasier Performance — pure SVG sparkline builder (SC1).
//
// Convention note: all rendering in CoachEasier lives inline in index.html.
// This module is kept in lockstep with `perfSparkline` inside index.html
// (same convention as src/player-identity.js ↔ mergeRosterPlayer) so the
// chart placeholder geometry stays unit-testable. Pure string in/out —
// no DOM.

/**
 * Build the points attribute for a polyline from a numeric series,
 * normalised into a w×h box with padding.
 * @param {number[]} values
 * @param {number} w
 * @param {number} h
 * @param {number} pad
 * @returns {string} e.g. "2,26 18,20 34,12"
 */
export function sparklinePoints(values, w = 120, h = 32, pad = 3) {
  const vals = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (vals.length < 2) return '';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return vals
    .map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * innerW;
      const y = pad + (1 - (v - min) / span) * innerH;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}
