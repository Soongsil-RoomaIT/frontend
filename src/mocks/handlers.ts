import { delay, http, HttpResponse } from 'msw'
import type { HistoryRange } from '@/api/types'
import { historyFor, state } from './data'
import { realtimeHandler } from './realtime'

const RANGES: HistoryRange[] = ['1h', '24h', '7d']
const outage = () => HttpResponse.json({ message: 'Service unavailable (simulated)' }, { status: 503 })

export const handlers = [
  http.get('*/api/sensors/latest', async () => {
    await delay(200)
    if (state.serverDown) return outage()
    return HttpResponse.json(state.latest)
  }),
  http.get('*/api/sensors/history', async ({ request }) => {
    await delay(400)
    if (state.serverDown) return outage()
    const range = new URL(request.url).searchParams.get('range')
    if (!RANGES.includes(range as HistoryRange)) {
      return HttpResponse.json({ message: `Invalid range: ${range}` }, { status: 400 })
    }
    return HttpResponse.json(historyFor(range as HistoryRange))
  }),
  http.get('*/api/devices', async () => {
    await delay(200)
    if (state.serverDown) return outage()
    return HttpResponse.json(state.devices)
  }),
  http.get('*/api/edge/status', async () => {
    await delay(100)
    if (state.serverDown) return outage()
    return HttpResponse.json(state.edge)
  }),
  realtimeHandler,
]
