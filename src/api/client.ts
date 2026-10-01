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
  const body: unknown = text ? JSON.parse(text) : undefined

  if (!res.ok) {
    throw new ApiError(res.status, body)
  }
  return body as T
}
