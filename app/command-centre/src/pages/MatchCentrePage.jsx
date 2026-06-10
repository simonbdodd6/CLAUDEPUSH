import { useState, useCallback } from 'react'
import { useUpcomingFixtures, useRecommendations } from '../hooks/useClubData.js'
import { api } from '../api/client.js'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Spinner, SkeletonBlock } from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'

const MATCH_CATEGORIES = ['player welfare', 'logistics', 'operations']

const STATUS_VARIANT = {
  SCHEDULED:  'neutral',
  PREPARING:  'warning',
  READY:      'success',
  COMPLETED:  'neutral',
  CANCELLED:  'danger',
}

const PRIORITY_VARIANT = { critical: 'danger', high: 'danger', medium: 'warning', low: 'neutral' }

function daysBadge(d) {
  if (d == null) return { label: 'TBC', variant: 'neutral' }
  if (d < 0)    return { label: 'Past', variant: 'neutral' }
  if (d === 0)  return { label: 'Today', variant: 'danger' }
  if (d === 1)  return { label: 'Tomorrow', variant: 'warning' }
  if (d <= 3)   return { label: `${d}d`, variant: 'warning' }
  if (d <= 7)   return { label: `${d}d`, variant: 'accent' }
  return              { label: `${d}d`, variant: 'neutral' }
}

