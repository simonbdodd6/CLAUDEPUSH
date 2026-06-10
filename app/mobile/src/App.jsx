import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MobileLayout from './components/layout/MobileLayout.jsx';
import HomePage     from './pages/HomePage.jsx';
import TodayPage    from './pages/TodayPage.jsx';
import ActionsPage  from './pages/ActionsPage.jsx';
import MatchPage    from './pages/MatchPage.jsx';
import AlertsPage   from './pages/AlertsPage.jsx';
import { useMobileData, useAlerts } from './hooks/useMobileData.js';
import { useCommandBar }            from './hooks/useCommandBar.js';

export default function App() {
  const data    = useMobileData();
  const { alerts, loading: alertsLoading, criticalCount } = useAlerts();
  const cmdBar  = useCommandBar();

  const sharedProps = { data, alerts };

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MobileLayout cmdBar={cmdBar} alertCount={criticalCount} />}>
          <Route index         element={<HomePage   {...sharedProps} />} />
          <Route path="today"  element={<TodayPage  {...sharedProps} />} />
          <Route path="match"  element={<MatchPage  upcomingFixtures={data.upcomingFixtures} recommendations={data.recommendations} />} />
          <Route path="actions"element={<ActionsPage />} />
          <Route path="alerts" element={<AlertsPage alerts={alerts} loading={alertsLoading} />} />
          <Route path="*"      element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
