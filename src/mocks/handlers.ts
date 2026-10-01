import { delay, http, HttpResponse } from 'msw'
import { mockDevices, mockEdgeStatus, mockSensorReading } from './data'

export const handlers = [
  http.get('*/api/sensors/latest', async () => {
    await delay(200)
    return HttpResponse.json(mockSensorReading())
  }),
  http.get('*/api/devices', async () => {
    await delay(200)
    return HttpResponse.json(mockDevices)
  }),
  http.get('*/api/edge/status', async () => {
    await delay(100)
    return HttpResponse.json(mockEdgeStatus())
  }),
]
