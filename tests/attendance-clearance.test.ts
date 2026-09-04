import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path:string)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
const migration=read('db/migrations/0070_competition_attendance_clearance.sql')

test('attendance clearance is server-authoritative and payment gated',()=>{
  assert.match(migration,/create table if not exists public\.team_attendance_clearances/)
  assert.match(migration,/if not v_paid then raise exception 'payment_required'/)
  assert.match(migration,/team_members_not_approved/)
  assert.match(migration,/member_edit_not_allowed/)
  assert.match(migration,/submit_team_member_correction/)
  assert.match(migration,/technical_submission_not_pending/)
  assert.match(migration,/technical_approval_required/)
})

test('technical files are private, constrained and validated by ownership',()=>{
  assert.match(migration,/technical-submissions','technical-submissions',false,94371840/)
  assert.match(migration,/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)
  assert.match(migration,/invalid_file_reference/)
  const storage=read('server/storage.ts')
  assert.match(storage,/subarray\(4, 8\)\.toString\(\) === 'ftyp'/)
  assert.match(storage,/0x1a, 0x45, 0xdf, 0xa3/)
})

test('participant flow and management controls are separated',()=>{
  const app=read('src/App.tsx'),nav=read('src/features/panel/nav.ts'),page=read('src/app/team/TeamAttendancePage.tsx')
  assert.match(app,/team\/:teamId\/attendance/)
  assert.match(app,/super-admin\/scores/)
  assert.match(app,/super-admin\/live-results/)
  assert.match(nav,/league-admin\/scores/)
  assert.match(page,/setInterval\(\(\)=>void load\(\),15000\)/)
  assert.match(page,/accept_team_attendance_rules|acceptAttendanceRules/)
})

test('homepage blog cards use constrained responsive columns',()=>{
  const news=read('src/components/home/LatestNews.tsx'),card=read('src/components/content/ArticleCard.tsx')
  assert.match(news,/grid-cols-1[\s\S]*sm:grid-cols-2[\s\S]*lg:grid-cols-3/)
  assert.match(news,/overflow-hidden/)
  assert.match(card,/min-w-0 max-w-full overflow-hidden/)
})
