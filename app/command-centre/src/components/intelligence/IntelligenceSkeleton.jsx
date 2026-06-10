/**
 * IntelligenceSkeleton — loading placeholder for Intelligence cards.
 * Replaces the per-page Skeleton / Sk inline definitions.
 */
export default function IntelligenceSkeleton({ h = 'h-28', className = '' }) {
  return <div className={`${h} rounded-xl bg-surface-2 animate-pulse ${className}`} />
}
