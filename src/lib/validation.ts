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

/** Normalize Persian and Arabic-Indic numerals before numeric validation. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
}

/** Controlled-input sanitizer: accepts every supported numeral keyboard, stores ASCII digits only. */
export function numericInput(value: string, maxLength?: number): string {
  const digits = toLatinDigits(value).replace(/\D/g, '')
  return maxLength == null ? digits : digits.slice(0, maxLength)
}

export type LocalizedTextLanguage = 'fa' | 'en'

/** Returns a field-level hint when text was entered with the wrong keyboard script. */
export function localizedTextError(value: string, language: LocalizedTextLanguage): string | undefined {
  if (!value.trim()) return undefined
  if (language === 'fa' && /[A-Za-z]/.test(value)) {
    return 'این فیلد باید با حروف فارسی وارد شود؛ لطفاً زبان صفحه‌کلید را به فارسی تغییر دهید.'
  }
  if (language === 'en' && /[\u0600-\u06FF]/.test(value)) {
    return 'این فیلد باید با حروف انگلیسی وارد شود؛ لطفاً زبان صفحه‌کلید را به انگلیسی تغییر دهید.'
  }
  return undefined
}

export function normalizePhone(phone: string): string {
  const digits = numericInput(phone)
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
