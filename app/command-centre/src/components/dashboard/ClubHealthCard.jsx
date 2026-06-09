import { useEffect, useState } from 'react'
import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'

const DOMAIN_LABELS = {
  players: 'Players', coaches: 'Coaches', attendance: 'Attendance',
  injuries: 'Injuries', communications: 'Comms', finance: 'Finance',
  volunteers: 'Volunteers', sponsors: 'Sponsors',
  teamAverage: 'Teams', membership: 'Membership', governance: 'Governance',
  volunteerDepth: 'Volunteers',
}

function scoreColor(s) {
  if (s >= 70) return '#22C55E'
  if (s >= 50) return '#EAB308'
  return '#EF4444'
}
function scoreLabel(s) {
  if (s >= 80) return { text: 'Excellent', variant: 'success' }
  if (s >= 65) return { text: 'Good',      variant: 'success' }
  if (s >= 50) return { text: 'Fair',      variant: 'warning' }
  if (s >= 35) return { text: 'Needs work',variant: 'warning' }
  return               { text: 'Critical', variant: 'danger' }
}

function HealthRing({ score = 0, size = 96 }) {
  const [displayed, setDisplayed] = useState(0)
  const R = 36
  const C = 2 * Math.PI * R
  const dash = (displayed / 100) * C

  useEffect(() => {
    const t = setTimeout(() => setDisplayed(score), 100)
    return () => clearTimeout(t)
  }, [score])

  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={R} className="health-ring-track" strokeWidth="6" />
      <circle
        cx="40" cy="40" r={R}
        className="health-ring-arc"
        stroke={scoreColor(score)}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C - dash}
      />
      <text x="40" y="38" textAnchor="middle" fill={scoreColor(score)} fontSize="16" fontWeight="700" fontFamily="Inter, sans-serif">{score}</text>
      <text x="40" y="50" textAnchor="middle" fill="#4E5270" fontSize="8" fontFamily="Inter, sans-serif">/ 100</text>
    </svg>
  )
}

function DomainBar({ label, value }) {
  const color = scoreColor(value)
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-3 w-20 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-surface-3">
        <div
          className="h-1 rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs text-ink-2 w-6 text-right flex-shrink-0">{value}</span>
    </div>
  )
}

export default function ClubHealthCard({ data, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-4" />
      <SkeletonBlock className="h-24 w-24 rounded-full mx-auto mb-4" />
      <div className="space-y-2">
        {[1,2,3].map(i => <SkeletonBlock key={i} className="h-2 w-full" />)}
      </div>
    </Card>
  )

  const health  = data?.health ?? { overallScore: 0, trend: 'stable', domains: {} }
  const score   = health.overallScore ?? 0
  const label   = scoreLabel(score)
  const domains = health.domains ?? {}

  return (
    <Card className="p-4">
      <CardHeader title="Club Health" action={
        <div className="flex items-center gap-2">
          {health.phaseLabel && <Badge variant="accent" className="text-[10px]">{health.phaseLabel}</Badge>}
          <span className="text-[10px] text-ink-3">{health.trend === 'improving' ? '↑' : health.trend === 'declining' ? '↓' : '→'} {health.trend}</span>
          <Badge variant={label.variant}>{label.text}</Badge>
        </div>
      } />

      <div className="flex items-center gap-6">
        <HealthRing score={score} />
        <div className="flex-1 space-y-1.5">
          {Object.entries(domains).slice(0, 5).map(([key, val]) => (
            <DomainBar key={key} label={DOMAIN_LABELS[key] ?? key} value={val} />
          ))}
        </div>
      </div>

      {health.isMock && (
        <p className="text-[10px] text-ink-3 mt-3 text-center">Live data • connects to Club Intelligence Engine</p>
      )}
    </Card>
  )
}
