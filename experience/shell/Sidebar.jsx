// Sidebar (Experience Layer, M32)
// Rewritten nav: the command centre is a single Mission Control surface, so the
// nav anchors scroll to each of the five visual areas instead of routing to the
// retired admin pages. Presentation only.

const AREAS = [
  { href: '#area-brain',     label: 'Living Neural Brain', icon: <BrainIcon />,    badge: 'AI' },
  { href: '#area-memory',    label: 'Memory Network',      icon: <GraphIcon />,    badge: 'AI' },
  { href: '#area-dna',       label: 'Coach DNA',           icon: <DnaIcon />,      badge: 'AI' },
  { href: '#area-readiness', label: 'Match Readiness',     icon: <ReadinessIcon /> },
  { href: '#area-opponent',  label: 'Opponent Intel',      icon: <OpponentIcon />, badge: 'AI' },
  { href: '#area-season',    label: 'Season',              icon: <SeasonIcon /> },
]

export default function Sidebar({ onCommandBarOpen }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-surface-1 border-r border-border-subtle flex flex-col z-30">
      <div className="px-4 pt-5 pb-4 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white text-xs font-bold shadow-accent">CE</div>
          <div>
            <div className="text-sm font-semibold text-ink-1">Coach's Eye</div>
            <div className="text-[10px] text-ink-3 leading-none mt-0.5">Intelligence</div>
          </div>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <button
          onClick={onCommandBarOpen}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-2 border border-border-subtle text-ink-3 text-xs hover:text-ink-2 hover:border-border transition-all duration-150 group"
        >
          <SearchIcon className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Search or run…</span>
          <kbd className="px-1 py-0.5 rounded text-[9px] bg-surface-3 text-ink-3 font-mono group-hover:text-ink-2">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        <div className="px-2 pb-1">
          <span className="section-title text-[10px]">Command Centre</span>
        </div>
        {AREAS.map(item => (
          <a key={item.href} href={item.href} className="nav-item">
            <span className="nav-icon w-4 h-4 text-ink-3 flex-shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="text-[9px] px-1 py-0.5 rounded font-bold tracking-wide bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300">
                {item.badge}
              </span>
            )}
          </a>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-border-subtle pt-3">
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-xs font-medium">A</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-ink-1 truncate">Experience Layer</div>
            <div className="text-[10px] text-ink-3 truncate">placeholder · M32</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function BrainIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="8" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 3.5V2M8 12v1.5M3.5 7H2M12 7h1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="8" cy="7" r="1.2" fill="currentColor" opacity="0.6"/>
    </svg>
  )
}
function GraphIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="8" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="3" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="13" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="8" y1="4.8" x2="3.8" y2="10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="8" y1="4.8" x2="12.2" y2="10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="4.8" y1="12" x2="11.2" y2="12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
function DnaIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <path d="M5 2c0 3 6 3 6 6s-6 3-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M11 2c0 3-6 3-6 6s6 3 6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M5.6 4h4.8M5.6 12h4.8M4.7 6.5h6.6M4.7 9.5h6.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}
function ReadinessIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 8l2.5-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M8 3v1M13 8h-1M8 13v-1M3 8h1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
function SeasonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <path d="M2 11l3.5-4 3 2.5L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 4h3v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function OpponentIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 13c0-1.7 1.3-3 3-3s3 1.3 3 3M8 13c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function SearchIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
