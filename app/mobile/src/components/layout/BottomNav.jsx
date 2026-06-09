import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/',        icon: '⚡', label: 'Home'    },
  { to: '/today',   icon: '📅', label: 'Today'   },
  { to: '/match',   icon: '⚽', label: 'Match'   },
  { to: '/actions', icon: '▶',  label: 'Actions' },
  { to: '/alerts',  icon: '🔔', label: 'Alerts'  },
];

export default function BottomNav({ alertCount = 0 }) {
  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around px-2 py-2">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-150 min-w-[52px] ${
                isActive
                  ? 'text-accent'
                  : 'text-ink-3 active:text-ink-2 active:bg-surface-2'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative text-xl leading-none">
                  {tab.icon}
                  {tab.label === 'Alerts' && alertCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {alertCount > 9 ? '9+' : alertCount}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-semibold leading-none ${isActive ? 'text-accent' : 'text-ink-3'}`}>
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
