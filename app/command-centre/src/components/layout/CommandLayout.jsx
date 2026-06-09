import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import CommandBar from '../command-bar/CommandBar.jsx'
import { useCommandBar } from '../../hooks/useCommandBar.js'

const PAGE_META = {
  '/':               { title: null },
  '/actions':        { title: 'Actions', subtitle: 'Every action across all engines' },
  '/players':        { title: 'Players', subtitle: 'Squad management & development' },
  '/communications': { title: 'Communications', subtitle: 'Drafts, sent, scheduled' },
  '/reports':        { title: 'Reports', subtitle: 'Club analytics & insights' },
}

export default function CommandLayout({ children }) {
  const location = useLocation()
  const { open, openBar, closeBar } = useCommandBar()
  const meta = PAGE_META[location.pathname] ?? {}

  return (
    <div className="min-h-screen bg-surface-0 text-ink-1">
      <Sidebar onCommandBarOpen={openBar} />

      <div className="ml-[220px] flex flex-col min-h-screen">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          onCommandBarOpen={openBar}
          notifCount={0}
        />
        <main className="flex-1 p-6 animate-fade-in">
          {children}
        </main>
      </div>

      {open && <CommandBar onClose={closeBar} />}
    </div>
  )
}
