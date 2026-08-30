import type { ParticipantFieldRule, Profile } from '@/types/database'

export function normalizeIranMobile(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (/^00989\d{9}$/.test(digits)) return `0${digits.slice(4)}`
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`
  if (/^9\d{9}$/.test(digits)) return `0${digits}`
  if (/^09\d{9}$/.test(digits)) return digits
  if (value.trim().startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`
  if (/^00[1-9]\d{7,14}$/.test(digits)) return `+${digits.slice(2)}`
  return null
}

export function participantDisplayName(profile: Pick<Profile, 'account_type' | 'company_name' | 'gender' | 'full_name' | 'first_name_fa' | 'last_name_fa'>): string {
  if (profile.account_type === 'legal' && profile.company_name?.trim()) return profile.company_name.trim()
  const name = `${profile.first_name_fa ?? ''} ${profile.last_name_fa ?? ''}`.trim() || profile.full_name
  const prefix = profile.gender === 'female' ? 'خانم' : profile.gender === 'male' ? 'آقای' : ''
  return `${prefix} ${name}`.trim()
}

export function participantErrors(profile: Profile, rules: ParticipantFieldRule[] = []): Record<string, string> {
  const errors: Record<string, string> = {}
  const required = rules.filter((rule) => rule.is_required && (rule.applies_to === 'both' || rule.applies_to === profile.account_type))
  for (const rule of required) {
    if (!String((profile as unknown as Record<string, unknown>)[rule.field_key] ?? '').trim()) errors[rule.field_key] = `${rule.label_fa} الزامی است.`
  }
  if (!normalizeIranMobile(profile.phone ?? '')) errors.phone = profile.is_foreign ? 'شماره موبایل بین‌المللی معتبر با کد کشور وارد کنید.' : 'شماره موبایل معتبر ایران وارد کنید؛ مانند 09123456789.'
  if (profile.is_foreign) {
    if (!profile.passport_number?.trim()) errors.passport_number = 'شماره گذرنامه برای اتباع خارجی الزامی است.'
  } else if (profile.account_type === 'individual' && !/^\d{10}$/.test(profile.national_id ?? '')) {
    errors.national_id = 'کد ملی باید ۱۰ رقم باشد.'
  }
  if (!profile.is_foreign && !profile.phone_verified_at) errors.phone_verified_at = 'تأیید پیامکی شماره موبایل الزامی است.'
  if (profile.account_type === 'legal') {
    if (!profile.company_name?.trim()) errors.company_name = 'نام شرکت الزامی است.'
    if (!profile.company_national_id?.trim()) errors.company_national_id = 'شناسه ملی شرکت الزامی است.'
    if (!profile.legal_representative_national_id?.trim()) errors.legal_representative_national_id = 'کد ملی نماینده قانونی الزامی است.'
  }
  return errors
}

export function isParticipantProfileComplete(profile: Profile, rules: ParticipantFieldRule[] = []): boolean {
  if (!profile.identity_completed_at) return false
  return Object.keys(participantErrors(profile, rules)).length === 0
}

export function profileCompletionPercent(
  profile: Profile,
  rules: ParticipantFieldRule[] = [],
  uploadedDocCount = 0,
  requiredDocCount = 0,
): number {
  const required = rules.filter((rule) => rule.is_required && (rule.applies_to === 'both' || rule.applies_to === profile.account_type))
  const checks: boolean[] = required.map((rule) => Boolean(String((profile as unknown as Record<string, unknown>)[rule.field_key] ?? '').trim()))
  if (!profile.is_foreign) checks.push(Boolean(profile.phone_verified_at))
  if (profile.is_foreign) checks.push(Boolean(profile.passport_number?.trim()))
  else if (profile.account_type === 'individual') checks.push(/^\d{10}$/.test(profile.national_id ?? ''))
  if (profile.account_type === 'legal') {
    checks.push(Boolean(profile.company_name?.trim()), Boolean(profile.company_national_id?.trim()), Boolean(profile.legal_representative_national_id?.trim()))
  }
  if (requiredDocCount > 0) checks.push(uploadedDocCount >= requiredDocCount)
  const total = checks.length
  if (!total) return profile.identity_completed_at ? 100 : 0
  const filled = checks.filter(Boolean).length
  return Math.max(0, Math.min(100, Math.round((filled / total) * 100)))
}
