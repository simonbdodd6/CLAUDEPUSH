Review Coach's Eye screens for mobile UX quality. Scope: $ARGUMENTS (if blank, review all rendered screens in index.html).

Checks to perform:

1. TOUCH TARGETS
   - Every interactive element must be ≥44px tall (Apple HIG minimum)
   - Flag any .btn, nav button, table row action, or form input below this threshold
   - Check .ob-row, .mctl-row, .filter-pill, .availability-buttons button

2. OVERFLOW & SCROLL
   - Tables wider than the mobile viewport must have overflow-x:auto wrappers
   - No content should be clipped or horizontally cut off at 375px viewport width
   - Check renderTraining, renderMatchday, renderPlayers, renderCoachOverview output

3. TYPOGRAPHY
   - Input/select/textarea must be font-size:16px on mobile to prevent iOS zoom
   - Body text must be ≥13px; muted/label text ≥11px
   - Headings must use --font-display (Bebas Neue) consistently

4. EMPTY STATES
   - Every list/table must have a meaningful empty state message (not just blank)
   - Empty states should suggest an action, not just say "No items found"

5. LOADING STATES
   - Async operations must show a visual indicator (spinner, skeleton, or disabled state)
   - Buttons that trigger async actions must disable during inflight to prevent double-submit

6. DARK THEME CONSISTENCY
   - No light-mode colours (#ffffff backgrounds, #000000 text, Tailwind *-50 shades) on dark panels
   - All status colours must use rgba() dark-theme equivalents, not CSS named colours
   - Check colour tokens: --ink, --muted, --page, --panel, --panel-2, --line, --green, --amber, --blue, --red

7. RESPONSIVE BREAKPOINTS
   - At 980px: sidebar must collapse, nav must render as 2-col grid with 44px min-height
   - At 768px: add-player form must be 2-col
   - At 480px: all forms must be single-column, cards must use 14px padding

8. VISUAL CONSISTENCY
   - Section headings must use consistent font-size and font-weight across all screens
   - Card borders must consistently use var(--line)
   - Button hierarchy (primary / secondary / ghost) must be visually distinct

Output:
- One finding per bullet with screen name and CSS class or render function reference
- Severity: [POLISH] [INCONSISTENCY] [REGRESSION] [BROKEN]
- End with: screens reviewed, total findings, top 3 fixes by impact

Rules:
- Report only. Do not edit index.html unless the user explicitly approves.
- Reference the design token system: colours, fonts, and spacing must always use CSS variables.
