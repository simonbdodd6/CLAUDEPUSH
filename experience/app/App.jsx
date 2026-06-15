import { Routes, Route, Navigate } from 'react-router-dom'
import CommandLayout from '../shell/CommandLayout.jsx'
import MissionControlPage from './pages/MissionControlPage.jsx'
import { PLACEHOLDER_ACTIONS, QUICK_PROMPTS } from '../placeholders/action-catalogs.js'

// App (Experience Layer, M32) — single command-centre surface. The bootstrap is the
// only place placeholder data is injected; it flows down as props to the shell and
// the page. One route; a catch-all redirect keeps the single surface stable.
export default function App() {
  return (
    <CommandLayout actions={PLACEHOLDER_ACTIONS} prompts={QUICK_PROMPTS}>
      <Routes>
        <Route path="/" element={<MissionControlPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CommandLayout>
  )
}
