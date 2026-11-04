/**
 * Random id for idempotency keys. `crypto.randomUUID` only exists in secure contexts
 * (HTTPS or localhost), so opening the dev server from a phone via http://192.168.x.x
 * would throw without the fallback.
 */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
