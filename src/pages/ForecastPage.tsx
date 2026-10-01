import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function ForecastPage() {
  return (
    <>
      <PageHeader title="예보·추천" description="전후 2시간 기상 정보와 권장 동작을 확인합니다." />
      <Placeholder requirements="FR-02" phase={4} />
    </>
  )
}
