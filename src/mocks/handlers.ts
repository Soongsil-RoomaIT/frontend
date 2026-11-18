import { delay, http, HttpResponse } from 'msw'
import type { HistoryRange } from '@/api/types'
import {
  actOnRecommendation,
  automationResponse,
  markRead,
  notificationsResponse,
  outdoorResponse,
  predictionResponse,
  putAutomation,
  recommendationsResponse,
} from './cloud'
import { historyFor, state } from './data'
import { handleCommand } from './devices'
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
  http.post('*/api/devices/:id/commands', async ({ params, request }) => {
    await delay(150)
    const body: unknown = await request.json().catch(() => null)
    const action = typeof body === 'object' && body !== null && 'action' in body ? body.action : undefined
    const result = handleCommand(String(params.id), action, request.headers.get('Idempotency-Key'))
    return HttpResponse.json(result.body, { status: result.status })
  }),
  http.get('*/api/edge/status', async () => {
    await delay(100)
    if (state.serverDown) return outage()
    return HttpResponse.json(state.edge)
  }),
  http.get('*/api/outdoor', async () => {
    await delay(250)
    if (state.serverDown) return outage()
    return HttpResponse.json(outdoorResponse())
  }),
  http.get('*/api/forecast', async () => {
    await delay(250)
    if (state.serverDown) return outage()
    return HttpResponse.json(predictionResponse())
  }),
  http.get('*/api/recommendations', async () => {
    await delay(250)
    if (state.serverDown) return outage()
    return HttpResponse.json(recommendationsResponse())
  }),
  http.post('*/api/recommendations/:id/:verb', async ({ params }) => {
    await delay(300)
    if (state.serverDown) return outage()
    const result = actOnRecommendation(String(params.id), String(params.verb))
    return HttpResponse.json(result.body, { status: result.status })
  }),
  http.get('*/api/automation', async () => {
    await delay(200)
    if (state.serverDown) return outage()
    return HttpResponse.json(automationResponse())
  }),
  http.put('*/api/automation', async ({ request }) => {
    await delay(300)
    if (state.serverDown) return outage()
    const result = putAutomation(await request.json().catch(() => null))
    return HttpResponse.json(result.body, { status: result.status })
  }),
  http.get('*/api/notifications', async () => {
    await delay(200)
    if (state.serverDown) return outage()
    return HttpResponse.json(notificationsResponse())
  }),
  http.patch('*/api/notifications/:id/read', async ({ params }) => {
    await delay(100)
    if (state.serverDown) return outage()
    const result = markRead(String(params.id))
    return HttpResponse.json(result.body, { status: result.status })
  }),
  realtimeHandler,
]
