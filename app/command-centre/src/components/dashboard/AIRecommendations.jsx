import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Button } from '../ui/Button.jsx'
import { Spinner } from '../ui/Spinner.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'
import { api } from '../../api/client.js'

const EFFORT_COLORS = { low: 'success', medium: 'warning', high: 'danger' }
const TIER_LABELS   = { AUTO: 'Auto', APPROVE: 'Needs approval', HUMAN: 'Coach decision' }
const TIER_VARIANTS = { AUTO: 'success', APPROVE: 'warning', HUMAN: 'danger' }

export default function AIRecommendations({ data, loading }) {
  const [deciding, setDeciding] = useState(null)
  const [decided,  setDecided]  = useState({})

  async function decide(rec, i, action) {
    if (!rec.id) return
    setDeciding(`${i}-${action}`)
    try {
      if (action === 'accept')  await api.acceptRec(rec.id)
      if (action === 'snooze')  await api.snoozeRec(rec.id, 24)
      if (action === 'dismiss') await api.dismissRec(rec.id)
      setDecided(prev => ({ ...prev, [i]: action }))
    } catch {
      // non-fatal — show decided state anyway
      setDecided(prev => ({ ...prev, [i]: action }))
    } finally {
      setDeciding(null)
    }
  }

  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      {[1,2,3].map(i => <SkeletonBlock key={i} className="h-14 w-full mb-2" />)}
    </Card>
  )

  const recs = data?.recommendations ?? []

  return (
    <Card className="p-4">
      <CardHeader
        title="AI Recommendations"
        action={<span className="text-[10px] text-accent">✦ Autonomous Assistant</span>}
      />
      {recs.length === 0
        ? <EmptyState icon="✦" title="No recommendations" description="Assistant is analysing your data" />
        : (
          <div className="space-y-2">
            {recs.map((rec, i) => {
              const d = decided[i]
              const isDeciding = deciding?.startsWith(`${i}-`)
              return (
                <div key={i} className={`p-3 rounded-lg bg-surface-1 border transition-colors ${d ? 'border-border-subtle opacity-60' : 'border-border-subtle hover:border-border'}`}>
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-accent text-[10px] font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-medium text-ink-1">{rec.action}</span>
                        <Badge variant={EFFORT_COLORS[rec.effort] ?? 'neutral'}>{rec.effort}</Badge>
                        {rec.tier && (
                          <Badge variant={TIER_VARIANTS[rec.tier] ?? 'neutral'} className="text-[10px]">
                            {TIER_LABELS[rec.tier] ?? rec.tier}
                          </Badge>
                        )}
                        {rec.confidence != null && (
                          <span className="text-[10px] text-ink-3">{rec.confidence}%</span>
                        )}
                      </div>
                      <p className="text-xs text-ink-3 leading-relaxed">{rec.why}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      {d ? (
                        <span className="text-[10px] text-ink-3 italic">
                          {d === 'accept' ? '✓ Accepted' : d === 'snooze' ? '⏱ Snoozed' : '✕ Dismissed'}
                        </span>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" className="text-[10px] text-ink-3"
                            onClick={() => decide(rec, i, 'dismiss')} disabled={isDeciding || !rec.id}>
                            {deciding === `${i}-dismiss` ? <Spinner size={10} /> : 'Dismiss'}
                          </Button>
                          <Button variant="ghost" size="sm" className="text-[10px]"
                            onClick={() => decide(rec, i, 'snooze')} disabled={isDeciding || !rec.id}>
                            {deciding === `${i}-snooze` ? <Spinner size={10} /> : 'Snooze'}
                          </Button>
                          <Button variant="primary" size="sm" className="text-[10px]"
                            onClick={() => decide(rec, i, 'accept')} disabled={isDeciding || !rec.id}>
                            {deciding === `${i}-accept` ? <Spinner size={10} /> : 'Accept'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </Card>
  )
}
