import type { Request } from 'express'

function normalizeHttpOrigin(value: string | undefined): string | null {
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function firstForwardedValue(value: string | undefined): string | undefined {
  return value?.split(',', 1)[0]?.trim() || undefined
}

export type OriginCheck = {
  allowed: boolean
  receivedOrigin: string | null
  allowedOrigins: string[]
}

/**
 * Accept the configured public domains and the public host reported by the
 * trusted reverse proxy. The latter is important on Dokploy/Traefik, where the
 * browser uses HTTPS while the Node process receives plain HTTP internally.
 */
export function checkRequestOrigin(request: Request, configuredOrigins: string[]): OriginCheck {
  const rawOrigin = request.get('origin')
  if (!rawOrigin) {
    return { allowed: true, receivedOrigin: null, allowedOrigins: [] }
  }

  const receivedOrigin = normalizeHttpOrigin(rawOrigin)
  const allowedOrigins = new Set<string>()

  for (const origin of configuredOrigins) {
    const normalized = normalizeHttpOrigin(origin)
    if (normalized) allowedOrigins.add(normalized)
  }

  const forwardedProtocol = firstForwardedValue(request.get('x-forwarded-proto'))
  const forwardedHost = firstForwardedValue(request.get('x-forwarded-host'))
  const protocol = forwardedProtocol ?? request.protocol
  const host = forwardedHost ?? request.get('host')
  const proxyOrigin = normalizeHttpOrigin(host ? `${protocol}://${host}` : undefined)
  if (proxyOrigin) allowedOrigins.add(proxyOrigin)

  // Traefik normally preserves Host. Keep this candidate as a fallback for
  // proxy chains that rewrite X-Forwarded-Host but preserve the original Host.
  const hostOrigin = normalizeHttpOrigin(request.get('host') ? `${request.protocol}://${request.get('host')}` : undefined)
  if (hostOrigin) allowedOrigins.add(hostOrigin)

  return {
    allowed: receivedOrigin !== null && allowedOrigins.has(receivedOrigin),
    receivedOrigin,
    allowedOrigins: [...allowedOrigins],
  }
}
