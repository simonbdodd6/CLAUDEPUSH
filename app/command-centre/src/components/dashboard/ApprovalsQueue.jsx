import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Button } from '../ui/Button.jsx'
import { Spinner } from '../ui/Spinner.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'
import { api } from '../../api/client.js'

const RISK_BADGE = { low: 'success', medium: 'warning', high: 'danger' }

export default function ApprovalsQueue({ data, loading }) {
  const [deciding, setDeciding] = useState(null)
  const [decided,  setDecided]  = useState({})

  async function decide(item, i, decision) {
    setDeciding(`${i}-${decision}`)
    try {
      await api.approvalDecide(item.id, decision)
    } finally {
      setDecided(prev => ({ ...prev, [i]: decision }))
      setDeciding(null)
    }
  }

  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      <SkeletonBlock className="h-16 w-full" />
    </Card>
  )

  const items = data?.items ?? []
  const pending = items.filter((_, i) => !decided[i])

  return (
    <Card className="p-4">
      <CardHeader
        title="Approvals Queue"
        action={<Badge variant={pending.length > 0 ? 'accent' : 'neutral'}>{pending.length} pending</Badge>}
      />
      {items.length === 0
        ? <EmptyState icon="✅" title="Queue clear" description="No pending approvals" />
        : (
          <div className="space-y-2">
            {items.slice(0, 4).map((item, i) => {
              const d = decided[i]
              const isDeciding = deciding?.startsWith(`${i}-`)
              return (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg bg-surface-1 border border-border-subtle transition-opacity ${d ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-1 truncate">{item.title ?? item.type}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant={RISK_BADGE[item.riskLevel] ?? 'neutral'} className="text-[10px]">
                        {item.riskLevel ?? 'low'} risk
                      </Badge>
                      {item.type && <span className="text-[10px] text-ink-3">{item.type}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {d ? (
                      <span className="text-[10px] text-ink-3 italic">
                        {d === 'approve' ? '✓ Approved' : '✕ Rejected'}
                      </span>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" className="text-xs text-danger hover:text-danger"
                          onClick={() => decide(item, i, 'reject')} disabled={isDeciding}>
                          {deciding === `${i}-reject` ? <Spinner size={10} /> : 'Reject'}
                        </Button>
                        <Button variant="primary" size="sm" className="text-xs"
                          onClick={() => decide(item, i, 'approve')} disabled={isDeciding}>
                          {deciding === `${i}-approve` ? <Spinner size={10} /> : 'Approve'}
                        </Button>
                      </>
                    )}
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
