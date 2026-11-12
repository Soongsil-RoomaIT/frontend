import { PageHeader } from '@/components/PageHeader'
import { AutomationForm } from '@/features/automation/AutomationForm'
import { ComfortForm } from '@/features/monitoring/ComfortForm'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="설정" description="자동제어 기준과 표시 기준을 설정합니다." />
      <div className="space-y-6">
        <AutomationForm />
        <ComfortForm />
      </div>
    </>
  )
}
