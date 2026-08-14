export function slugify(input: string): string {
  const result = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0600-\u06FF-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (result) return result

  // Persian-only names may strip to empty under \w; keep a readable fallback
  const compact = input.trim().replace(/\s+/g, '-').slice(0, 48)
  return compact || `org-${Date.now()}`
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('98') && digits.length === 12) {
    return `0${digits.slice(2)}`
  }
  return digits
}

export const ALLOWED_DOC_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const MAX_DOC_BYTES = 5 * 1024 * 1024
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export function validateDocumentFile(file: File): string | null {
  if (!ALLOWED_DOC_MIME.includes(file.type as (typeof ALLOWED_DOC_MIME)[number])) {
    return 'invalid_type'
  }
  if (file.size > MAX_DOC_BYTES) {
    return 'too_large'
  }
  return null
}

export function validateLogoFile(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'invalid_type'
  }
  if (file.size > MAX_LOGO_BYTES) {
    return 'too_large'
  }
  return null
}
