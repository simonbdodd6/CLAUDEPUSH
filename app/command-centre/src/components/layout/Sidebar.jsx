import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/',               label: 'Home',            icon: <HomeIcon /> },
  { to: '/actions',        label: 'Actions',         icon: <ActionsIcon /> },
  { to: '/players',        label: 'Players',         icon: <PlayersIcon /> },
  { to: '/communications', label: 'Communications',  icon: <CommsIcon /> },
  { to: '/reports',        label: 'Reports',         icon: <ReportsIcon /> },
  { to: '/season',         label: 'Season',          icon: <SeasonIcon /> },
  { to: '/match-centre',   label: 'Match Centre',     icon: <MatchIcon />        },
  { to: '/availability',  label: 'Availability',     icon: <AvailabilityIcon /> },
  { to: '/intelligence',  label: 'Intelligence',     icon: <IntelligenceIcon />, badge: 'AI' },
]

export default function Sidebar({ onCommandBarOpen }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-surface-1 border-r border-border-subtle flex flex-col z-30">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white text-xs font-bold shadow-accent">
            CE
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-1">Coach's Eye</div>
            <div className="text-[10px] text-ink-3 leading-none mt-0.5">Command Centre</div>
          </div>
        </div>
      </div>

      {/* Search (Command Bar shortcut) */}
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

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        <div className="px-2 pb-1">
          <span className="section-title text-[10px]">Navigate</span>
        </div>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''}`
            }
          >
            <span className="nav-icon w-4 h-4 text-ink-3 flex-shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300 font-bold tracking-wide">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-border-subtle pt-3">
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-xs font-medium">
            A
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-ink-1 truncate">Admin</div>
            <div className="text-[10px] text-ink-3 truncate">coacheye.ie</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <path d="M2 6.5L8 2l6 4.5V14a.5.5 0 0 1-.5.5h-3.5v-3.5H6V14.5H2.5A.5.5 0 0 1 2 14V6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  )
}
function ActionsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <rect x="2" y="2" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="8.5" y="2" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="2" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}
function PlayersIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M1.5 14c0-2.485 2.015-4.5 4.5-4.5S10.5 11.515 10.5 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="11.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M13.5 13c0-1.657-1.343-3-3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function CommsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <path d="M2 3h12a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H9l-3 2.5V11H2a.5.5 0 0 1-.5-.5v-7A.5.5 0 0 1 2 3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  )
}
function ReportsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 10V8M8 10V6M11 10V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function MatchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5.5 8a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M8 4v1M8 11v1M4 8H5M11 8h1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
function AvailabilityIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="6.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 14c0-2.485 2.015-4.5 4.5-4.5S11 11.515 11 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M11.5 7l1.2 1.2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function SeasonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 2.5L3 1M12 2.5L13 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
function IntelligenceIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
      <circle cx="8" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 3.5V2M8 12v1.5M3.5 7H2M12 7h1.5M5.05 4.05 4 3M11.95 4.05 13 3M5.05 9.95 4 11M11.95 9.95 13 11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="8" cy="7" r="1.2" fill="currentColor" opacity="0.6"/>
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
