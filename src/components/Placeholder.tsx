interface PlaceholderProps {
  /** Requirement IDs this screen will implement, e.g. "FR-04" */
  requirements: string
  phase: number
}

export function Placeholder({ requirements, phase }: PlaceholderProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
      {phase}단계에서 구현 예정 · {requirements}
    </div>
  )
}
