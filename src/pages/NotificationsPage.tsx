import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function NotificationsPage() {
  return (
    <>
      <PageHeader title="알림" description="자동 제어 실행 및 기기 상태 알림입니다." />
      <Placeholder requirements="FR-05" phase={5} />
    </>
  )
}
