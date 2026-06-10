import { Routes, Route, Navigate } from 'react-router-dom'
import CommandLayout from './components/layout/CommandLayout.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ActionsPage from './pages/ActionsPage.jsx'
import PlayersPage from './pages/PlayersPage.jsx'
import CommunicationsPage from './pages/CommunicationsPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import SeasonPage from './pages/SeasonPage.jsx'
import MatchCentrePage from './pages/MatchCentrePage.jsx'

export default function App() {
  return (
    <CommandLayout>
      <Routes>
        <Route path="/"              element={<DashboardPage />} />
        <Route path="/actions"       element={<ActionsPage />} />
        <Route path="/players"       element={<PlayersPage />} />
        <Route path="/communications" element={<CommunicationsPage />} />
        <Route path="/reports"       element={<ReportsPage />} />
        <Route path="/season"        element={<SeasonPage />} />
        <Route path="/match-centre"  element={<MatchCentrePage />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </CommandLayout>
  )
}
