type UniqueConflict = { message: string; field?: string }

const identityConstraints: Record<string, UniqueConflict> = {
  profiles_email_uidx: { message: 'duplicate_email', field: 'email' },
  users_email_key: { message: 'duplicate_email', field: 'email' },
  profiles_username_uidx: { message: 'duplicate_username', field: 'username' },
  auth_users_username_uidx: { message: 'duplicate_username', field: 'username' },
  profiles_national_id_individual_uidx: { message: 'duplicate_national_id', field: 'national_id' },
  profiles_phone_key: { message: 'duplicate_normalized_phone', field: 'phone' },
  users_phone_key: { message: 'duplicate_normalized_phone', field: 'phone' },
  profiles_passport_uidx: { message: 'duplicate_passport', field: 'passport_number' },
}

/** Read PostgreSQL metadata through driver wrappers, never SQL/parameter text. */
export function databaseUniqueConflict(error: unknown): UniqueConflict | null {
  const visited = new Set<object>()
  let current = error
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current)
    const item = current as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (item.code === '23505') {
      return identityConstraints[String(item.constraint)] ?? { message: 'duplicate_record' }
    }
    current = item.cause
  }
  return null
}
