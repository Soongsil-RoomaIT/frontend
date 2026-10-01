import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="설정" description="자동제어 모드, 임계치, 푸시 알림을 설정합니다." />
      <Placeholder requirements="FR-02, FR-05" phase={4} />
    </>
  )
}
