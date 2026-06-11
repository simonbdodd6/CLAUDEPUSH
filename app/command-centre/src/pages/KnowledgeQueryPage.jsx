import { useState, useRef, useEffect } from 'react'
import { api } from '../api/client.js'

// ── Suggested queries ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: 'Blitz defence drills',      q: 'Show drills for blitz defence' },
  { label: 'Set piece improvement',     q: 'Drills to improve set piece' },
  { label: 'Lineout knowledge',         q: 'What do we know about lineout?' },
  { label: 'Defensive documents',       q: 'Documents about defensive principles' },
  { label: 'Drift principles',          q: 'Drills for drift in midfield' },
  { label: 'Width-first attack',        q: 'Drills for width first attack' },
]

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ value }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  const colour = pct >= 85 ? 'bg-emerald-500' : pct >= 65 ? 'bg-amber-400' : 'bg-zinc-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-ink-3 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

// ── Drill result card ─────────────────────────────────────────────────────────

function DrillCard({ drill }) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm text-ink-1">{drill.drill}</p>
          {drill.principle && (
            <p className="text-xs text-violet-400 mt-0.5">
              {drill.type === 'Exercise' ? 'Exercise' : 'Drill'} · Principle: {drill.principle}
            </p>
          )}
        </div>
        {drill.skillLevel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-ink-3 flex-shrink-0">
            {drill.skillLevel}
          </span>
        )}
      </div>

      {drill.description && (
        <p className="text-xs text-ink-3 leading-relaxed">{drill.description}</p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        {drill.sessionsUsedIn?.length > 0 && (
          <div>
            <p className="text-ink-3 mb-1">Used in sessions</p>
            <ul className="space-y-0.5">
              {drill.sessionsUsedIn.slice(0, 2).map((s, i) => (
                <li key={i} className="text-ink-2 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
        )}
        {drill.supportingDocs?.length > 0 && (
          <div>
            <p className="text-ink-3 mb-1">Supporting docs</p>
            <ul className="space-y-0.5">
              {drill.supportingDocs.slice(0, 2).map((d, i) => (
                <li key={i} className="text-ink-2 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-pink-400 flex-shrink-0" />
                  <span className="truncate">{d.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Document result card ──────────────────────────────────────────────────────

const FILE_TYPE_COLOUR = { pdf: 'bg-red-900 text-red-300', xlsx: 'bg-green-900 text-green-300', docx: 'bg-blue-900 text-blue-300', image: 'bg-amber-900 text-amber-300', note: 'bg-zinc-700 text-zinc-300', video_link: 'bg-purple-900 text-purple-300' }

function DocCard({ doc }) {
  const colour = FILE_TYPE_COLOUR[doc.fileType] ?? 'bg-zinc-700 text-zinc-300'
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm text-ink-1 leading-snug">{doc.title}</p>
        {doc.fileType && (
          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${colour}`}>
            {doc.fileType}
          </span>
        )}
      </div>
      {doc.linkedTo && (
        <p className="text-xs text-violet-400">
          Covers: {doc.linkedTo.label} <span className="text-ink-3">({doc.linkedTo.type})</span>
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-3">
        {doc.category && <span>{doc.category}</span>}
        {doc.processingStatus && <span className="capitalize">{doc.processingStatus.replace(/_/g, ' ')}</span>}
        {doc.confidence != null && <span>{doc.confidence}% confidence</span>}
      </div>
    </div>
  )
}

// ── Graph neighbourhood card ──────────────────────────────────────────────────

function GraphNodeCard({ row }) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm text-ink-1">{row.node.label ?? row.node.id}</p>
          <p className="text-xs text-violet-400 mt-0.5">{row.node.type}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 flex-shrink-0">
          {row.edgeCount} edge{row.edgeCount === 1 ? '' : 's'}
        </span>
      </div>
      {row.related?.length > 0 && (
        <div>
          <p className="text-xs text-ink-3 mb-1.5">Connected to</p>
          <div className="flex flex-wrap gap-1.5">
            {row.related.slice(0, 6).map((n, i) => (
              <span key={i} className="text-xs bg-zinc-800 text-ink-2 px-2 py-0.5 rounded-full">
                {n.label ?? n.id}
              </span>
            ))}
          </div>
        </div>
      )}
      {row.edgeTypes?.length > 0 && (
        <p className="text-xs text-ink-3">
          Edges: {row.edgeTypes.join(', ')}
        </p>
      )}
    </div>
  )
}

// ── Result renderer ───────────────────────────────────────────────────────────

function ResultPanel({ result }) {
  const [showMeta, setShowMeta] = useState(false)
  const data = result.data ?? []

  const isGraphCoaching = result.intent === 'graph_coaching' && Array.isArray(data) && data[0]?.drill
  const isGraphDocs     = result.intent === 'graph_docs'     && Array.isArray(data) && data[0]?.title
  const isGenGraph      = result.graphTraversal             && Array.isArray(data) && data[0]?.node
  const isGeneral       = !isGraphCoaching && !isGraphDocs && !isGenGraph

  return (
    <div className="flex flex-col gap-4">
      {/* Answer */}
      <div className="bg-surface-2 border border-border rounded-xl p-5 flex flex-col gap-3">
        <p className="text-sm text-ink-1 leading-relaxed">{result.answer}</p>
        <ConfidenceBar value={result.confidence} />

        {result.graphTraversal && (
          <p className="text-xs text-violet-400 font-mono">
            {result.graphTraversal.path?.join(' → ')}
          </p>
        )}

        {result.summary && result.summary !== result.answer && (
          <p className="text-xs text-ink-3 leading-relaxed">{result.summary}</p>
        )}
      </div>

      {/* Typed data rows */}
      {isGraphCoaching && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((d, i) => <DrillCard key={i} drill={d} />)}
        </div>
      )}

      {isGraphDocs && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((d, i) => <DocCard key={i} doc={d} />)}
        </div>
      )}

      {isGenGraph && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((r, i) => <GraphNodeCard key={i} row={r} />)}
        </div>
      )}

      {isGeneral && Array.isArray(data) && data.length > 0 && (
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              {data.slice(0, 10).map((row, i) => {
                const label = row.name ?? row.drill ?? row.title ?? row.match ?? row.session ?? row.teams ?? Object.values(row)[0]
                const detail = Object.entries(row).filter(([k]) => !['name','playerId','drillId','docId'].includes(k)).slice(0,3).map(([k,v]) => v ? `${k}: ${v}` : null).filter(Boolean).join(' · ')
                return (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-ink-2">{label}</td>
                    {detail && <td className="px-4 py-2.5 text-ink-3">{detail}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Citations + metadata (collapsible) */}
      <button
        onClick={() => setShowMeta(v => !v)}
        className="text-xs text-ink-3 hover:text-ink-2 flex items-center gap-1.5 self-start"
      >
        <span className={`transition-transform ${showMeta ? 'rotate-90' : ''}`}>›</span>
        {result.citations?.length ?? 0} citation{result.citations?.length === 1 ? '' : 's'} · intent: {result.intent} · {result.timing?.durationMs ?? 0}ms
      </button>

      {showMeta && (
        <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
          {result.citations?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ink-3 mb-2">Citations</p>
              <ul className="space-y-1.5">
                {result.citations.slice(0, 8).map((c, i) => (
                  <li key={i} className="text-xs flex gap-2">
                    <span className="text-violet-400 flex-shrink-0">{c.engine}</span>
                    <span className="text-ink-3">{c.fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-ink-3">Intent</span><span className="text-ink-2">{result.intent}</span>
            <span className="text-ink-3">Domain</span><span className="text-ink-2">{result.domain ?? '—'}</span>
            <span className="text-ink-3">Count</span><span className="text-ink-2">{result.count}</span>
            <span className="text-ink-3">Confidence</span><span className="text-ink-2">{result.confidence}%</span>
            <span className="text-ink-3">Duration</span><span className="text-ink-2">{result.timing?.durationMs ?? 0}ms</span>
            <span className="text-ink-3">Cached</span><span className="text-ink-2">{result.cached ? 'yes' : 'no'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KnowledgeQueryPage() {
  const [question, setQuestion]   = useState('')
  const [result,   setResult]     = useState(null)
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState(null)
  const [history,  setHistory]    = useState([])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function submit(q) {
    const text = (q ?? question).trim()
    if (!text || loading) return
    setQuestion(text)
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await api.knowledgeAsk(text, { role: 'coach', useCache: false })
      setResult(r)
      setHistory(prev => [{ q: text, intent: r.intent, confidence: r.confidence }, ...prev].slice(0, 6))
    } catch (e) {
      setError(e.message ?? 'Query failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink-1">Knowledge Query</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900 text-violet-300">AI</span>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            Ask natural-language questions — answers are evidence-backed using the knowledge graph.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <form
        onSubmit={e => { e.preventDefault(); submit() }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Show drills for blitz defence..."
          className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-violet-500 transition-colors"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium transition-colors flex-shrink-0"
        >
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {/* Suggestions */}
      {!result && !loading && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-3">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s.q}
                onClick={() => submit(s.q)}
                className="text-xs px-3 py-1.5 rounded-full bg-surface-2 border border-border text-ink-2 hover:text-ink-1 hover:border-violet-500 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2">
              <p className="text-xs text-ink-3">Recent</p>
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => submit(h.q)}
                  className="text-left flex items-center gap-2 text-xs text-ink-2 hover:text-ink-1 group"
                >
                  <span className="text-ink-3 group-hover:text-violet-400">›</span>
                  <span className="flex-1 truncate">{h.q}</span>
                  <span className="text-ink-3">{h.intent} · {h.confidence}%</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-sm text-ink-3">
          <span className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          Searching knowledge graph…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="flex flex-col gap-4">
          {/* Back / new query shortcut */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setResult(null); setQuestion(''); inputRef.current?.focus() }}
              className="text-xs text-ink-3 hover:text-ink-1"
            >
              ← New question
            </button>
            <span className="text-ink-3 text-xs">·</span>
            <span className="text-xs text-ink-3 italic truncate">{result.question}</span>
          </div>
          <ResultPanel result={result} />
        </div>
      )}
    </div>
  )
}
