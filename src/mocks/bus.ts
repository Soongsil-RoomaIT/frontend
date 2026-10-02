import { ws } from 'msw'
import type { ServerMessage } from '@/realtime/protocol'

export const encode = (message: ServerMessage) => JSON.stringify(message)

// Falls back to a placeholder so an empty VITE_WS_URL doesn't break the mock setup
export const realtimeLink = ws.link(import.meta.env.VITE_WS_URL || 'ws://localhost/ws')

export const broadcast = (message: ServerMessage) => realtimeLink.broadcast(encode(message))
