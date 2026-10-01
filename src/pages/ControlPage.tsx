import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function ControlPage() {
  return (
    <>
      <PageHeader title="기기 제어" description="창문, 제습기, 공기청정기, 현관문을 원격으로 조작합니다." />
      <Placeholder requirements="FR-03, FR-04" phase={3} />
    </>
  )
}
