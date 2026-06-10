import { useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { api } from '../api/client.js'
import { useRecommendations } from '../hooks/useClubData.js'

const COMMS_ACTIONS = [
  { id: 'comms.newsletter',         label: 'Newsletter',         icon: '📰', desc: 'Weekly club newsletter',        keywords: ['newsletter', 'weekly'] },
  { id: 'comms.match_report',       label: 'Match Report',       icon: '📋', desc: 'Post-match write-up',           keywords: ['match report', 'post-match'] },
  { id: 'comms.match_preview',      label: 'Match Preview',      icon: '👀', desc: 'Pre-match article',             keywords: ['match preview', 'pre-match'] },
  { id: 'comms.training_reminder',  label: 'Training Reminder',  icon: '⏰', desc: 'Squad training notification',   keywords: ['training reminder', 'training'] },
  { id: 'comms.parent_email',       label: 'Parent Email',       icon: '📬', desc: 'Age group parent email',        keywords: ['parent', 'email'] },
  { id: 'comms.social_media_pack',  label: 'Social Media Pack',  icon: '📱', desc: 'Week\'s social content',        keywords: ['social', 'media'] },
  { id: 'comms.sponsor_update',     label: 'Sponsor Update',     icon: '🤝', desc: 'Personalised sponsor email',    keywords: ['sponsor', 'update'] },
  { id: 'comms.volunteer_request',  label: 'Volunteer Request',  icon: '🙋', desc: 'Recruit volunteers',            keywords: ['volunteer'] },
  { id: 'comms.membership_reminder',label: 'Membership Reminder',icon: '🎫', desc: 'Renewal reminders',             keywords: ['membership', 'renewal', 'reminder'] },
  { id: 'comms.club_announcement',  label: 'Club Announcement',  icon: '📢', desc: 'All-club message',              keywords: ['announcement', 'club'] },
]

function isSuggested(action, recs) {
  const text = recs.map(r => (r.action ?? '').toLowerCase()).join(' ')
  return action.keywords.some(kw => text.includes(kw))
}

export default function CommunicationsPage() {
  const [running, setRunning] = useState(null)
  const [results, setResults] = useState([])
  const recsHook = useRecommendations()
  const recs = recsHook.data?.recommendations ?? []

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

  const suggestedActions = COMMS_ACTIONS.filter(a => isSuggested(a, recs))

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-1">Communications</h1>
        <p className="text-sm text-ink-3 mt-0.5">All communication drafts require human approval before sending</p>
      </div>

      {/* AI suggestions strip — only shown when assistant recommends comms */}
      {suggestedActions.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-accent/5 border border-accent/20 flex items-start gap-3">
          <span className="text-accent text-sm mt-0.5">✦</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ink-1 mb-1">Assistant suggests {suggestedActions.length} communication{suggestedActions.length > 1 ? 's' : ''} this week</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedActions.map(a => (
                <button
                  key={a.id}
                  onClick={() => runAction(a)}
                  disabled={!!running}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Action grid */}
        <div className="lg:col-span-2">
          <Card className="p-4">
            <CardHeader title="Communication Actions" action={
              <span className="text-xs text-ink-3">📨 All require approval</span>
            } />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMMS_ACTIONS.map(a => {
                const suggested = isSuggested(a, recs)
                return (
                  <button
                    key={a.id}
                    onClick={() => runAction(a)}
                    disabled={!!running}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 text-left ${
                      suggested
                        ? 'bg-accent/5 border-accent/30 hover:bg-accent/10'
                        : 'bg-surface-1 border-border-subtle hover:bg-surface-3 hover:border-border'
                    }`}
                  >
                    <span className="text-xl flex-shrink-0">{running === a.id ? <Spinner size={20} /> : a.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-ink-1">{a.label}</span>
                        {suggested && <Badge variant="accent" className="text-[9px]">AI</Badge>}
                      </div>
                      <div className="text-xs text-ink-3 truncate">{a.desc}</div>
                    </div>
                  </button>
                )
              })}
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
