import { useState, useEffect } from 'react';
import MatchCountdown from '../components/match/MatchCountdown.jsx';
import Spinner        from '../components/ui/Spinner.jsx';
import { fixtures }   from '../api/client.js';

const MATCH_CATEGORIES = ['player welfare', 'logistics', 'operations'];

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <p className="m-section-title">{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-ink-3 font-medium">{label}</span>
      <span className={`text-sm font-semibold ${accent ? 'text-accent' : 'text-ink-1'}`}>{value ?? '—'}</span>
    </div>
  );
}

function fmtKickoff(iso) {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MatchPage({ upcomingFixtures = [], recommendations = [] }) {
  const [selIdx, setSelIdx]     = useState(0);
  const [detail, setDetail]     = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [pack, setPack]         = useState(null);
  const [packLoading, setPackLoading] = useState(false);
  const [tab, setTab]           = useState('overview');

  const fixture = upcomingFixtures[selIdx] ?? null;

  useEffect(() => {
    if (!fixture?.id) { setDetail(null); setTimeline(null); return; }
    setDetail(null); setTimeline(null); setPack(null);
    Promise.all([fixtures.get(fixture.id), fixtures.timeline(fixture.id)])
      .then(([f, t]) => { setDetail(f); setTimeline(t); });
  }, [fixture?.id]);

  async function handleGenPack() {
    if (!fixture?.id) return;
    setPackLoading(true);
    try {
      // Try existing pack first, then generate
      const existing = await fixtures.pack(fixture.id).catch(() => null);
      if (existing && !existing.error) { setPack(existing); setTab('pack'); return; }
      const generated = await fixtures.genPack(fixture.id);
      setPack(generated);
      setTab('pack');
    } finally {
      setPackLoading(false);
    }
  }

  // Preparation checklist progress from timeline response
  const checklist   = timeline?.checklist ?? [];
  const progress    = timeline?.progress  ?? null;
  const prepPercent = progress?.percent ?? 0;

  // Squad data — fixture schema uses squadStatus, not a flat squad array
  const squadStatus = detail?.squadStatus ?? null;
  const available   = squadStatus?.available   ?? [];
  const injured     = squadStatus?.injured     ?? [];
  const uncertain   = squadStatus?.uncertain   ?? [];

  // Match-related AI recommendations
  const matchRecs = recommendations.filter(r =>
    MATCH_CATEGORIES.some(c => (r.category ?? r.priority ?? '').toLowerCase().includes(c)) ||
    (r.effort === 'high' && r.priority <= 2)
  ).slice(0, 3);

  const TABS = ['overview', 'squad', 'checklist', 'pack'];

  if (upcomingFixtures.length === 0) {
    return (
      <div className="pt-2 pb-4 text-center py-16">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-ink-2 font-semibold">No upcoming fixtures</p>
        <p className="text-ink-3 text-sm mt-1">Schedule matches via the Actions tab</p>
      </div>
    );
  }

  return (
    <div className="pt-2 pb-4">
      <div className="mb-4">
        <h1 className="text-xl font-black text-ink-1">Match Centre</h1>
        {upcomingFixtures.length > 1 && (
          <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
            {upcomingFixtures.slice(0, 5).map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setSelIdx(i); setTab('overview'); }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  selIdx === i ? 'bg-accent text-white' : 'bg-surface-2 text-ink-3 border border-border-subtle'
                }`}
              >
                {f.opponent ?? `Match ${i + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Countdown ring */}
      <MatchCountdown
        daysToKickoff={fixture?.daysToKickoff ?? 0}
        kickoffLabel={fmtKickoff(fixture?.kickoff)}
        prepPercent={prepPercent}
        teamName={fixture?.teamName ?? ''}
        opponent={fixture?.opponent ?? ''}
      />

      {/* Tabs */}
      <div className="flex gap-0 mb-4 bg-surface-2 rounded-2xl p-1 border border-border-subtle">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-all duration-150 ${
              tab === t ? 'bg-accent text-white' : 'text-ink-3'
            }`}
          >
            {t === 'checklist' ? 'Prep' : t}
          </button>
        ))}
      </div>

      {/* ── Overview tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div>
          <div className="m-card divide-y divide-border-subtle px-4 mb-4">
            <InfoRow label="Competition"   value={fixture?.competition}            />
            <InfoRow label="Venue"         value={fixture?.venue}                  />
            <InfoRow label="Home / Away"   value={fixture?.isHome ? 'Home' : 'Away'} />
            <InfoRow label="Kickoff"       value={fmtKickoff(fixture?.kickoff)}    />
            <InfoRow label="Age Group"     value={fixture?.ageGroup}               />
            <InfoRow label="Status"        value={fixture?.status} accent          />
          </div>

          {/* AI readiness — match-related recommendations */}
          {matchRecs.length > 0 && (
            <div>
              <p className="m-section-title">AI Match Readiness</p>
              <div className="flex flex-col gap-2">
                {matchRecs.map((r, i) => (
                  <div key={r.id ?? i} className="m-card p-3 flex items-start gap-3">
                    <span className={`shrink-0 mt-0.5 text-xs font-bold px-2 py-1 rounded-full ${
                      r.effort === 'high' ? 'm-badge-warning' : 'm-badge-neutral'
                    }`}>
                      {r.effort?.toUpperCase() ?? 'INFO'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-2 leading-snug">{r.action}</p>
                      {r.why && <p className="text-xs text-ink-3 mt-0.5 leading-relaxed">{r.why}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Squad tab ──────────────────────────────────────────────────────── */}
      {tab === 'squad' && (
        (available.length + injured.length + uncertain.length) > 0 ? (
          <div>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              {[
                { label: 'Available', count: available.length, cls: 'm-badge-success' },
                { label: 'Uncertain', count: uncertain.length, cls: 'm-badge-warning' },
                { label: 'Injured',   count: injured.length,   cls: 'm-badge-danger'  },
              ].map(({ label, count, cls }) => (
                <div key={label} className="m-card p-3">
                  <div className={`text-xl font-black mb-0.5 ${
                    cls === 'm-badge-success' ? 'text-success' :
                    cls === 'm-badge-warning' ? 'text-warning' : 'text-danger'
                  }`}>{count}</div>
                  <div className="text-[10px] text-ink-3">{label}</div>
                </div>
              ))}
            </div>

            {/* Player list */}
            <div className="m-card divide-y divide-border-subtle">
              {[
                ...available.map(p => ({ ...p, _status: 'available' })),
                ...uncertain.map(p => ({ ...p, _status: 'uncertain' })),
                ...injured.map(p  => ({ ...p, _status: 'injured'   })),
              ].map((p, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-ink-1">{p.name}</p>
                    <p className="text-xs text-ink-3">
                      {p.position ?? 'Player'}
                      {p.injury   ? ` — ${p.injury}` : ''}
                      {p.reason   ? ` — ${p.reason}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    p._status === 'available' ? 'm-badge-success' :
                    p._status === 'uncertain' ? 'm-badge-warning' : 'm-badge-danger'
                  }`}>
                    {p._status === 'available' ? 'Available' :
                     p._status === 'uncertain' ? 'Uncertain' : 'Injured'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <p className="text-3xl mb-3">⚡</p>
            <p className="text-ink-2 font-semibold text-sm">Squad not yet loaded</p>
            <p className="text-ink-3 text-xs mt-1">Use "Prepare with AI" in the Command Centre to load squad data</p>
          </div>
        )
      )}

      {/* ── Checklist tab ─────────────────────────────────────────────────── */}
      {tab === 'checklist' && (
        checklist.length > 0 ? (
          <div>
            {/* Progress bar */}
            {progress && (
              <div className="m-card p-4 mb-4">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-ink-1">Preparation Progress</span>
                  <span className="text-ink-3">{progress.done}/{progress.total} tasks</span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-700"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                {progress.overdue > 0 && (
                  <p className="text-xs text-warning">⚠ {progress.overdue} task{progress.overdue > 1 ? 's' : ''} overdue</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {checklist.map((task, i) => {
                const isOverdue = task.dueAt && task.dueAt < new Date().toISOString() && task.status !== 'done' && task.status !== 'skipped';
                const isDone    = task.status === 'done' || task.status === 'skipped';
                return (
                  <div
                    key={task.id ?? i}
                    className={`m-card p-3 flex items-start gap-3 ${isDone ? 'opacity-50' : ''}`}
                  >
                    <span className="text-lg mt-0.5 shrink-0">
                      {isDone ? '✅' : isOverdue ? '⚠️' : '⏰'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isDone ? 'line-through text-ink-3' : 'text-ink-1'}`}>
                        {task.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-ink-3">{task.assignee}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          task.priority === 'critical' || task.priority === 'high' ? 'm-badge-warning' : 'm-badge-neutral'
                        }`}>
                          {task.priority?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-ink-2 font-semibold text-sm">No checklist yet</p>
            <p className="text-ink-3 text-xs mt-1">Checklist generates automatically once the fixture is scheduled</p>
          </div>
        )
      )}

      {/* ── Pack tab ──────────────────────────────────────────────────────── */}
      {tab === 'pack' && (
        <div>
          {!pack && !packLoading && (
            <div className="text-center py-8">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-ink-3 text-sm mb-4">Match pack not generated yet</p>
              <button
                type="button"
                className="m-btn-primary rounded-xl px-6 py-3"
                onClick={handleGenPack}
              >
                Generate Match Pack
              </button>
            </div>
          )}
          {packLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Spinner size={28} />
              <p className="text-ink-3 text-sm">Generating AI match pack…</p>
            </div>
          )}
          {pack && (
            <div className="flex flex-col gap-3">
              {Object.entries(pack)
                .filter(([k]) => !['id', 'fixtureId', 'generated', 'error'].includes(k))
                .map(([key, val]) => {
                  if (!val || (typeof val === 'object' && !Object.keys(val).length)) return null;
                  return (
                    <div key={key} className="m-card p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-1.5">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </p>
                      <p className="text-sm text-ink-1 leading-relaxed whitespace-pre-line">
                        {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
