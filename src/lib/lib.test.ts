import { afterEach, describe, expect, it, vi } from 'vitest'
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
