export type OtpVerificationError = 'invalid_session' | 'already_used' | 'expired' | 'too_many_attempts' | 'invalid_code'

export type OtpChallengeSnapshot = {
  consumed: boolean
  invalidated: boolean
  expired: boolean
  attempts: number
}

export function classifyOtpChallenge(snapshot: OtpChallengeSnapshot | null, codeMatches: boolean, maxAttempts: number): OtpVerificationError | null {
  if (!snapshot) return 'invalid_session'
  if (snapshot.consumed) return 'already_used'
  if (snapshot.invalidated) return 'invalid_session'
  if (snapshot.expired) return 'expired'
  if (snapshot.attempts >= maxAttempts) return 'too_many_attempts'
  if (!codeMatches) return 'invalid_code'
  return null
}
