import { useState, useEffect, useRef, useMemo } from 'react'
import { Spinner } from '../ui/Spinner.jsx'
import { Badge } from '../ui/Badge.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// CommandBar (Experience Layer, M32)
//
// Ported from the command-centre CommandBar with the LIVE DATA SEAM REMOVED:
//   • no `api` / `/api` calls, no MOCK import
//   • `actions` and `prompts` arrive as PROPS from the app bootstrap
//     (experience/placeholders/action-catalogs.js, injected via App)
//   • submit() produces a synthetic PLACEHOLDER result — it runs nothing
// Pure presentation. Animated placeholder only.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  COACHING: 'accent',
  PLAYERS: 'success',
  COMMUNICATIONS: 'warning',
  COMMITTEE: 'neutral',
  CLUB_OPERATIONS: 'neutral',
  DIRECTOR_OF_RUGBY: 'danger',
}

export default function CommandBar({ onClose, actions = [], prompts = [] }) {
  const [query, setQuery]   = useState('')
  const [status, setStatus] = useState('idle')   // idle | running | done
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const suggestions = useMemo(() => {
    if (!query.trim()) return prompts
    const q = query.toLowerCase()
    const fromActions = actions
      .filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.tags?.some(t => t.includes(q))
      )
      .slice(0, 6)
      .map(a => ({ label: a.name, icon: categoryIcon(a.category), category: a.category, actionId: a.id }))
    const fromPrompts = prompts.filter(p => p.label.toLowerCase().includes(q))
    const seen = new Set(fromActions.map(a => a.label))
    return [...fromActions, ...fromPrompts.filter(p => !seen.has(p.label))].slice(0, 8)
  }, [query, actions, prompts])

  // PLACEHOLDER: no engine, no network — just a staged synthetic acknowledgement.
  function submit(text) {
    const q = (text ?? query).trim()
    if (!q) return
    setStatus('running')
    setResult(null)
    const handle = setTimeout(() => {
      setStatus('done')
      setResult({
        success: true,
        actionName: 'Preview',
        summary: `“${q}” would run here once the Experience Adapter is wired (M33). This is a visual placeholder — nothing was executed.`,
        evidence: ['Experience Layer · animated placeholder', 'No live data · no API calls'],
        durationMs: 0,
      })
    }, 450)
    return () => clearTimeout(handle)
  }

  function handleSubmit(e) { e.preventDefault(); submit() }
  function reset() { setQuery(''); setResult(null); setStatus('idle'); inputRef.current?.focus() }

  const showSuggestions = status === 'idle' && !result

  return (
    <div className="cmd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cmd-modal mx-4">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-subtle">
          <div className="flex-shrink-0 text-ink-3">
            {status === 'running' ? <Spinner size={16} /> : <SearchIcon />}
          </div>
          <form className="flex-1" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className="cmd-input"
              placeholder="What would you like to do?"
              value={query}
              onChange={e => { setQuery(e.target.value); if (result) reset() }}
              disabled={status === 'running'}
            />
          </form>
          {result && (
            <button onClick={reset} className="text-xs text-ink-3 hover:text-ink-2 flex-shrink-0 btn-ghost btn-sm">Clear</button>
          )}
          <kbd className="flex-shrink-0 text-[10px] text-ink-3 px-1.5 py-0.5 rounded bg-surface-3 font-mono">Esc</kbd>
        </div>

        {showSuggestions && (
          <div className="py-1 max-h-80 overflow-y-auto">
            {!query.trim() && (
              <div className="px-4 pt-2 pb-1">
                <span className="section-title text-[10px]">Quick actions</span>
              </div>
            )}
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setQuery(s.label); submit(s.label) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-3 transition-colors duration-100 group"
              >
                <span className="w-7 h-7 rounded-lg bg-surface-3 flex items-center justify-center text-base flex-shrink-0 group-hover:bg-surface-4">
                  {s.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-ink-1 truncate block">{s.label}</span>
                </div>
                <Badge variant={CATEGORY_COLORS[s.category] ?? 'neutral'} className="flex-shrink-0 text-[10px]">
                  {s.category?.replace('_', ' ')}
                </Badge>
              </button>
            ))}
            {query.trim() && suggestions.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-ink-3">No matching actions — press Enter to preview</div>
            )}
            {query.trim() && (
              <>
                <div className="divider mx-4 my-1" />
                <button
                  onClick={() => submit()}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-3 transition-colors duration-100 group"
                >
                  <span className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent flex-shrink-0">✦</span>
                  <span className="text-sm text-ink-1">Preview: "<em>{query}</em>"</span>
                  <kbd className="ml-auto text-[10px] text-ink-3 px-1.5 py-0.5 rounded bg-surface-3 font-mono flex-shrink-0">↵</kbd>
                </button>
              </>
            )}
          </div>
        )}

        {status === 'running' && (
          <div className="flex items-center gap-3 px-4 py-6">
            <Spinner size={14} />
            <span className="text-sm text-ink-2 animate-pulse">Previewing — "{query}"…</span>
          </div>
        )}

        {status === 'done' && result && (
          <div className="p-4 animate-slide-up">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-success/15 text-success">✓</span>
              <span className="text-sm font-medium text-ink-1">{result.actionName ?? 'Result'}</span>
            </div>
            {result.summary && <p className="text-sm text-ink-2 leading-relaxed mb-3">{result.summary}</p>}
            {result.evidence?.length > 0 && (
              <div className="space-y-1 mb-3">
                {result.evidence.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-ink-3">
                    <span className="mt-0.5 text-accent">›</span>
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle">
              <button onClick={reset} className="btn-ghost btn btn-sm text-xs">Try another</button>
              <button onClick={onClose} className="btn-ghost btn btn-sm text-xs ml-auto">Close</button>
            </div>
          </div>
        )}

        {status === 'idle' && (
          <div className="px-4 py-2 border-t border-border-subtle flex items-center gap-3 text-[10px] text-ink-3">
            <span><kbd className="font-mono">↵</kbd> preview</span>
            <span><kbd className="font-mono">Esc</kbd> close</span>
            <span className="ml-auto">Experience Layer · placeholder</span>
          </div>
        )}
      </div>
    </div>
  )
}

function categoryIcon(cat) {
  const icons = {
    COACHING: '🏉', PLAYERS: '👤', COMMUNICATIONS: '📣',
    DIRECTOR_OF_RUGBY: '📊', COMMITTEE: '🏛', CLUB_OPERATIONS: '⚙️',
  }
  return icons[cat] ?? '⚡'
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
