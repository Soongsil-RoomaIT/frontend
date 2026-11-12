/**
 * The WebSocket address when VITE_WS_URL is empty: same host as the page, at /ws. That is the
 * deployment shape (nginx serves the site and proxies /api and /ws), so no config is needed there.
 */
export function resolveWsUrl(configured: string | undefined, location: Pick<Location, 'protocol' | 'host'>) {
  if (configured) return configured
  if (!location.host) return ''
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  wsUrl: resolveWsUrl(import.meta.env.VITE_WS_URL, typeof window === 'undefined' ? { protocol: '', host: '' } : window.location),
  // Written inline (not via a variable) so production builds can drop the MSW chunk entirely
  enableMocks: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true',
} as const
