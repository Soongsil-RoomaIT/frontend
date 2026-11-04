import { env } from '@/lib/env'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

let accessToken: string | null = null

/** Set by the auth feature after login; attached as a Bearer token to every request. */
export function setAccessToken(token: string | null) {
  accessToken = token
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const res = await fetch(`${env.apiBaseUrl}${path}`, { ...init, headers })
  const text = await res.text()

  if (!res.ok) {
    // Error bodies aren't always JSON (proxy HTML pages, plain text); keep the status either way
    throw new ApiError(res.status, parseLenient(text))
  }
  return (text ? JSON.parse(text) : undefined) as T
}

function parseLenient(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The server's `{ "message": "..." }` from an error response, if it sent one */
export function serverMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const { body } = error
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
    return body.message.trim() || null
  }
  return null
}
