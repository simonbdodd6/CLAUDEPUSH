import { useEffect } from 'react';
import Spinner from '../ui/Spinner.jsx';

export default function CommandBar({ bar }) {
  const { open, show, hide, query, setQuery, result, loading, examples, submit, pick, inputRef } = bar;

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') hide(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  return (
    <>
      {/* Collapsed pill — always visible */}
      <div className="px-4 pb-2 pt-1">
        <div className="cmd-pill" onClick={show} role="button" tabIndex={0} aria-label="Open AI command bar">
          <span className="text-base">✦</span>
          <span className="text-sm text-ink-3 flex-1 truncate">Ask the AI anything…</span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg text-accent" style={{ background: 'rgba(99,102,241,0.18)' }}>
            AI
          </span>
        </div>
      </div>

      {/* Full-screen overlay */}
      {open && (
        <div className="cmd-fullscreen" role="dialog" aria-modal="true">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border-subtle">
            <span className="text-xl">✦</span>
            <span className="text-base font-semibold text-ink-1 flex-1">AI Command</span>
            <button
              type="button"
              className="m-btn-ghost rounded-xl px-3 py-1.5 text-sm"
              onClick={hide}
            >
              Done
            </button>
          </div>

          {/* Input */}
          <div className="px-4 pt-4">
            <form
              onSubmit={e => { e.preventDefault(); submit(); }}
              className="flex gap-3 items-center"
            >
              <input
                ref={inputRef}
                className="m-input flex-1"
                placeholder="Ask anything…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoCapitalize="sentences"
                autoCorrect="on"
              />
              <button type="submit" className="m-btn-primary rounded-xl px-4 py-3" disabled={loading || !query.trim()}>
                {loading ? <Spinner size={18} color="text-white" /> : '→'}
              </button>
            </form>
          </div>

          {/* Result */}
          {result && (
            <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <p className="text-xs text-ink-3 mb-1 font-semibold uppercase tracking-wider">Answer</p>
              <p className="text-sm text-ink-1 leading-relaxed">{result.answer}</p>
            </div>
          )}

          {/* Loading state */}
          {loading && !result && (
            <div className="flex flex-col items-center gap-3 mt-12">
              <Spinner size={28} />
              <p className="text-sm text-ink-3">Thinking…</p>
            </div>
          )}

          {/* Example prompts */}
          {!loading && !result && (
            <div className="px-4 mt-6 flex-1 overflow-y-auto">
              <p className="m-section-title">Suggestions</p>
              <div className="flex flex-col gap-2">
                {bar.examples.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    className="text-left px-4 py-3 rounded-xl text-sm text-ink-2 m-card-tap"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    onClick={() => pick(ex)}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
