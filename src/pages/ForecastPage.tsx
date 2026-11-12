import { PageHeader } from '@/components/PageHeader'
import { OutdoorCard } from '@/features/outdoor/OutdoorCard'
import { PredictionCard } from '@/features/prediction/PredictionCard'
import { RecommendationSection } from '@/features/recommendation/RecommendationCard'

export function ForecastPage() {
  return (
    <>
      <PageHeader title="예보·추천" description="바깥 날씨, AI 실내 환경 예측, 기준값 추천을 확인합니다." />
      <div className="space-y-8">
        <OutdoorCard />
        <PredictionCard />
        <RecommendationSection />
      </div>
    </>
  )
}
