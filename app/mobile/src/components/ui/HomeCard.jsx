import Spinner from './Spinner.jsx';

export default function HomeCard({ icon, label, value, sub, accent = '#6366F1', loading = false, onClick, badge }) {
  return (
    <div
      className="home-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{ borderColor: `${accent}33` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
          style={{ background: `${accent}20` }}
        >
          {icon}
        </div>
        {badge != null && (
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${accent}25`, color: accent }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Value */}
      <div>
        {loading ? (
          <div className="m-skeleton h-7 w-16 mb-1" />
        ) : (
          <p className="text-2xl font-bold text-ink-1 leading-none mb-1" style={{ color: accent }}>
            {value ?? '—'}
          </p>
        )}
        <p className="text-xs font-semibold text-ink-2 leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-ink-3 mt-0.5 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}
