import { useMemo } from 'react';
import HomeCard from '../components/ui/HomeCard.jsx';
import Spinner  from '../components/ui/Spinner.jsx';

function healthGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export default function HomePage({ data, alerts }) {
  const { health, upcomingFixtures, recommendations, twinStatus, loading } = data;

  const nextFixture = upcomingFixtures?.[0];
  const daysLabel   = nextFixture
    ? (nextFixture.daysToKickoff === 0 ? 'Today' : nextFixture.daysToKickoff === 1 ? 'Tomorrow' : `${nextFixture.daysToKickoff}d`)
    : null;

  const score       = health?.score ?? twinStatus?.healthScore ?? '—';
  const grade       = typeof score === 'number' ? healthGrade(score) : '—';
  const playerCount = twinStatus?.playerCount ?? '—';
  const critAlerts  = (alerts ?? []).filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;
  const recCount    = (recommendations ?? []).length;

  const cards = useMemo(() => [
    {
      icon: '📅', label: "Today's Training", accent: '#6366F1',
      value: loading ? null : nextFixture ? daysLabel : 'No match',
      sub:   nextFixture ? `vs ${nextFixture.opponent ?? 'TBD'}` : 'Nothing scheduled',
      badge: nextFixture?.daysToKickoff != null ? `${nextFixture.daysToKickoff}d` : null,
      to:    '/today',
    },
    {
      icon: '⚽', label: 'Next Match', accent: '#22C55E',
      value: loading ? null : nextFixture ? nextFixture.opponent ?? 'TBD' : 'None',
      sub:   nextFixture?.kickoffLabel ?? '',
      to:    '/match',
    },
    {
      icon: '📊', label: 'Club Health', accent: '#A78BFA',
      value: loading ? null : `${score}`,
      sub:   `Grade ${grade}`,
      badge: grade,
      to:    '/today',
    },
    {
      icon: '👥', label: 'Players', accent: '#38BDF8',
      value: loading ? null : `${playerCount}`,
      sub:   'Registered',
      to:    '/today',
    },
    {
      icon: '🔔', label: 'Alerts', accent: critAlerts > 0 ? '#EF4444' : '#6B7280',
      value: loading ? null : `${critAlerts}`,
      sub:   critAlerts > 0 ? 'Need attention' : 'All clear',
      badge: critAlerts > 0 ? critAlerts : null,
      to:    '/alerts',
    },
    {
      icon: '✦',  label: 'AI Assistant', accent: '#F59E0B',
      value: loading ? null : recCount > 0 ? `${recCount}` : 'Ask me',
      sub:   recCount > 0 ? `recommendation${recCount !== 1 ? 's' : ''}` : 'Tap to start',
      to:    null,
    },
  ], [loading, nextFixture, daysLabel, score, grade, playerCount, critAlerts, recCount]);

  return (
    <div className="pt-2 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-ink-1">Coach's Eye</h1>
          <p className="text-xs text-ink-3">
            {loading ? 'Loading…' : `Last updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        {loading && <Spinner size={18} />}
      </div>

      {/* 2-column grid of 6 cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <HomeCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            sub={card.sub}
            accent={card.accent}
            badge={card.badge}
            loading={loading && card.value == null}
          />
        ))}
      </div>

      {/* Recommendations strip */}
      {!loading && recommendations?.length > 0 && (
        <div className="mt-5">
          <p className="m-section-title">AI Recommendations</p>
          <div className="flex flex-col gap-2">
            {recommendations.slice(0, 3).map((r, i) => (
              <div key={i} className="m-card p-3 flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 text-xs font-bold px-2 py-1 rounded-full ${r.priority === 'high' ? 'm-badge-warning' : 'm-badge-neutral'}`}>
                  {r.priority?.toUpperCase() ?? 'INFO'}
                </span>
                <p className="text-sm text-ink-2 leading-snug">{r.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
