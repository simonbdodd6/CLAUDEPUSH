// src/staff-roles.js — THE canonical staff-role classification, in one place.
//
// It lives under /src rather than /api because BOTH sides need it:
//   · the serverless functions, through api/_permissions.js (which re-exports
//     it, so server code keeps importing exactly what it always imported);
//   · the BROWSER, through src/player-identity.js → src/chat-state.js.
//
// Why it moved (MESSAGES-NEW-CONVERSATION-FIX-1, 2026-09-15): player-identity
// imported it from ../api/_permissions.js. vercel.json deliberately redirects
// every /api/*.js file request to /404.html so serverless source can never be
// served (the H1 source-exposure fix) — so in production that import resolved
// to an HTML page. The browser refuses to execute HTML as a module, which
// failed the whole chat-state import chain: Messages silently lost its state
// module, and clicking a search result in New Message did nothing at all.
// /src IS served as JavaScript, so the chain loads and the /api block stands.
//
// CLASSIFICATION ONLY. It grants no authority: what a member may DO stays with
// can()/permissionsFor() and operationalGroupsFor in api/_permissions.js.
// snc (S&C Coach) and analyst are staff here for visibility, messaging and the
// roster projection; they gain no Medical access and no group they did not
// already hold.

export const STAFF_ROLES = Object.freeze(['coach', 'admin', 'medical', 'snc', 'analyst']);

/** True when a STORED member/user role string is a staff classification. */
export function isStaffRole(role) {
  return STAFF_ROLES.includes(String(role || '').toLowerCase());
}
