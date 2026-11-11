import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'
import { AutomationForm } from '@/features/automation/AutomationForm'
import { ComfortForm } from '@/features/monitoring/ComfortForm'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="설정" description="자동제어 방식과 기준을 설정합니다." />
      <div className="space-y-6">
        <AutomationForm />
        <ComfortForm />
        <Placeholder requirements="FR-05 푸시 알림" phase={5} />
      </div>
    </>
  )
}
