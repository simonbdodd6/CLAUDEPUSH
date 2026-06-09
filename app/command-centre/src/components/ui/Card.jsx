export function Card({ children, className = '', onClick, hoverable = false }) {
  const base = 'card' + (hoverable ? ' card-hover card-active' : '') + (className ? ' ' + className : '')
  return onClick
    ? <div className={base} onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>{children}</div>
    : <div className={base}>{children}</div>
}

export function CardHeader({ title, action, icon }) {
  return (
    <div className="section-header">
      <div className="flex items-center gap-2">
        {icon && <span className="text-ink-2">{icon}</span>}
        <span className="section-title">{title}</span>
      </div>
      {action}
    </div>
  )
}
