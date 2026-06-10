import Spinner  from '../components/ui/Spinner.jsx';
import AlertItem from '../components/ui/AlertItem.jsx';

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <p className="m-section-title">{title}</p>
      {children}
    </div>
  );
}

export default function TodayPage({ data, alerts }) {
  const { health, upcomingFixtures, briefing, phase, loading } = data;

  const today   = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayFx = (upcomingFixtures ?? []).filter(f => f.daysToKickoff === 0 || f.daysToKickoff === 1);
  const soonFx  = (upcomingFixtures ?? []).filter(f => f.daysToKickoff > 0 && f.daysToKickoff <= 7);
  const critAl  = (alerts ?? []).filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');

  return (
    <div className="pt-2 pb-4">
      <div className="mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-black text-ink-1">Today</h1>
          {phase?.meta?.label && (
            <span className="m-badge-accent text-[10px]">{phase.meta.label}</span>
          )}
        </div>
        <p className="text-xs text-ink-3">{today}</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size={28} />
        </div>
      )}

      {!loading && (
        <>
          {/* AI Briefing */}
          {briefing?.summary && (
            <Section title="Club Briefing">
              <div className="m-card p-4">
                <div className="flex gap-2 mb-2">
                  <span className="text-lg">✦</span>
                  <p className="text-sm text-ink-1 leading-relaxed">{briefing.summary}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Health dimensions */}
          {health?.dimensions?.length > 0 && (
            <Section title="Club Health">
              <div className="m-card divide-y divide-border-subtle">
                {health.dimensions.map((d, i) => {
                  const pct  = Math.min(100, Math.max(0, d.score ?? 0));
                  const col  = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';
                  return (
                    <div key={i} className="px-4 py-3">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-ink-2 font-medium">{d.label}</span>
                        <span className="font-bold" style={{ color: col }}>{pct}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-3">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: col }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Upcoming fixtures */}
          {soonFx.length > 0 && (
            <Section title="This Week">
              <div className="flex flex-col gap-2">
                {soonFx.map((f, i) => (
                  <div key={i} className="m-card p-4 m-card-tap">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-ink-1 text-sm">{f.teamName}</p>
                      <span className="m-badge-accent">{f.daysToKickoff === 0 ? 'Today' : f.daysToKickoff === 1 ? 'Tomorrow' : `${f.daysToKickoff}d`}</span>
                    </div>
                    <p className="text-xs text-ink-3">vs {f.opponent ?? 'TBD'} · {f.kickoffLabel ?? ''}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Critical alerts */}
          {critAl.length > 0 && (
            <Section title="Needs Attention">
              <div className="flex flex-col gap-2">
                {critAl.slice(0, 3).map(a => <AlertItem key={a.id} alert={a} />)}
              </div>
            </Section>
          )}

          {soonFx.length === 0 && critAl.length === 0 && !briefing?.summary && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-ink-2 font-semibold">All clear for today</p>
              <p className="text-ink-3 text-sm mt-1">No urgent items</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
