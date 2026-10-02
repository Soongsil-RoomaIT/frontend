import { lazy, Suspense } from 'react'

// Split out: the chart library is the largest dependency and only this page needs it
const HistoryPage = lazy(() => import('./HistoryPage').then((m) => ({ default: m.HistoryPage })))

export function HistoryRoute() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" aria-busy="true" />}>
      <HistoryPage />
    </Suspense>
  )
}
