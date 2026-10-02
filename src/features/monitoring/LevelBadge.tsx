import { CircleAlert, CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Assessment, Level } from './metrics'

const levelStyle: Record<Level, { icon: LucideIcon; className: string }> = {
  good: { icon: CircleCheck, className: 'text-status-good' },
  warning: { icon: CircleAlert, className: 'text-status-warning' },
  serious: { icon: TriangleAlert, className: 'text-status-serious' },
  critical: { icon: OctagonAlert, className: 'text-status-critical' },
}

/** Status is carried by icon shape + label text; color only reinforces it. */
export function LevelBadge({ assessment }: { assessment: Assessment }) {
  const { icon: Icon, className } = levelStyle[assessment.level]
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-fg">
      <Icon className={`size-4 ${className}`} aria-hidden />
      {assessment.label}
    </span>
  )
}
