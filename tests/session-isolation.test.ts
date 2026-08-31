import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const auth = readFileSync(new URL('../src/hooks/useAuth.tsx', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../src/components/panel/UserMenu.tsx', import.meta.url), 'utf8')

test('explicit logout cannot preserve a protected return path', () => {
  assert.match(menu, /navigate\('\/login', \{ replace: true, state: null \}\)/)
  assert.ok(menu.indexOf('const revokeSession = signOut()') < menu.indexOf("navigate('/login'"))
})

test('profile responses from a previous identity are discarded', () => {
  assert.match(auth, /profileRequestUser\.current !== userId/)
  assert.match(auth, /current\?\.id === nextSession\.user\.id \? current : null/)
})

test('logout clears in-memory identity and browser PII drafts before network completion', () => {
  const signOut = auth.slice(auth.indexOf('const signOut = useCallback'), auth.indexOf('const value = useMemo'))
  assert.ok(signOut.indexOf('setSession(null)') < signOut.indexOf('await backend.auth.signOut()'))
  assert.match(signOut, /clearSensitiveBrowserState\(\)/)
  assert.match(auth, /robocactus-team-draft:/)
})
