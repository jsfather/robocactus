/** Locale-aware date formatting: Jalali for fa, Gregorian for en. */

export function formatAppDate(
  iso: string | null | undefined,
  language: string,
  opts?: { withTime?: boolean },
): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const withTime = opts?.withTime ?? false
  const isFa = language.toLowerCase().startsWith('fa')

  if (isFa) {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(date)
  }

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

export function formatAppDateTime(iso: string | null | undefined, language = 'fa'): string {
  return formatAppDate(iso, language, { withTime: true })
}

export function formatAppTime(iso: string | null | undefined, language: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const isFa = language.toLowerCase().startsWith('fa')
  return new Intl.DateTimeFormat(isFa ? 'fa-IR-u-ca-persian' : 'en-GB', {
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function ageFromBirthDate(isoOrDate: string | null | undefined): number | null {
  if (!isoOrDate) return null
  const d = new Date(isoOrDate.length === 10 ? `${isoOrDate}T12:00:00` : isoOrDate)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 130 ? age : null
}

export function toDateOnly(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate
  const d = new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function leagueCoverUrl(league: {
  cover_image_url?: string | null
  hero_image_url?: string | null
}): string | null {
  return league.cover_image_url || league.hero_image_url || null
}
