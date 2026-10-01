import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'

export function EdgeStatusBadge() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['edge', 'status'],
    queryFn: api.getEdgeStatus,
    refetchInterval: 10_000,
  })

  let label = '확인 중'
  let dot = 'bg-muted'
  if (isError) {
    label = '서버 연결 실패'
    dot = 'bg-danger'
  } else if (!isPending) {
    if (!data.online) {
      label = '기기 오프라인'
      dot = 'bg-danger'
    } else if (data.offlineMode) {
      label = '로컬 자동제어 중'
      dot = 'bg-warning'
    } else {
      label = '기기 연결됨'
      dot = 'bg-success'
    }
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted"
      role="status"
    >
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}
