export function safeSameOriginUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch { return null }
}
