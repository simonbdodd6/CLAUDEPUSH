import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import CommandBar from '../components/command-bar/CommandBar.jsx'
import { useCommandBar } from '../components/command-bar/useCommandBar.js'

// CommandLayout (Experience Layer, M32)
// Single-surface shell: sidebar + topbar + the command centre. The command bar's
// suggestions arrive as props (placeholder catalogs injected by the app bootstrap)
// — the shell itself fetches nothing.
export default function CommandLayout({ children, actions = [], prompts = [] }) {
  const { open, openBar, closeBar } = useCommandBar()

  return (
    <div className="min-h-screen bg-surface-0 text-ink-1">
      <Sidebar onCommandBarOpen={openBar} />

      <div className="ml-[220px] flex flex-col min-h-screen">
        <TopBar
          title="Intelligence"
          subtitle="Neural command centre"
          onCommandBarOpen={openBar}
          notifCount={0}
        />
        <main className="flex-1 animate-fade-in">
          {children}
        </main>
      </div>

      {open && <CommandBar onClose={closeBar} actions={actions} prompts={prompts} />}
    </div>
  )
}
