import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, serverMessage } from './client'

const respond = (status: number, body: string) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body || null, { status }))

afterEach(() => vi.restoreAllMocks())

describe('apiFetch', () => {
  it('parses JSON on success', async () => {
    respond(200, '{"a":1}')
    await expect(apiFetch('/x')).resolves.toEqual({ a: 1 })
  })

  it('keeps the status when an error body is not JSON (e.g. proxy HTML)', async () => {
    respond(502, '<html>Bad Gateway</html>')
    const err = await apiFetch('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(502)
    expect((err as ApiError).body).toBe('<html>Bad Gateway</html>')
  })

  it('handles an empty error body', async () => {
    respond(503, '')
    const err = await apiFetch('/x').catch((e: unknown) => e)
    expect((err as ApiError).status).toBe(503)
  })

  it('sends JSON content type only with a body', async () => {
    const spy = respond(200, '{}')
    await apiFetch('/x', { method: 'POST', body: '{}' })
    expect(new Headers(spy.mock.calls[0]?.[1]?.headers).get('Content-Type')).toBe('application/json')
  })
})

describe('serverMessage', () => {
  it('extracts a message field', () => {
    expect(serverMessage(new ApiError(409, { message: '사용 중' }))).toBe('사용 중')
  })
  it.each([
    ['plain text body', new ApiError(500, 'oops')],
    ['blank message', new ApiError(500, { message: '  ' })],
    ['non-string message', new ApiError(500, { message: 42 })],
    ['not an ApiError', new TypeError('x')],
  ])('null for %s', (_n, err) => expect(serverMessage(err)).toBeNull())
})
