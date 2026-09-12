/**
 * Validate user-managed links before putting them into an href.  This is a
 * render-time guard as well as a UX helper: old rows may predate server-side
 * validation and must never be able to turn into javascript: links.
 */
export function safeExternalUrl(value: unknown, options: { allowMailto?: boolean; allowTel?: boolean } = {}): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const url = new URL(raw, origin)
    if (url.origin === origin && url.pathname.startsWith('/')) return `${url.pathname}${url.search}${url.hash}`
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
    if (options.allowMailto && url.protocol === 'mailto:') return url.href
    if (options.allowTel && url.protocol === 'tel:') return url.href
  } catch {
    return null
  }
  return null
}

/** Backwards-compatible strict helper used by existing image/embed callers. */
export function safeSameOriginUrl(value?: string | null): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  try {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const url = new URL(raw, origin)
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch { return null }
}
