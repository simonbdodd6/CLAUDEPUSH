import { useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { api } from '../api/client.js'

const COMMS_ACTIONS = [
  { id: 'comms.newsletter',         label: 'Newsletter',         icon: '📰', desc: 'Weekly club newsletter' },
  { id: 'comms.match_report',       label: 'Match Report',       icon: '📋', desc: 'Post-match write-up' },
  { id: 'comms.match_preview',      label: 'Match Preview',      icon: '👀', desc: 'Pre-match article' },
  { id: 'comms.training_reminder',  label: 'Training Reminder',  icon: '⏰', desc: 'Squad training notification' },
  { id: 'comms.parent_email',       label: 'Parent Email',       icon: '📬', desc: 'Age group parent email' },
  { id: 'comms.social_media_pack',  label: 'Social Media Pack',  icon: '📱', desc: 'Week\'s social content' },
  { id: 'comms.sponsor_update',     label: 'Sponsor Update',     icon: '🤝', desc: 'Personalised sponsor email' },
  { id: 'comms.volunteer_request',  label: 'Volunteer Request',  icon: '🙋', desc: 'Recruit volunteers' },
  { id: 'comms.membership_reminder',label: 'Membership Reminder',icon: '🎫', desc: 'Renewal reminders' },
  { id: 'comms.club_announcement',  label: 'Club Announcement',  icon: '📢', desc: 'All-club message' },
]

export default function CommunicationsPage() {
  const [running, setRunning] = useState(null)
  const [results, setResults] = useState([])

  async function runAction(action) {
    setRunning(action.id)
    try {
      const res = await api.runAction(action.id, {}, { role: 'admin' })
      setResults(prev => [{ ...res, label: action.label, ts: new Date().toLocaleTimeString('en-IE') }, ...prev].slice(0, 10))
    } catch (e) {
      setResults(prev => [{ success: false, summary: e.message, label: action.label, ts: new Date().toLocaleTimeString('en-IE') }, ...prev].slice(0, 10))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-1">Communications</h1>
        <p className="text-sm text-ink-3 mt-0.5">All communication drafts require human approval before sending</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Action grid */}
        <div className="lg:col-span-2">
          <Card className="p-4">
            <CardHeader title="Communication Actions" action={
              <span className="text-xs text-ink-3">📨 All require approval</span>
            } />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMMS_ACTIONS.map(a => (
                <button
                  key={a.id}
                  onClick={() => runAction(a)}
                  disabled={!!running}
                  className="flex items-center gap-3 p-3 rounded-lg bg-surface-1 border border-border-subtle hover:bg-surface-3 hover:border-border transition-all duration-150 text-left"
                >
                  <span className="text-xl flex-shrink-0">{running === a.id ? <Spinner size={20} /> : a.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-1">{a.label}</div>
                    <div className="text-xs text-ink-3 truncate">{a.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Results / drafts panel */}
        <div>
          <Card className="p-4 sticky top-20">
            <CardHeader
              title="Draft Queue"
              action={results.length > 0
                ? <Button variant="ghost" size="sm" onClick={() => setResults([])}>Clear</Button>
                : null
              }
            />
            {results.length === 0
              ? <EmptyState icon="📝" title="No drafts yet" description="Run a communication action to generate a draft" />
              : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className={`p-3 rounded-lg text-xs border ${r.success !== false ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={r.success !== false ? 'text-success' : 'text-danger'}>{r.success !== false ? '✓' : '✕'}</span>
                        <span className="font-medium text-ink-1">{r.label}</span>
                        <span className="text-ink-3 ml-auto">{r.ts}</span>
                      </div>
                      <p className="text-ink-2 leading-relaxed">{r.summary?.slice(0, 120)}</p>
                      {r.success !== false && (
                        <div className="flex gap-1.5 mt-2">
                          <Button variant="surface" size="sm" className="text-[10px]">Edit</Button>
                          <Button variant="primary" size="sm" className="text-[10px]">Approve</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            }
          </Card>
        </div>
      </div>
    </div>
  )
}
