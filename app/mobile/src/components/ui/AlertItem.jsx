const SEV_CLASS = {
  CRITICAL: 'alert-critical',
  HIGH:     'alert-high',
  MEDIUM:   'alert-medium',
  LOW:      'alert-medium',
};

const SEV_BADGE = {
  CRITICAL: 'm-badge-danger',
  HIGH:     'm-badge-warning',
  MEDIUM:   'm-badge-neutral',
  LOW:      'm-badge-neutral',
};

const ICONS = {
  INJURY:           '🩹',
  VOLUNTEER_GAP:    '🙋',
  ATTENDANCE_DECLINE:'📉',
  INELIGIBLE_PLAYER:'⚠️',
  APPROVAL:         '✅',
  default:          '🔔',
};

export default function AlertItem({ alert, onClick }) {
  const cls    = SEV_CLASS[alert.severity] ?? 'alert-medium';
  const badge  = SEV_BADGE[alert.severity] ?? 'm-badge-neutral';
  const icon   = ICONS[alert.type] ?? ICONS.default;

  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}>
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-ink-1 text-sm truncate">{alert.title}</p>
          <span className={`${badge} shrink-0`}>{alert.severity}</span>
        </div>
        {alert.description && (
          <p className="text-xs text-ink-3 line-clamp-2">{alert.description}</p>
        )}
      </div>
    </div>
  );
}
