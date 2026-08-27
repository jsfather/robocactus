import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('about page has a dedicated bilingual professional layout backed by CMS', () => {
  const page = read('src/app/public/AboutPage.tsx')
  assert.match(page, /fetchStaticPage\('about'\)/)
  assert.match(page, /mission[\s\S]*vision[\s\S]*Robotics[\s\S]*Mechatronics[\s\S]*Artificial intelligence/i)
  assert.match(read('src/App.tsx'), /path="about" element=\{<AboutPage/)
})

test('league hero presents one registration status and no registered team count', () => {
  const page = read('src/app/public/LeagueDetailPage.tsx')
  assert.doesNotMatch(page, /leaguePage\.registeredCount/)
  assert.doesNotMatch(page, /statusLabel/)
})

test('countdown includes seconds and explicit locale-aware ordering', () => {
  const page = read('src/app/public/LeagueDetailPage.tsx')
  assert.match(page, /label: 'ثانیه'[\s\S]*label: 'دقیقه'[\s\S]*label: 'ساعت'[\s\S]*label: 'روز'/)
  assert.match(page, /label: 'Days'[\s\S]*label: 'Hours'[\s\S]*label: 'Minutes'[\s\S]*label: 'Seconds'/)
  assert.match(page, /setInterval\(tick, 1_000\)/)
})

test('league stages and people cards keep explicit readable contrast', () => {
  const page = read('src/app/public/LeagueDetailPage.tsx')
  assert.match(page, /text-slate-900">\{step\.title\}/)
  assert.match(page, /function PersonCards[\s\S]*person\.specialty[\s\S]*organization[\s\S]*person\.bio[\s\S]*linkedin_url/)
  assert.match(page, /entryFeeLabel[\s\S]*text-white/)
})
