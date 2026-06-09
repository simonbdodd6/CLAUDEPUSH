import { useClubHealth, useInjuries, useAttendance, useRecommendations, useHistory, useApprovals } from '../hooks/useClubData.js'
import ClubHealthCard from '../components/dashboard/ClubHealthCard.jsx'
import TodayPriorities from '../components/dashboard/TodayPriorities.jsx'
import QuickActions from '../components/dashboard/QuickActions.jsx'
import { InjuryAlerts, AttendanceAlerts } from '../components/dashboard/PlayerAlerts.jsx'
import AIRecommendations from '../components/dashboard/AIRecommendations.jsx'
import ApprovalsQueue from '../components/dashboard/ApprovalsQueue.jsx'
import ActionHistoryFeed from '../components/dashboard/ActionHistoryFeed.jsx'
import { usePlatformStatus } from '../hooks/useClubData.js'

export default function DashboardPage() {
  const health    = useClubHealth()
  const injuries  = useInjuries()
  const attend    = useAttendance()
  const recs      = useRecommendations()
  const hist      = useHistory()
  const approvals = useApprovals()
  const platform  = usePlatformStatus()

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const dateStr  = now.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-1">{greeting}</h1>
        <p className="text-sm text-ink-3 mt-0.5">{dateStr} · Coach's Eye Command Centre</p>
      </div>

      {/* Platform status bar */}
      {platform.data && (
        <div className="mb-5 flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border-subtle text-xs text-ink-3">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
          <span>Platform online</span>
          <span className="mx-1 text-ink-3/40">·</span>
          <span>{platform.data.engines ?? 10} engines active</span>
          <span className="mx-1 text-ink-3/40">·</span>
          <span>{platform.data.stats?.totalCapabilities ?? 54} capabilities</span>
          <span className="ml-auto text-accent/70">✦ AI Copilot ready</span>
        </div>
      )}

      {/* Row 1: Health + Priorities + Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ClubHealthCard data={health.data} loading={health.loading} />
        <TodayPriorities data={health.data} />
        <ApprovalsQueue  data={approvals.data} loading={approvals.loading} />
      </div>

      {/* Row 2: Quick Actions (full width) */}
      <div className="mb-4">
        <QuickActions />
      </div>

      {/* Row 3: Injury + Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <InjuryAlerts    data={injuries.data} loading={injuries.loading} />
        <AttendanceAlerts data={attend.data}  loading={attend.loading} />
      </div>

      {/* Row 4: AI Recommendations + History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AIRecommendations data={recs.data}  loading={recs.loading} />
        <ActionHistoryFeed data={hist.data}  loading={hist.loading} />
      </div>

    </div>
  )
}
