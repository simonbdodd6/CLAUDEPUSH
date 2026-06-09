import { useState, useEffect } from 'react';
import MatchCountdown from '../components/match/MatchCountdown.jsx';
import Spinner        from '../components/ui/Spinner.jsx';
import { fixtures }   from '../api/client.js';

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

export default function MatchPage({ upcomingFixtures = [] }) {
  const [selIdx, setSelIdx]     = useState(0);
  const [detail, setDetail]     = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [pack, setPack]         = useState(null);
  const [packLoading, setPackLoading] = useState(false);
  const [tab, setTab]           = useState('overview');

  const fixture = upcomingFixtures[selIdx] ?? null;

  useEffect(() => {
    if (!fixture?.id) { setDetail(null); setTimeline(null); return; }
    Promise.all([fixtures.get(fixture.id), fixtures.timeline(fixture.id)])
      .then(([f, t]) => { setDetail(f); setTimeline(t); });
  }, [fixture?.id]);

  async function handleGenPack() {
    if (!fixture?.id) return;
    setPackLoading(true);
    const p = await fixtures.pack(fixture.id) ?? await fixtures.genPack(fixture.id);
    setPack(p);
    setPackLoading(false);
    setTab('pack');
  }

  const TABS = ['overview', 'squad', 'timeline', 'pack'];

  if (upcomingFixtures.length === 0) {
    return (
      <div className="pt-2 pb-4 text-center py-16">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-ink-2 font-semibold">No upcoming fixtures</p>
        <p className="text-ink-3 text-sm mt-1">Schedule matches via the Actions tab</p>
      </div>
    );
  }

  const prepPercent = timeline
    ? Math.round((timeline.done ?? 0) / Math.max(1, timeline.total ?? 1) * 100)
    : 0;

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
                onClick={() => { setSelIdx(i); setDetail(null); setTimeline(null); setPack(null); setTab('overview'); }}
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
        kickoffLabel={fixture?.kickoffLabel ?? ''}
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
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="m-card divide-y divide-border-subtle px-4">
          <InfoRow label="Competition"   value={fixture?.competition}  />
          <InfoRow label="Venue"         value={fixture?.venue}        />
          <InfoRow label="Home / Away"   value={fixture?.isHome ? 'Home' : 'Away'} />
          <InfoRow label="Kickoff"       value={fixture?.kickoffLabel} />
          <InfoRow label="Age Group"     value={fixture?.ageGroup}     />
          <InfoRow label="Status"        value={fixture?.status}       accent />
        </div>
      )}

      {/* Squad */}
      {tab === 'squad' && (
        detail?.squad?.length > 0 ? (
          <div className="m-card divide-y divide-border-subtle">
            {detail.squad.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-ink-1">{p.name}</p>
                  <p className="text-xs text-ink-3">{p.position ?? 'Player'}</p>
                </div>
                <span className={`m-badge text-xs font-bold ${p.available ? 'm-badge-success' : 'm-badge-danger'}`}>
                  {p.available ? 'Available' : 'Unavailable'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-ink-3 text-sm">Squad not yet confirmed</div>
        )
      )}

      {/* Timeline tasks */}
      {tab === 'timeline' && (
        timeline?.tasks?.length > 0 ? (
          <div className="flex flex-col gap-2">
            {timeline.tasks.map((task, i) => (
              <div key={i} className={`m-card p-3 flex items-start gap-3 ${task.done ? 'opacity-50' : ''}`}>
                <span className={`mt-0.5 text-lg ${task.done ? '✅' : task.overdue ? '⚠️' : '⏰'}`}>
                  {task.done ? '✅' : task.overdue ? '⚠️' : '⏰'}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink-1">{task.label ?? task.type}</p>
                  <p className="text-xs text-ink-3">{task.dueLabel ?? ''}</p>
                </div>
                <span className={`m-badge text-[10px] ${task.priority === 'HIGH' ? 'm-badge-warning' : 'm-badge-neutral'}`}>
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-ink-3 text-sm">No timeline tasks</div>
        )
      )}

      {/* Pack */}
      {tab === 'pack' && (
        <div>
          {!pack && !packLoading && (
            <div className="text-center py-8">
              <p className="text-ink-3 text-sm mb-4">Match pack not generated yet</p>
              <button type="button" className="m-btn-primary rounded-xl px-6 py-3" onClick={handleGenPack}>
                Generate Match Pack
              </button>
            </div>
          )}
          {packLoading && <div className="flex justify-center py-8"><Spinner size={24} /></div>}
          {pack && (
            <div className="flex flex-col gap-3">
              {Object.entries(pack).filter(([k]) => !['id','fixtureId'].includes(k)).map(([key, val]) => (
                <div key={key} className="m-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                  <p className="text-sm text-ink-1 whitespace-pre-line">
                    {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
