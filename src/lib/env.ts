export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  wsUrl: import.meta.env.VITE_WS_URL ?? '',
  // Written inline (not via a variable) so production builds can drop the MSW chunk entirely
  enableMocks: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true',
} as const
