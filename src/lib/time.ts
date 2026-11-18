/**
 * Timestamps arrive in whatever form the sender finds natural: ISO 8601 from the cloud server,
 * Unix seconds from the edge (SAD 10.3), or Unix milliseconds. Everything inside the app is ISO.
 */

// Below this a number is Unix seconds (up to year 5138); above, milliseconds (from 1973)
const MS_THRESHOLD = 1e11

export function toIso(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    return new Date(value >= MS_THRESHOLD ? value : value * 1000).toISOString()
  }
  if (typeof value !== 'string' || value.trim() === '') return null
  // A numeric string is a Unix time that went through a text field
  if (/^\d+(\.\d+)?$/.test(value.trim())) return toIso(Number(value))
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}
