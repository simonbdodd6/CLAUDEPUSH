export function Button({ children, variant = 'surface', size = '', onClick, disabled, className = '', type = 'button' }) {
  const variants = {
    primary: 'btn-primary',
    ghost:   'btn-ghost',
    surface: 'btn-surface',
    danger:  'btn-danger',
  }
  const sizes = { sm: 'btn-sm', lg: 'btn-lg', '': '' }
  const cls = [variants[variant] ?? 'btn-surface', sizes[size] ?? '', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
