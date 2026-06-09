import { useMemo } from 'react';

const R = 42;
const CIRC = 2 * Math.PI * R;

export default function MatchCountdown({ daysToKickoff = 0, kickoffLabel = '', prepPercent = 0, teamName = '', opponent = '' }) {
  const cappedDays = Math.max(0, Math.min(daysToKickoff, 30));
  const progress   = 1 - cappedDays / 30;
  const offset     = CIRC * (1 - progress);

  const urgency = useMemo(() => {
    if (cappedDays === 0) return '#EF4444';
    if (cappedDays <= 1)  return '#F59E0B';
    if (cappedDays <= 3)  return '#6366F1';
    return '#22C55E';
  }, [cappedDays]);

  const daysLabel = cappedDays === 0 ? 'TODAY' : cappedDays === 1 ? '1 DAY' : `${cappedDays} DAYS`;

  return (
    <div className="flex flex-col items-center py-6">
      {/* SVG ring */}
      <div className="relative mb-4">
        <svg width="120" height="120" viewBox="0 0 100 100">
          <circle className="countdown-track" cx="50" cy="50" r={R} strokeWidth="6" />
          <circle
            className="countdown-arc"
            cx="50" cy="50" r={R}
            strokeWidth="6"
            stroke={urgency}
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold tracking-wider text-ink-3">KICKOFF</span>
          <span className="text-lg font-black text-ink-1 leading-none" style={{ color: urgency }}>
            {daysLabel}
          </span>
        </div>
      </div>

      {/* Match info */}
      <p className="text-base font-bold text-ink-1 text-center">
        {teamName || 'Your Team'} <span className="text-ink-3 font-normal">vs</span> {opponent || 'TBD'}
      </p>
      <p className="text-xs text-ink-3 mt-0.5">{kickoffLabel}</p>

      {/* Prep bar */}
      <div className="mt-4 w-full max-w-[220px]">
        <div className="flex justify-between text-[11px] text-ink-3 mb-1">
          <span>Preparation</span>
          <span className="font-semibold text-accent">{prepPercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-700"
            style={{ width: `${prepPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
