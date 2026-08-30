import type { Profile } from '@/types/database'
import { backend } from '@/lib/backend'

export type SignupStep = 'type' | 'channel' | 'identity' | 'verify' | 'docs' | 'review'

export function isSignupIncomplete(profile: Pick<Profile, 'signup_completed_at' | 'identity_completed_at' | 'signup_step' | 'account_status' | 'first_name_fa' | 'national_id' | 'account_type'> | null | undefined): boolean {
  if (!profile) return false
  if (profile.signup_completed_at || profile.identity_completed_at) return false
  if (profile.signup_step) return true
  if (profile.account_status === 'pending' && Boolean(profile.first_name_fa?.trim() || profile.national_id?.trim() || profile.account_type)) {
    return true
  }
  return false
}

function hasIdentityBasics(profile: Profile): boolean {
  return Boolean(
    profile.first_name_fa?.trim()
      && profile.last_name_fa?.trim()
      && profile.first_name_en?.trim()
      && profile.last_name_en?.trim()
      && profile.birth_date
      && profile.postal_code?.trim()
      && profile.address?.trim()
      && (profile.account_type === 'legal'
        ? profile.company_name?.trim() && profile.company_national_id?.trim() && profile.legal_representative_national_id?.trim()
        : profile.national_id?.trim()),
  )
}

export function inferSignupStep(profile: Profile, docCount = 0): SignupStep {
  if (profile.signup_step && profile.signup_step !== 'type') {
    return profile.signup_step as SignupStep
  }
  if (!profile.account_type) return 'type'
  if (!hasIdentityBasics(profile)) return 'identity'
  if (profile.auth_channel === 'phone' && !profile.phone_verified_at && !profile.signup_completed_at) {
    return 'verify'
  }
  if (docCount === 0 && !profile.signup_completed_at) return 'docs'
  if (!profile.signup_completed_at) return 'review'
  return 'review'
}

export function hydrateSignupFormFromProfile(profile: Profile) {
  return {
    accountType: profile.account_type ?? 'individual',
    authChannel: (profile.auth_channel ?? 'phone') as 'phone' | 'email',
    fullName: profile.full_name ?? '',
    username: profile.username ?? '',
    firstNameFa: profile.first_name_fa ?? '',
    lastNameFa: profile.last_name_fa ?? '',
    firstNameEn: profile.first_name_en ?? '',
    lastNameEn: profile.last_name_en ?? '',
    birthDate: profile.birth_date ?? '',
    postalCode: profile.postal_code ?? '',
    representativeNationalId: profile.legal_representative_national_id ?? '',
    nationalId: profile.national_id ?? '',
    companyName: profile.company_name ?? '',
    companyNationalId: profile.company_national_id ?? '',
    economicCode: profile.economic_code ?? '',
    address: profile.address ?? '',
    phone: profile.phone?.startsWith('e:') ? '' : (profile.phone ?? ''),
    email: profile.email ?? '',
  }
}

export function mapSignupError(error: string | null | undefined, t: (key: string) => string): string | null {
  if (!error) return null
  const normalized = error.toLowerCase()
  if (error === 'user_already_exists' || normalized.includes('profiles_email_uidx') || (normalized.includes('duplicate') && normalized.includes('email'))) {
    return t('auth.duplicateEmail')
  }
  if (error === 'username_already_exists' || (normalized.includes('duplicate') && normalized.includes('username'))) {
    return t('auth.duplicateUsername')
  }
  if (error === 'phone_in_use' || normalized.includes('duplicate_normalized_phone')) {
    return t('auth.duplicatePhone')
  }
  if (normalized.includes('duplicate_national_id') || (normalized.includes('national_id') && normalized.includes('unique'))) {
    return t('auth.duplicateNationalId')
  }
  if (normalized.includes('failed query') || normalized.includes('profiles_email') || normalized.includes('unique constraint')) {
    if (normalized.includes('email')) return t('auth.duplicateEmail')
    if (normalized.includes('username')) return t('auth.duplicateUsername')
    if (normalized.includes('national_id')) return t('auth.duplicateNationalId')
    if (normalized.includes('phone')) return t('auth.duplicatePhone')
  }
  return error
}

export async function checkProfileDuplicates(
  userId: string,
  input: { email?: string; nationalId?: string; username?: string; accountType?: Profile['account_type'] },
): Promise<'email' | 'national_id' | 'username' | null> {
  const email = input.email?.trim().toLowerCase()
  if (email) {
    const { data } = await backend.from('profiles').select('id').eq('email', email).neq('id', userId).maybeSingle()
    if (data) return 'email'
  }

  const username = input.username?.trim().toLowerCase()
  if (username) {
    const { data } = await backend.from('profiles').select('id').eq('username', username).neq('id', userId).maybeSingle()
    if (data) return 'username'
  }

  const nationalId = input.nationalId?.trim()
  if (input.accountType === 'individual' && nationalId) {
    const { data } = await backend.from('profiles').select('id').eq('national_id', nationalId).neq('id', userId).maybeSingle()
    if (data) return 'national_id'
  }

  return null
}

export function duplicateFieldMessage(field: 'email' | 'national_id' | 'username', t: (key: string) => string): string {
  if (field === 'email') return t('auth.duplicateEmail')
  if (field === 'national_id') return t('auth.duplicateNationalId')
  return t('auth.duplicateUsername')
}
