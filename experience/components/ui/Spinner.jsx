export function Spinner({ size = 16, className = '' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      className={`animate-spin text-accent ${className}`}
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function SkeletonBlock({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

export function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="h-3 w-full" />
      <SkeletonBlock className="h-3 w-2/3" />
    </div>
  )
}
