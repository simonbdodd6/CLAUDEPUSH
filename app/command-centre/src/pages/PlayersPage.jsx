import { useState } from 'react'
import { useInjuries, useAttendance } from '../hooks/useClubData.js'
import { InjuryAlerts, AttendanceAlerts } from '../components/dashboard/PlayerAlerts.jsx'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { api } from '../api/client.js'

const PLAYER_ACTIONS = [
  { id: 'players.player_review',    label: 'Player Review',       icon: '📋' },
  { id: 'players.progress_report',  label: 'Progress Report',     icon: '📈' },
  { id: 'players.return_to_play',   label: 'Return To Play',      icon: '🩺' },
  { id: 'players.training_load',    label: 'Training Load',       icon: '⚖️' },
  { id: 'players.squad_health',     label: 'Squad Health',        icon: '❤️' },
  { id: 'players.parent_update',    label: 'Parent Update',       icon: '📬' },
  { id: 'players.development_pathway', label: 'Dev Pathway',      icon: '🎯' },
]

export default function PlayersPage() {
  const injuries = useInjuries()
  const attend   = useAttendance()
  const [running, setRunning] = useState(null)
  const [results, setResults] = useState({})

  async function runAction(id) {
    setRunning(id)
    try {
      const res = await api.runAction(id, {}, { role: 'coach' })
      setResults(prev => ({ ...prev, [id]: res }))
    } catch (e) {
      setResults(prev => ({ ...prev, [id]: { success: false, summary: e.message } }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-1">Players</h1>
        <p className="text-sm text-ink-3 mt-0.5">Squad management, development and welfare</p>
      </div>

      {/* Player action grid */}
      <Card className="p-4 mb-5">
        <CardHeader title="Player Actions" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {PLAYER_ACTIONS.map(a => (
            <button
              key={a.id}
              onClick={() => runAction(a.id)}
              disabled={!!running}
              className="flex flex-col items-center gap-2 p-3 rounded-lg bg-surface-1 border border-border-subtle hover:bg-surface-3 hover:border-border hover:-translate-y-0.5 transition-all duration-150 text-center"
            >
              <span className="text-xl">{running === a.id ? <Spinner size={20} /> : a.icon}</span>
              <span className="text-[11px] font-medium text-ink-2 leading-tight">{a.label}</span>
              {results[a.id] && (
                <span className={`text-[9px] ${results[a.id].success !== false ? 'text-success' : 'text-danger'}`}>
                  {results[a.id].success !== false ? '✓ Done' : '✕ Error'}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InjuryAlerts    data={injuries.data} loading={injuries.loading} />
        <AttendanceAlerts data={attend.data}  loading={attend.loading} />
      </div>

      {/* Result panel */}
      {Object.keys(results).length > 0 && (
        <Card className="p-4 mt-4">
          <CardHeader title="Results" action={
            <Button variant="ghost" size="sm" onClick={() => setResults({})}>Clear</Button>
          } />
          <div className="space-y-2">
            {Object.entries(results).map(([id, res]) => (
              <div key={id} className={`p-3 rounded-lg text-xs ${res.success !== false ? 'bg-success/10 border border-success/20' : 'bg-danger/10 border border-danger/20'}`}>
                <div className="font-medium text-ink-1 mb-1">{id.split('.')[1]?.replace(/_/g,' ')}</div>
                <p className="text-ink-2">{res.summary?.slice(0, 200) ?? 'Completed'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
