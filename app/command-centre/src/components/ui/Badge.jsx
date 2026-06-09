export function Badge({ children, variant = 'neutral', className = '' }) {
  const variants = {
    accent:  'badge-accent',
    success: 'badge-success',
    warning: 'badge-warning',
    danger:  'badge-danger',
    neutral: 'badge-neutral',
  }
  return (
    <span className={[variants[variant] ?? 'badge-neutral', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}
