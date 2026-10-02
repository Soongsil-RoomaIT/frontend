import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { OpeningStatus } from '@/features/monitoring/OpeningStatus'
import { SensorGrid } from '@/features/monitoring/SensorGrid'

export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="대시보드"
        description="실내 환경을 실시간으로 확인합니다."
        actions={
          <Link to="/history" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            기록 보기 <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />
      <div className="space-y-8">
        <SensorGrid />
        <OpeningStatus />
      </div>
    </>
  )
}
