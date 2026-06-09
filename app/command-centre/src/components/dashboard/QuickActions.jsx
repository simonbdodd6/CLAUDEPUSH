import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '../ui/Card.jsx'
import { Spinner } from '../ui/Spinner.jsx'
import { api } from '../../api/client.js'
import { Button } from '../ui/Button.jsx'

const TOP_ACTIONS = [
  { id: 'coaching.training_session',  label: 'Generate Training',  icon: '🏉', cat: 'COACHING' },
  { id: 'coaching.match_preparation', label: 'Prepare Match',      icon: '📋', cat: 'COACHING' },
  { id: 'coaching.squad_selection',   label: 'Select Squad',       icon: '👥', cat: 'COACHING' },
  { id: 'coaching.injury_review',     label: 'Review Injuries',    icon: '🩺', cat: 'COACHING' },
  { id: 'comms.newsletter',           label: 'Newsletter',         icon: '📰', cat: 'COMMUNICATIONS' },
  { id: 'committee.club_health',      label: 'Club Report',        icon: '📊', cat: 'COMMITTEE' },
  { id: 'committee.executive_dashboard', label: 'Dashboard',       icon: '🏛', cat: 'COMMITTEE' },
  { id: 'committee.weekly_pack',      label: 'Weekly Pack',        icon: '📦', cat: 'COMMITTEE' },
  { id: 'players.player_review',      label: 'Player Review',      icon: '👤', cat: 'PLAYERS' },
  { id: 'coaching.attendance_review', label: 'Attendance',         icon: '📅', cat: 'COACHING' },
  { id: 'committee.agm_pack',         label: 'AGM Pack',           icon: '🗂', cat: 'COMMITTEE' },
  { id: 'ops.open_club',             label: 'Run This Week',       icon: '⚡', cat: 'CLUB_OPERATIONS' },
]

const CAT_BG = {
  COACHING:          'bg-accent/10 hover:bg-accent/20 text-accent',
  PLAYERS:           'bg-success/10 hover:bg-success/20 text-success',
  COMMUNICATIONS:    'bg-warning/10 hover:bg-warning/20 text-warning',
  COMMITTEE:         'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400',
  CLUB_OPERATIONS:   'bg-surface-3 hover:bg-surface-4 text-ink-2',
  DIRECTOR_OF_RUGBY: 'bg-danger/10 hover:bg-danger/20 text-danger',
}

export default function QuickActions({ onRunAction }) {
  const [running, setRunning] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const navigate = useNavigate()

  async function handleClick(action) {
    setRunning(action.id)
    setLastResult(null)
    try {
      const res = await api.runAction(action.id, {}, { role: 'admin' })
      setLastResult({ id: action.id, label: action.label, success: res.success !== false, summary: res.summary })
      onRunAction?.(res)
    } catch (e) {
      setLastResult({ id: action.id, label: action.label, success: false, summary: e.message })
    } finally {
      setRunning(null)
    }
  }

  return (
    <Card className="p-4">
      <CardHeader
        title="Quick Actions"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/actions')}>
            All 51 →
          </Button>
        }
      />

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {TOP_ACTIONS.map(a => {
          const isRunning = running === a.id
          const catCls    = CAT_BG[a.cat] ?? CAT_BG.CLUB_OPERATIONS
          return (
            <button
              key={a.id}
              onClick={() => handleClick(a)}
              disabled={!!running}
              className={`action-card ${catCls} border border-transparent transition-all duration-150 rounded-lg p-3 flex flex-col items-center gap-1.5 text-center`}
            >
              <div className="action-card-icon text-xl">
                {isRunning ? <Spinner size={20} /> : a.icon}
              </div>
              <span className="text-[11px] font-medium leading-tight">{a.label}</span>
            </button>
          )
        })}
      </div>

      {lastResult && (
        <div className={`mt-3 p-2.5 rounded-lg text-xs flex items-start gap-2 animate-slide-up ${lastResult.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          <span className="flex-shrink-0">{lastResult.success ? '✓' : '✕'}</span>
          <div>
            <span className="font-medium">{lastResult.label}</span>
            {lastResult.summary && <span className="text-inherit/70 ml-1">— {lastResult.summary.slice(0, 90)}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}
