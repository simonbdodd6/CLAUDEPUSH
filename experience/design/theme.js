// Tailwind theme extension absorbing the ported HUD tokens (design/tokens.css).
// Imported by experience/app/tailwind.config.js and merged into theme.extend so
// the HUD palette is available as Tailwind utility classes (e.g. text-hud-cyan).
// Presentation tokens only — no logic.

export const hudTheme = {
  colors: {
    hud: {
      bg:     '#020617',
      cyan:   '#22d3ee',
      blue:   '#38bdf8',
      green:  '#34d399',
      violet: '#a78bfa',
      pink:   '#fb7185',
      amber:  '#fbbf24',
      ink:    '#e0f2fe',
      muted:  '#7dd3fc',
      line:   'rgba(125,211,252,0.18)',
    },
  },
  boxShadow: {
    'hud-cyan':   '0 0 28px rgba(34,211,238,0.22)',
    'hud-violet': '0 0 28px rgba(167,139,250,0.22)',
    'hud-green':  '0 0 28px rgba(52,211,153,0.22)',
  },
}
