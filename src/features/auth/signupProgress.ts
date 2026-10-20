import type { Profile } from '@/types/database'

export type SignupStep = 'type' | 'channel' | 'identity' | 'verify' | 'docs' | 'review'

export function isSignupIncomplete(profile: Pick<Profile, 'signup_completed_at' | 'identity_completed_at' | 'signup_step' | 'account_status' | 'first_name_fa' | 'national_id' | 'account_type' | 'requires_account_approval'> | null | undefined): boolean {
  if (!profile) return false
  if (profile.requires_account_approval && profile.account_status === 'rejected') return true
  if (profile.signup_completed_at || profile.identity_completed_at) return false
  if (profile.signup_step) return true
  if (profile.account_status === 'pending' && Boolean(profile.first_name_fa?.trim() || profile.national_id?.trim() || profile.account_type)) {
    return true
  }
  return false
}

export function hasIdentityBasics(profile: Profile): boolean {
  return Boolean(
    profile.first_name_fa?.trim()
      && profile.last_name_fa?.trim()
      && profile.first_name_en?.trim()
      && profile.last_name_en?.trim()
      && profile.email?.trim()
      && profile.birth_date
      && profile.postal_code?.trim()
      && profile.address?.trim()
      && (profile.account_type === 'legal'
        ? profile.company_name?.trim() && profile.company_national_id?.trim() && profile.legal_representative_national_id?.trim()
        : profile.national_id?.trim()),
  )
}

export function inferSignupStep(profile: Profile, docCount = 0): SignupStep {
  if (!profile.account_type) return 'type'
  if (!['type', 'channel'].includes(profile.signup_step ?? '') && !hasIdentityBasics(profile)) return 'identity'
  if (profile.signup_step === 'channel' && profile.phone_verified_at && profile.phone) return 'identity'
  // Older drafts can still point at verification after SMS login succeeded.
  // Resolve that persisted step from the account's verification state.
  if (profile.signup_step === 'verify' && profile.auth_channel === 'phone' && profile.phone_verified_at) {
    if (!hasIdentityBasics(profile)) return 'identity'
    return docCount === 0 ? 'docs' : 'review'
  }
  if (profile.signup_step && ['channel', 'identity', 'verify', 'docs', 'review'].includes(profile.signup_step)) {
    return profile.signup_step as SignupStep
  }
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

export function signupConflictField(error: string): 'email' | 'username' | 'national_id' | 'phone' | null {
  const normalized = error.toLowerCase()
  if (normalized === 'user_already_exists' || normalized.includes('profiles_email_uidx') || (normalized.includes('duplicate') && normalized.includes('email'))) return 'email'
  if (normalized === 'username_already_exists' || (normalized.includes('duplicate') && normalized.includes('username'))) return 'username'
  if (normalized === 'phone_in_use' || normalized.includes('duplicate_normalized_phone')) return 'phone'
  if (normalized.includes('duplicate_national_id') || (normalized.includes('national_id') && normalized.includes('unique'))) return 'national_id'
  return null
}

export function mapSignupError(error: string | null | undefined, t: (key: string) => string): string | null {
  if (!error) return null
  if (error.includes('signup_identity_required')) return 'اطلاعات هویتی ذخیره‌شده کامل نیست؛ ابتدا مرحله اطلاعات هویتی را تکمیل کنید.'
  if (error === 'duplicate_record') return 'اطلاعات تکراری است؛ لطفاً مشخصات واردشده را بررسی کنید.'
  if (error === 'duplicate_passport') return 'این شماره گذرنامه قبلاً ثبت شده است.'
  const conflictField = signupConflictField(error)
  if (conflictField) {
    const keys = { email: 'auth.duplicateEmail', username: 'auth.duplicateUsername', phone: 'auth.duplicatePhone', national_id: 'auth.duplicateNationalId' }
    return t(keys[conflictField])
  }
  const normalized = error.toLowerCase()
  if (normalized.includes('invalid_name_characters')) {
    return 'نام و نام خانوادگی نباید شامل عدد باشد.'
  }
  if (normalized.includes('invalid_location_characters')) {
    return 'نام استان و شهر نباید شامل عدد باشد.'
  }
  if (normalized.includes('invalid_persian_text')) {
    return 'این فیلد باید با حروف فارسی وارد شود؛ لطفاً زبان صفحه‌کلید را به فارسی تغییر دهید.'
  }
  if (normalized.includes('invalid_english_text')) {
    return 'این فیلد باید با حروف انگلیسی وارد شود؛ لطفاً زبان صفحه‌کلید را به انگلیسی تغییر دهید.'
  }
  if (normalized.includes('failed query') || normalized.includes('profiles_email') || normalized.includes('unique constraint')) {
    if (normalized.includes('email')) return t('auth.duplicateEmail')
    if (normalized.includes('username')) return t('auth.duplicateUsername')
    if (normalized.includes('national_id')) return t('auth.duplicateNationalId')
    if (normalized.includes('phone')) return t('auth.duplicatePhone')
  }
  return error
}
