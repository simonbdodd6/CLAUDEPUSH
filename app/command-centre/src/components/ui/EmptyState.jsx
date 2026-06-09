export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center mb-4 text-2xl">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink-2 mb-1">{title}</p>
      {description && <p className="text-xs text-ink-3 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
