type PublicEnvironment = Record<string, string | undefined>

declare global {
  interface Window {
    __APP_CONFIG__?: PublicEnvironment
  }
}

const buildEnvironment = import.meta.env as PublicEnvironment

function runtimeEnvironment(): PublicEnvironment {
  return typeof window === 'undefined' ? {} : (window.__APP_CONFIG__ ?? {})
}

/**
 * Reads public frontend configuration from the container first, then Vite.
 * All VITE_* values are visible to browser users and must never contain secrets.
 */
export function getPublicEnv(name: string): string | undefined {
  const runtimeValue = runtimeEnvironment()[name]
  return runtimeValue !== undefined ? runtimeValue : buildEnvironment[name]
}

export function getPublicEnvMap(): PublicEnvironment {
  return { ...buildEnvironment, ...runtimeEnvironment() }
}
