import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { RealtimeProvider } from '@/realtime/RealtimeProvider'
import { queryClient } from './queryClient'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </QueryClientProvider>
  )
}