function fmtKickoff(iso) {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleDateString('en-IE', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function checklistProgress(fixture) {
  const list = fixture.preparationChecklist ?? []
  if (!list.length) return null
  const done    = list.filter(t => t.status === 'done' || t.status === 'skipped').length
  const overdue = list.filter(t => t.status !== 'done' && t.status !== 'skipped' && t.dueAt && t.dueAt < new Date().toISOString()).length
  return { total: list.length, done, overdue, percent: Math.round((done / list.length) * 100) }
}

function FixtureRow({ fixture, selected, onSelect, onPrepare, preparing }) {
  const { label, variant } = daysBadge(fixture.daysToKickoff)
  const imminent = (fixture.daysToKickoff ?? 99) >= 0 && (fixture.daysToKickoff ?? 99) <= 3
  const prog = checklistProgress(fixture)

  return (
    <div
      onClick={() => onSelect(fixture.id)}
      className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
        selected
          ? 'bg-accent/5 border-accent/40'
          : imminent
            ? 'bg-warning/5 border-warning/20 hover:bg-warning/10'
            : 'bg-surface-1 border-border-subtle hover:bg-surface-3'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-ink-1">{fixture.teamName}</span>
            <Badge variant={STATUS_VARIANT[fixture.status] ?? 'neutral'} className="text-[10px]">
              {fixture.status ?? 'SCHEDULED'}
            </Badge>
            {(fixture.squadStatus?.injured?.length ?? 0) > 0 && (
              <Badge variant="danger" className="text-[10px]">
                {fixture.squadStatus.injured.length} inj
              </Badge>
            )}
            {(prog?.overdue ?? 0) > 0 && (
              <Badge variant="warning" className="text-[10px]">
                {prog.overdue} overdue
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            vs <span className="text-ink-2 font-medium">{fixture.opponent}</span>
            {' · '}{fmtKickoff(fixture.kickoff)}
            {' · '}{fixture.isHome === false ? 'Away' : 'Home'}
          </p>
          {prog && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all duration-500"
                  style={{ width: `${prog.percent}%` }}
                />
              </div>
              <span className="text-[10px] text-ink-3 flex-shrink-0">{prog.done}/{prog.total}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant={variant} className="text-[10px]">{label}</Badge>
          {imminent && !fixture.preparedAt && (
            <Button
              variant="surface" size="sm"
              onClick={e => { e.stopPropagation(); onPrepare(fixture.id) }}
              disabled={preparing === fixture.id}
              className="text-[10px]"
            >
              {preparing === fixture.id ? <Spinner size={12} /> : '⚡ Prep'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SquadIntelPanel({ fixture, onGenPack, generating }) {
  const [checklistOpen, setChecklistOpen] = useState(false)

  const available   = fixture.squadStatus?.available   ?? []
  const injured     = fixture.squadStatus?.injured     ?? []
  const uncertain   = fixture.squadStatus?.uncertain   ?? []
  const medical     = fixture.medicalAlerts            ?? []
  const milestones  = fixture.playerMilestones         ?? []
  const volRequired = fixture.volunteers?.required     ?? []
  const checklist   = fixture.preparationChecklist     ?? []
  const pack        = fixture.matchPack
  const prog        = checklistProgress(fixture)

  return (
    <Card className="p-4">
      <CardHeader
        title={`AI Intel — ${fixture.teamName} vs ${fixture.opponent}`}
        action={
          <Button
            variant={pack ? 'surface' : 'primary'} size="sm"
            onClick={() => onGenPack(fixture.id)}
            disabled={generating}
            className="text-xs"
          >
            {generating
              ? <><Spinner size={12} className="mr-1.5" />Generating…</>
              : pack ? '📋 Regenerate Pack' : '📋 Generate Match Pack'
            }
          </Button>
        }
      />

      <div className="space-y-4">
        {/* Squad availability summary */}
        {(available.length + injured.length + uncertain.length) > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-2">Squad availability</p>
            <div className="grid grid-cols-3 gap-2 text-center mb-2">
              <div className="p-2 rounded-lg bg-success/10 border border-success/20">
                <div className="text-xl font-bold text-success">{available.length}</div>
                <div className="text-[10px] text-success/80">Available</div>
              </div>
              <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
                <div className="text-xl font-bold text-warning">{uncertain.length}</div>
                <div className="text-[10px] text-warning/80">Uncertain</div>
              </div>
              <div className="p-2 rounded-lg bg-danger/10 border border-danger/20">
                <div className="text-xl font-bold text-danger">{injured.length}</div>
                <div className="text-[10px] text-danger/80">Injured</div>
              </div>
            </div>
            {injured.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {injured.slice(0, 6).map((p, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-danger/10 border border-danger/20 text-danger">
                    {p.name}{p.injury ? ` — ${p.injury}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Medical alerts */}
        {medical.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">⚕ Medical Alerts</p>
            <div className="space-y-1">
              {medical.slice(0, 4).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant={m.severity === 'HIGH' || m.severity === 'CRITICAL' ? 'danger' : 'warning'} className="text-[9px] flex-shrink-0">
                    {m.severity ?? 'FLAG'}
                  </Badge>
                  <span className="text-ink-2">{m.name ?? m.playerName} — {m.alert ?? m.note ?? m.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player milestones */}
        {milestones.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">🏆 Milestones</p>
            {milestones.slice(0, 3).map((m, i) => (
              <div key={i} className="text-xs text-ink-2 mb-0.5">
                <span className="text-accent mr-1.5">★</span>
                {m.name ?? m.playerName} — {m.milestone ?? m.note}
              </div>
            ))}
          </div>
        )}

        {/* Volunteers */}
        {volRequired.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">🙋 Volunteer Roles</p>
            <div className="flex flex-wrap gap-1.5">
              {volRequired.map((v, i) => (
                <Badge key={i} variant={v.filled ? 'success' : 'danger'} className="text-[10px]">
                  {v.role} {v.filled ? '✓' : '⚠'}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Preparation checklist */}
        {checklist.length > 0 && (
          <div className="pt-2 border-t border-border-subtle">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setChecklistOpen(o => !o)}
            >
              <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">
                ✓ Preparation Checklist
              </p>
              <div className="flex items-center gap-2">
                {prog && (
                  <span className="text-[10px] text-ink-3">{prog.done}/{prog.total} done</span>
                )}
                {prog?.overdue > 0 && (
                  <Badge variant="warning" className="text-[9px]">{prog.overdue} overdue</Badge>
                )}
                <span className="text-[10px] text-ink-3">{checklistOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {prog && (
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all duration-500"
                  style={{ width: `${prog.percent}%` }}
                />
              </div>
            )}

            {checklistOpen && (
              <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                {checklist.map((t, i) => {
                  const overdue = t.dueAt && t.dueAt < new Date().toISOString() && t.status !== 'done' && t.status !== 'skipped'
                  const done    = t.status === 'done' || t.status === 'skipped'
                  return (
                    <div
                      key={t.id ?? i}
                      className={`flex items-start gap-2 p-2 rounded text-xs ${
                        done    ? 'opacity-50' :
                        overdue ? 'bg-warning/5 border border-warning/20 rounded-lg' :
                                  'bg-surface-1'
                      }`}
                    >
                      <span className="text-sm flex-shrink-0 mt-0.5">
                        {done ? '✅' : overdue ? '⚠️' : '⏰'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`leading-snug ${done ? 'line-through text-ink-3' : 'text-ink-2'}`}>
                          {t.description}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[9px] text-ink-3">{t.assignee}</span>
                          <Badge variant={PRIORITY_VARIANT[t.priority] ?? 'neutral'} className="text-[9px]">
                            {t.priority}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Match pack preview */}
        {pack && (
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">📋 Match Pack</p>
            <div className="bg-surface-1 rounded-lg p-3 text-xs text-ink-2 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
              {pack.summary ?? pack.sections?.[0]?.content ?? 'Match pack generated successfully.'}
            </div>
          </div>
        )}

        {available.length === 0 && medical.length === 0 && !pack && checklist.length === 0 && (
          <EmptyState
            icon="⚡"
            title="Not yet prepared"
            description="Tap '⚡ Prep' on the fixture to load AI squad intelligence"
          />
        )}
      </div>
    </Card>
  )
}

export default function MatchCentrePage() {
  const fixturesHook = useUpcomingFixtures(8)
  const recsHook     = useRecommendations()

  const [selectedId, setSelectedId]       = useState(null)
  const [preparing, setPreparing]         = useState(null)
  const [generatingPack, setGeneratingPack] = useState(false)
  const [enriched, setEnriched]           = useState({})

  const fixtures = fixturesHook.data?.fixtures ?? []
  const matchRecs = (recsHook.data?.recommendations ?? []).filter(r =>
    MATCH_CATEGORIES.some(c => (r.category ?? '').toLowerCase().includes(c))
  )

  const selectedFixture = selectedId
    ? (enriched[selectedId] ?? fixtures.find(f => f.id === selectedId) ?? null)
    : null

  const handleSelect = useCallback(id => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const handlePrepare = useCallback(async id => {
    setPreparing(id)
    try {
      const prepared = await api.fixturePrepare(id)
      setEnriched(prev => ({ ...prev, [id]: prepared }))
      setSelectedId(id)
    } catch {
      setSelectedId(id)
    } finally {
      setPreparing(null)
    }
  }, [])

  const handleGenPack = useCallback(async id => {
    setGeneratingPack(true)
    try {
      const pack = await api.fixtureGenPack(id)
      setEnriched(prev => ({
        ...prev,
        [id]: { ...(prev[id] ?? fixtures.find(f => f.id === id) ?? {}), matchPack: pack },
      }))
    } catch {
      // pack errors don't break the page
    } finally {
      setGeneratingPack(false)
    }
  }, [fixtures])

  const nextFixture = fixtures[0] ?? null

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-1">Match Centre</h1>
        <p className="text-sm text-ink-3 mt-0.5">AI fixture intelligence · squad readiness · match pack generation</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fixture list + selected intel */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="p-4">
            <CardHeader
              title="Upcoming Fixtures"
              action={fixtures.length > 0
                ? <span className="text-xs text-ink-3">{fixtures.length} scheduled</span>
                : null
              }
            />

            {fixturesHook.loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <SkeletonBlock key={i} className="h-16 w-full" />)}
              </div>
            ) : fixtures.length === 0 ? (
              <EmptyState
                icon="📅"
                title="No fixtures scheduled"
                description="Schedule fixtures via the main coaching app"
              />
            ) : (
              <div className="space-y-2">
                {fixtures.map(f => (
                  <FixtureRow
                    key={f.id}
                    fixture={enriched[f.id] ?? f}
                    selected={selectedId === f.id}
                    onSelect={handleSelect}
                    onPrepare={handlePrepare}
                    preparing={preparing}
                  />
                ))}
              </div>
            )}
          </Card>

          {selectedFixture && (
            <SquadIntelPanel
              fixture={selectedFixture}
              onGenPack={handleGenPack}
              generating={generatingPack}
            />
          )}
        </div>

        {/* Right column: AI readiness + quick actions */}
        <div className="space-y-4">
          <Card className="p-4">
            <CardHeader
              title="AI Match Readiness"
              action={<span className="text-[10px] text-accent">✦ Live</span>}
            />

            {recsHook.loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <SkeletonBlock key={i} className="h-12 w-full" />)}
              </div>
            ) : matchRecs.length === 0 ? (
              <EmptyState icon="✅" title="All clear" description="No match-day alerts from the assistant" />
            ) : (
              <div className="space-y-2">
                {matchRecs.map((r, i) => (
                  <div key={r.id ?? i} className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
                    <div className="flex items-start gap-2">
                      <span className={`text-xs mt-0.5 flex-shrink-0 ${r.effort === 'high' ? 'text-danger' : 'text-warning'}`}>
                        {r.effort === 'high' ? '⚠' : '●'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-ink-1 leading-snug">{r.action}</p>
                        {r.why && (
                          <p className="text-[10px] text-ink-3 mt-0.5 leading-relaxed">{r.why}</p>
                        )}
                        {r.category && (
                          <Badge variant="neutral" className="text-[9px] mt-1">{r.category}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <CardHeader title="Quick Actions" />
            {nextFixture ? (
              <div className="space-y-2">
                <p className="text-[10px] text-ink-3 font-medium uppercase tracking-wider mb-2">
                  Next: {nextFixture.teamName} vs {nextFixture.opponent}
                </p>
                <Button
                  variant="surface" size="sm"
                  onClick={() => handlePrepare(nextFixture.id)}
                  disabled={!!preparing}
                  className="w-full justify-center text-xs"
                >
                  {preparing === nextFixture.id
                    ? <><Spinner size={12} className="mr-1.5" />Preparing…</>
                    : '⚡ Prepare with AI'
                  }
                </Button>
                <Button
                  variant="surface" size="sm"
                  onClick={() => { setSelectedId(nextFixture.id); handleGenPack(nextFixture.id) }}
                  disabled={generatingPack}
                  className="w-full justify-center text-xs"
                >
                  {generatingPack
                    ? <><Spinner size={12} className="mr-1.5" />Generating…</>
                    : '📋 Generate Match Pack'
                  }
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => handleSelect(nextFixture.id)}
                  className="w-full justify-center text-xs"
                >
                  {selectedId === nextFixture.id ? 'Hide details' : 'View AI details'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-ink-3 text-center py-4">No upcoming fixtures</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
