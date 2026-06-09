import { useState, useEffect } from 'react'

export default function TopBar({ title, subtitle, onCommandBarOpen, notifCount = 0 }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const greeting = time.getHours() < 12 ? 'Good morning' : time.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <header className="sticky top-0 z-20 bg-surface-0/80 backdrop-blur-md border-b border-border-subtle flex items-center gap-4 px-6 h-14">
      {/* Title */}
      <div className="flex-1 min-w-0">
        {title ? (
          <div>
            <h1 className="text-sm font-semibold text-ink-1 truncate">{title}</h1>
            {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
          </div>
        ) : (
          <p className="text-sm text-ink-2">{greeting}</p>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Command bar trigger */}
        <button
          onClick={onCommandBarOpen}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded bg-surface-2 border border-border-subtle text-xs text-ink-3 hover:text-ink-2 hover:border-border transition-all duration-150"
        >
          <span>⌘K</span>
          <span>Command</span>
        </button>

        {/* Notifications */}
        <button className="relative w-8 h-8 rounded flex items-center justify-center text-ink-2 hover:text-ink-1 hover:bg-surface-2 transition-all duration-150">
          <BellIcon />
          {notifCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] flex items-center justify-center font-medium">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2a4 4 0 0 1 4 4v2.5l1 1.5H3L4 8.5V6a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
