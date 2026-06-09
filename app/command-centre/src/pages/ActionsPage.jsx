import { useState } from 'react'
import { useActions, useActionsByCategory, useActionSearch, useActionRunner } from '../hooks/useActions.js'
import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Spinner, SkeletonCard } from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'

const CATEGORIES = [
  { id: 'ALL',              label: 'All Actions',        icon: '⚡' },
  { id: 'COACHING',         label: 'Coaching',           icon: '🏉' },
  { id: 'PLAYERS',          label: 'Players',            icon: '👤' },
  { id: 'COMMUNICATIONS',   label: 'Communications',     icon: '📣' },
  { id: 'DIRECTOR_OF_RUGBY',label: 'Director of Rugby',  icon: '📊' },
  { id: 'COMMITTEE',        label: 'Committee',          icon: '🏛' },
  { id: 'CLUB_OPERATIONS',  label: 'Club Operations',    icon: '⚙️' },
]

const CAT_BADGE = {
  COACHING: 'accent', PLAYERS: 'success', COMMUNICATIONS: 'warning',
  COMMITTEE: 'neutral', CLUB_OPERATIONS: 'neutral', DIRECTOR_OF_RUGBY: 'danger',
}
const CAT_ICON = {
  COACHING:'🏉', PLAYERS:'👤', COMMUNICATIONS:'📣',
  DIRECTOR_OF_RUGBY:'📊', COMMITTEE:'🏛', CLUB_OPERATIONS:'⚙️',
}

function ActionCard({ action, onRun }) {
  const [hover, setHover] = useState(false)
  const runner = useActionRunner()

  async function handleRun() {
    try {
      await runner.run(action.id, {}, { role: 'admin' })
      onRun?.(runner.result)
    } catch {}
  }

  return (
    <div
      className="card card-hover card-active flex flex-col p-4 gap-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl action-card-icon">{CAT_ICON[action.category] ?? '⚡'}</span>
          <div>
            <h3 className="text-sm font-semibold text-ink-1 leading-tight">{action.name}</h3>
            <Badge variant={CAT_BADGE[action.category] ?? 'neutral'} className="text-[10px] mt-0.5">
              {action.category?.replace('_', ' ')}
            </Badge>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {action.sendsComms && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">📨</span>
          )}
          {action.requiresApproval && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">✅</span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-ink-3 leading-relaxed flex-1">{action.description}</p>

      {/* Engines */}
      <div className="flex flex-wrap gap-1">
        {action.requiredEngines?.slice(0, 3).map(e => (
          <span key={e} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-ink-3 font-mono">{e.replace('-engine','').replace('-','‑')}</span>
        ))}
        {(action.requiredEngines?.length ?? 0) > 3 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-ink-3">+{action.requiredEngines.length - 3}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
        <span className="text-[10px] text-ink-3 flex-1">~{action.estimatedRuntimeMs}ms</span>
        {runner.result && (
          <span className="text-[10px] text-success">✓ {runner.result.success !== false ? 'Done' : 'Error'}</span>
        )}
        <Button
          variant={runner.result ? 'ghost' : 'surface'}
          size="sm"
          onClick={handleRun}
          disabled={runner.running}
          className="text-xs"
        >
          {runner.running ? <Spinner size={12} /> : 'Run'}
        </Button>
      </div>

      {/* Result */}
      {runner.result && (
        <div className={`text-xs p-2 rounded ${runner.result.success !== false ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {runner.result.summary?.slice(0, 100) ?? 'Done'}
        </div>
      )}
    </div>
  )
}

export default function ActionsPage() {
  const { actions, loading } = useActions()
  const [category, setCategory] = useState('ALL')
  const [search, setSearch]     = useState('')

  const filtered = useActionSearch(
    category === 'ALL' ? actions : actions.filter(a => a.category === category),
    search
  )

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink-1">Action Library</h1>
            <p className="text-sm text-ink-3 mt-0.5">{actions.length} actions · one-click execution · AI-powered</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="Search actions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              category === c.id
                ? 'bg-accent text-white shadow-accent'
                : 'bg-surface-2 text-ink-2 hover:text-ink-1 hover:bg-surface-3 border border-border-subtle'
            }`}
          >
            <span>{c.icon}</span>
            <span>{c.label}</span>
            {c.id !== 'ALL' && (
              <span className={`ml-0.5 text-[10px] ${category === c.id ? 'text-white/70' : 'text-ink-3'}`}>
                {actions.filter(a => a.category === c.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Actions grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No actions found" description="Try a different search or category" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(action => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  )
}
