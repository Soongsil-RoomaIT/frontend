import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveWsUrl } from './env'
import { toIso } from './time'
import { randomId } from './id'
import { withObjectParticle } from './korean'

describe('randomId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('works without crypto.randomUUID (non-secure context, e.g. http://192.168.x.x)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(171) })
    expect(randomId()).toBe('ab'.repeat(16))
  })

  it('uses randomUUID when available', () => {
    expect(randomId()).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('withObjectParticle', () => {
  it.each([
    ['현관문', '현관문을'],
    ['창문', '창문을'],
    ['제습기', '제습기를'],
    ['공기청정기', '공기청정기를'],
    ['Door', 'Door을(를)'],
  ])('%s → %s', (w, out) => expect(withObjectParticle(w)).toBe(out))
})

describe('toIso', () => {
  const t = '2026-10-01T10:00:00.000Z'
  const unix = Date.parse(t) / 1000
  it.each([
    [t, t],
    ['2026-10-01T19:00:00+09:00', t],
    [unix, t],
    [unix * 1000, t],
    [String(unix), t],
    [`${unix}.5`, '2026-10-01T10:00:00.500Z'],
  ])('%j → %s', (input, out) => expect(toIso(input)).toBe(out))

  it.each([[null], [undefined], [''], ['  '], ['soon'], [-5], [0], [NaN], [{}], [true]])('rejects %j', (v) => {
    expect(toIso(v)).toBeNull()
  })
})

describe('resolveWsUrl', () => {
  it('keeps a configured address', () => {
    expect(resolveWsUrl('ws://localhost:8080/ws', { protocol: 'https:', host: 'x' })).toBe('ws://localhost:8080/ws')
  })
  it('derives /ws on the page host, with wss under https', () => {
    expect(resolveWsUrl('', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws')
    expect(resolveWsUrl(undefined, { protocol: 'https:', host: 'home.example' })).toBe('wss://home.example/ws')
  })
  it('stays empty without a host (file://)', () => {
    expect(resolveWsUrl('', { protocol: 'file:', host: '' })).toBe('')
  })
})
