export function toLatinPhoneDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
}

export function phoneDigits(value: string): string {
  return toLatinPhoneDigits(value).replace(/\D/g, '')
}

export function normalizeIranMobileInput(value: string): string | null {
  const digits = phoneDigits(value)
  if (/^00989\d{9}$/.test(digits)) return `0${digits.slice(4)}`
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`
  if (/^9\d{9}$/.test(digits)) return `0${digits}`
  if (/^09\d{9}$/.test(digits)) return digits
  return null
}

export function normalizePhoneIdentifier(value: string): string {
  const normalized = toLatinPhoneDigits(value)
  const iranMobile = normalizeIranMobileInput(normalized)
  if (iranMobile) return iranMobile
  const digits = phoneDigits(normalized)
  if (normalized.trim().startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`
  if (/^00[1-9]\d{7,14}$/.test(digits)) return `+${digits.slice(2)}`
  return digits
}
