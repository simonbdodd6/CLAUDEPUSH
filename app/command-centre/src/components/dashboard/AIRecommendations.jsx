import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Button } from '../ui/Button.jsx'
import { Spinner } from '../ui/Spinner.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'
import { api } from '../../api/client.js'

const EFFORT_COLORS = { low: 'success', medium: 'warning', high: 'danger' }

export default function AIRecommendations({ data, loading }) {
  const [running, setRunning]   = useState(null)
  const [results, setResults]   = useState({})

  async function act(rec, i) {
    setRunning(i)
    try {
      const res = await api.runNL(rec.action, 'admin')
      setResults(prev => ({ ...prev, [i]: res }))
    } catch (e) {
      setResults(prev => ({ ...prev, [i]: { success: false, error: e.message } }))
    } finally {
      setRunning(null)
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
        action={<span className="text-[10px] text-accent">✦ Club Intelligence</span>}
      />
      {recs.length === 0
        ? <EmptyState icon="✦" title="No recommendations" description="Club Intelligence is analysing your data" />
        : (
          <div className="space-y-2">
            {recs.map((rec, i) => {
              const r = results[i]
              return (
                <div key={i} className="p-3 rounded-lg bg-surface-1 border border-border-subtle hover:border-border transition-colors">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-accent text-[10px] font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-ink-1">{rec.action}</span>
                        <Badge variant={EFFORT_COLORS[rec.effort] ?? 'neutral'}>{rec.effort}</Badge>
                      </div>
                      <p className="text-xs text-ink-3 leading-relaxed">{rec.why}</p>
                      {r && (
                        <p className={`text-xs mt-1.5 ${r.success !== false ? 'text-success' : 'text-danger'}`}>
                          {r.success !== false ? '✓ ' : '✕ '}{r.summary?.slice(0, 80) ?? r.error}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => act(rec, i)}
                      disabled={running !== null}
                      className="flex-shrink-0 text-xs"
                    >
                      {running === i ? <Spinner size={12} /> : 'Run'}
                    </Button>
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
