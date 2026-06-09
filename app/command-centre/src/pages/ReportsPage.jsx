import { useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { api } from '../api/client.js'

const REPORT_ACTIONS = [
  { id: 'committee.club_health',     label: 'Club Health Report',      icon: '🏥', desc: 'Full health score breakdown', cat: 'COMMITTEE' },
  { id: 'committee.executive_dashboard', label: 'Executive Dashboard', icon: '📊', desc: 'Full executive briefing',     cat: 'COMMITTEE' },
  { id: 'committee.membership_summary', label: 'Membership Report',    icon: '🎫', desc: 'Members, renewals, lapsed',  cat: 'COMMITTEE' },
  { id: 'committee.sponsor_summary', label: 'Sponsor Report',          icon: '🤝', desc: 'Deals, expiry, pipeline',    cat: 'COMMITTEE' },
  { id: 'committee.volunteer_summary',label: 'Volunteer Report',       icon: '🙋', desc: 'Activity, gaps, inactive',   cat: 'COMMITTEE' },
  { id: 'committee.risk_register',   label: 'Risk Register',           icon: '⚠️', desc: 'Club risks + mitigation',   cat: 'COMMITTEE' },
  { id: 'dor.academy_review',        label: 'Academy Review',          icon: '🎓', desc: 'U14-U20 full review',        cat: 'DIRECTOR_OF_RUGBY' },
  { id: 'dor.injury_trends',         label: 'Injury Trends',           icon: '📉', desc: 'Patterns + prevention',      cat: 'DIRECTOR_OF_RUGBY' },
  { id: 'dor.attendance_trends',     label: 'Attendance Trends',       icon: '📈', desc: 'Season over season',         cat: 'DIRECTOR_OF_RUGBY' },
  { id: 'dor.team_comparison',       label: 'Team Comparison',         icon: '⚖️', desc: 'Cross-squad analysis',       cat: 'DIRECTOR_OF_RUGBY' },
  { id: 'committee.agm_pack',        label: 'AGM Pack',                icon: '🗂', desc: 'Full AGM documentation',     cat: 'COMMITTEE' },
  { id: 'committee.weekly_pack',     label: 'Weekly Committee Pack',   icon: '📦', desc: 'Briefing + decisions',       cat: 'COMMITTEE' },
]

const CAT_COLOR = {
  COMMITTEE:         'bg-purple-500/10 border-purple-500/20 text-purple-400',
  DIRECTOR_OF_RUGBY: 'bg-danger/10 border-danger/20 text-danger',
}

export default function ReportsPage() {
  const [running, setRunning] = useState(null)
  const [openResult, setOpenResult] = useState(null)
  const [results, setResults] = useState({})

  async function run(action) {
    setRunning(action.id)
    try {
      const res = await api.runAction(action.id, {}, { role: 'admin' })
      const r = { ...res, label: action.label }
      setResults(prev => ({ ...prev, [action.id]: r }))
      setOpenResult(r)
    } catch (e) {
      setOpenResult({ success: false, label: action.label, summary: e.message })
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-1">Reports</h1>
        <p className="text-sm text-ink-3 mt-0.5">Generate any report instantly · powered by all 10 engines</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Report cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {REPORT_ACTIONS.map(a => {
            const done = results[a.id]
            return (
              <div
                key={a.id}
                className={`card card-hover card-active p-4 flex flex-col gap-2 border ${CAT_COLOR[a.cat] ?? 'border-border-subtle'}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-2xl">{running === a.id ? <Spinner size={24} /> : a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink-1">{a.label}</div>
                    <div className="text-xs text-ink-3 mt-0.5">{a.desc}</div>
                  </div>
                  {done && (
                    <span className="text-[10px] text-success flex-shrink-0">✓</span>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border-subtle mt-1">
                  <Button
                    variant="surface" size="sm"
                    onClick={() => run(a)}
                    disabled={!!running}
                    className="flex-1 justify-center text-xs"
                  >
                    {running === a.id ? 'Generating…' : 'Generate'}
                  </Button>
                  {done && (
                    <Button variant="ghost" size="sm" onClick={() => setOpenResult(done)} className="text-xs">
                      View
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Result viewer */}
        <div className="lg:col-span-1">
          <Card className="p-4 sticky top-20">
            <CardHeader
              title="Report Output"
              action={openResult ? <Button variant="ghost" size="sm" onClick={() => setOpenResult(null)}>✕</Button> : null}
            />
            {!openResult
              ? <EmptyState icon="📊" title="Select a report" description="Generate any report to view it here" />
              : (
                <div className="animate-slide-up">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={openResult.success !== false ? 'text-success' : 'text-danger'}>
                      {openResult.success !== false ? '✓' : '✕'}
                    </span>
                    <span className="text-sm font-medium text-ink-1">{openResult.label}</span>
                  </div>
                  <div className="text-xs text-ink-2 leading-relaxed bg-surface-1 rounded-lg p-3 max-h-80 overflow-y-auto whitespace-pre-wrap">
                    {openResult.summary ?? 'Report generated'}
                  </div>
                  {openResult.evidence?.length > 0 && (
                    <div className="mt-3">
                      <div className="section-title text-[10px] mb-1">Evidence</div>
                      <div className="space-y-1">
                        {openResult.evidence.slice(0, 5).map((e, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-ink-3">
                            <span className="text-accent mt-0.5">›</span>
                            <span>{e}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            }
          </Card>
        </div>
      </div>
    </div>
  )
}
