import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function HistoryPage() {
  return (
    <>
      <PageHeader title="기록" description="센서 측정 추이와 제어 이력을 확인합니다." />
      <Placeholder requirements="FR-01" phase={2} />
    </>
  )
}
