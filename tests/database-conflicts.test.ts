import assert from 'node:assert/strict'
import test from 'node:test'
import { databaseUniqueConflict } from '../server/database-errors.ts'
import { mapSignupError, signupConflictField } from '../src/features/auth/signupProgress.ts'

test('a wrapped PostgreSQL email conflict becomes a field-specific domain error without PII', () => {
  const pg = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'profiles_email_uidx', detail: 'private user data' })
  const error = new Error('Failed query: update profiles with private parameters', { cause: new Error('driver wrapper', { cause: pg }) })
  const conflict = databaseUniqueConflict(error)
  assert.deepEqual(conflict, { message: 'duplicate_email', field: 'email' })
  assert.equal(signupConflictField(conflict!.message), 'email')
  assert.equal(mapSignupError(conflict!.message, (key) => key), 'auth.duplicateEmail')
  assert.ok(!JSON.stringify(conflict).includes('private'))
})

test('identity constraints remain distinguishable when driver detail is omitted', () => {
  for (const [constraint, message, field] of [
    ['profiles_username_uidx', 'duplicate_username', 'username'],
    ['auth_users_username_uidx', 'duplicate_username', 'username'],
    ['profiles_national_id_individual_uidx', 'duplicate_national_id', 'national_id'],
    ['profiles_phone_key', 'duplicate_normalized_phone', 'phone'],
  ]) {
    assert.deepEqual(databaseUniqueConflict({ cause: { code: '23505', constraint } }), { message, field })
  }
})

test('unrecognized unique constraints return a generic conflict without exposing schema names', () => {
  assert.deepEqual(databaseUniqueConflict({ code: '23505', constraint: 'private_internal_index' }), { message: 'duplicate_record' })
})

test('SQL text containing conflict words does not misclassify a different database failure', () => {
  assert.equal(databaseUniqueConflict(new Error('duplicate_email profiles_email_uidx')), null)
  assert.equal(databaseUniqueConflict({ code: '23503', constraint: 'profiles_email_uidx' }), null)
})

test('cyclic driver error chains terminate', () => {
  const error: { cause?: unknown } = {}
  error.cause = error
  assert.equal(databaseUniqueConflict(error), null)
})
