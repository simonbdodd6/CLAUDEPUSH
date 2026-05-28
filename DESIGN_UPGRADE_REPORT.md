# coacheseyeGPT — Midnight Stadium Design Upgrade Report

**Date:** 2026-05-28  
**Project:** Boitsfort RFC · coacheseyeGPT PWA
**Scope:** Complete visual overhaul of `index.html` — dark design system from scratch

---

## Summary

Transformed the coacheseyeGPT MVP from a light utility app into a premium dark-first sports tech product. The overhaul is 100% confined to `index.html` — zero new dependencies, all functionality preserved.

---

## What Changed

### Phase 1 — Design System Tokens
Replaced the entire `:root` CSS variable set with the **Midnight Stadium** palette:

| Token | Old | New |
|---|---|---|
| `--page` | `#ffffff` | `#090d14` |
| `--panel` | `#ffffff` | `#0f1724` |
| `--panel-2` | *(new)* | `#141e2e` |
| `--line` | `#e5e7eb` | `#1e2d3d` |
| `--ink` | `#111827` | `#e2e8f0` |
| `--muted` | `#6b7280` | `#64748b` |
| `--green` | `#168557` | `#10b981` |
| `--nav` | `#1a2e25` | `#060b12` |
| `--shadow` | light | `0 8px 24px rgba(0,0,0,0.4)` |
| `--glow-green` | *(new)* | `0 0 24px rgba(16,185,129,0.18)` |

### Phase 2 — Typography
Replaced `Inter` with a three-font stack:
- **DM Sans** — body text (humanist sans, excellent legibility on dark)
- **Bebas Neue** — display/stat numbers (large numerals in KPI cards, stat strips, medical figures)
- **JetBrains Mono** — team codes, schedule times, code snippets

All loaded via Google Fonts `@import` inside the style block (no extra `<link>` tags, no build step).

### Phase 3 — Dark Layout
Every surface converted to dark:
- `.workspace` background → `#090d14`
- `.card` → `#0f1724` with dark border `#1e2d3d`
- `.panel-2` (elevated/nested cards) → `#141e2e`
- `.btn` → dark glass surface with hover brightening
- `.btn.primary` → solid emerald with black text (high contrast)
- All `input`, `select`, `textarea` → `#141e2e` background, emerald focus ring
- `select option` styled for dark OS context menus

### Phase 4 — Status Badges
Converted from light-tinted badges to dark translucent variants:
- Available → `rgba(52,211,153,0.10)` bg · `#34d399` text
- Unavailable/Injured → `rgba(248,113,113,0.10)` · `#f87171`
- Maybe → `rgba(251,191,36,0.10)` · `#fbbf24`
- No-reply → `rgba(100,116,139,0.10)` · `#64748b`

### Phase 5 — Stat Cards with Bebas Neue
KPI strip numbers use `font-family: var(--font-display)` (Bebas Neue) at 44px with `font-weight: 400`. Same treatment applied to:
- `.pkg-stat strong` (Rugby package overview)
- `.training-stat strong` (Training hero strip)
- `.med-stat strong` (Medical overview)
- `countUp` animation on all display figures

### Phase 6 — CSS Animations
New keyframe animations added:
- `@keyframes fadeUp` — section transitions (opacity + translateY 9px)
- `@keyframes shimmer` — skeleton loading placeholder
- `@keyframes pulseGlow` — green glow pulse for active elements
- `@keyframes ripple` — button tap ripple
- `@keyframes slideInToast` — toast notification entry
- `@keyframes countUp` — stat number entrance

### Phase 7 — Sidebar Refinements
- Sidebar gradient updated to `#0a1520 → #060b12`
- Radial green glow at 15%/8% reduced to 8% opacity (more atmospheric)
- Right border: `1px solid rgba(16,185,129,0.07)` — subtle boundary
- Active nav item: left-side 2px green border + emerald text
- `.brand-mark` gets `box-shadow: var(--glow-green)`
- Push dot `.on` state: `#10b981` with glow ring
- View switch active state: emerald fill, dark text (accessible contrast)

### Phase 8 — Pitch & Matchday
- Pitch turf: `#0f4a28 → #145e34` (darker, more cinematic)
- Pitch border: `#0a3319`
- Slot overlay: `rgba(9,13,20,0.92)` (deep navy, not black)
- Slot numbers: emerald on dark background
- `.play-btn` on video cards: emerald with dark icon

### Phase 9 — Interactive States
- All `.row`, `.card`, `.schedule-card` hover transitions: `border-color 0.12s`
- `.srv-panel summary` hover: `var(--panel-2)` tint
- `.session-card-tab` hover: `#263d52` border
- `.training-player-list button` focus state: emerald border + tint

### Phase 10 — Scrollbar & Selection
```css
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-thumb { background: #1e2d3d; }
::selection { background: rgba(16,185,129,0.22); }
:focus-visible { outline: 2px solid var(--green); }
```

### Phase 11 — Responsive Improvements
- 980px breakpoint: 2-column grid instead of 1-column for stats/session headers
- 480px breakpoint added for mobile-specific tweaks
- Training hero collapses gracefully at 980px
- Stats grid goes single column at 480px

### Phase 12 — JS Inline Color Patches
All 15 hardcoded light-mode hex values in JavaScript `innerHTML` template strings replaced with dark equivalents:
- `#f0fdf4` → `rgba(16,185,129,0.1)` (green soft tints)
- `#fff`, `#f9fafb` → `var(--panel-2)` (interactive backgrounds)
- `#fefce8`, `#fde68a` → amber dark equivalents
- `#dcfce7`, `#fee2e2` → dark translucent badge variants
- Push status card dynamic borders updated

---

## What Was NOT Changed

- ✅ `STORAGE_KEY = "coach-eye-real-workflow-mvp-state-v1"` — unchanged
- ✅ All JavaScript functionality — push notifications, schedules, availability, player DB
- ✅ All `/api/` endpoint calls — unchanged
- ✅ `api/cron.js`, `api/availability.js`, `api/schedules.js` — untouched
- ✅ `vercel.json` — untouched
- ✅ `sw.js` — untouched
- ✅ No new npm dependencies

---

## File Stats

| Metric | Before | After |
|---|---|---|
| CSS lines | ~815 | ~940 |
| CSS variables | 16 | 24 |
| Keyframe animations | 1 | 7 |
| JS inline color fixes | 0 | 15 |
| New fonts | 0 | 3 |
| New npm packages | 0 | 0 |

---

## Visual Design Principles Applied

1. **Dark before light** — every surface defaults dark, no `prefers-color-scheme` toggle needed
2. **Emerald as the single accent** — `#10b981` used sparingly for active states, CTAs, and data highlights
3. **Depth through opacity, not colour** — panels are the same hue family, differentiated by lightness
4. **Typography hierarchy** — Bebas Neue for numbers (sports-tech feel), DM Sans for prose (readable)
5. **Motion with restraint** — fadeUp on section load, countUp on KPI numbers, no continuous animations on non-interactive elements
