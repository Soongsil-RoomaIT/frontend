import { useSystemStatus, type SystemStatus } from '@/features/monitoring/systemStatus'

const display: Record<SystemStatus['kind'], { label: string; dot: string }> = {
  checking: { label: '확인 중', dot: 'bg-muted' },
  'server-disconnected': { label: '서버 연결 끊김', dot: 'bg-status-critical' },
  'edge-offline': { label: '기기 오프라인', dot: 'bg-status-serious' },
  'edge-local': { label: '로컬 자동제어 중', dot: 'bg-status-warning' },
  ok: { label: '기기 연결됨', dot: 'bg-status-good' },
}

export function EdgeStatusBadge() {
  const { label, dot } = display[useSystemStatus().kind]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}
