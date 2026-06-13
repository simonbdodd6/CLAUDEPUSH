import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'

const RISK_BADGE = { low: 'success', medium: 'warning', high: 'danger' }

export default function ApprovalsQueue({ data, loading, onApprove, onReject }) {
  const [busyId, setBusyId] = useState(null)

  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      <SkeletonBlock className="h-16 w-full" />
    </Card>
  )

  const items = data?.items ?? []

  // Coach-triggered decision. Handlers are optional so the component stays safe
  // wherever it is mounted; if absent, the buttons simply no-op.
  async function act(id, handler) {
    if (!handler || busyId) return
    setBusyId(id)
    try { await handler(id) }
    finally { setBusyId(null) }
  }

  return (
    <Card className="p-4">
      <CardHeader
        title="Approvals Queue"
        action={<Badge variant={items.length > 0 ? 'accent' : 'neutral'}>{items.length} pending</Badge>}
      />
      {items.length === 0
        ? <EmptyState icon="✅" title="Queue clear" description="No pending approvals" />
        : (
          <div className="space-y-2">
            {items.slice(0, 4).map((item) => {
              const id   = item.approvalId ?? item.id
              const busy = busyId === id
              return (
              <div key={id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-1 border border-border-subtle">
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
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(id, onReject)} className="text-xs text-danger hover:text-danger">Reject</Button>
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => act(id, onApprove)} className="text-xs">{busy ? '…' : 'Approve'}</Button>
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
