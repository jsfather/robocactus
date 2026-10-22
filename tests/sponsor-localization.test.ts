import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { localizedSponsor } from '../src/features/content/translations.ts'
import { localizeSponsor } from '../src/features/leagues/localize.ts'
import type { LeagueSponsor } from '../src/types/database.ts'

const sponsor: LeagueSponsor = { id: 'sponsor', league_id: 'league', name: 'حامی فارسی', name_en: 'English Sponsor', logo_url: '/logo.webp', website_url: null, sort_order: 0, created_at: '' }

test('home and league sponsor names use independently stored English translations', () => {
  assert.equal(localizedSponsor(sponsor, 'en-US').name, 'English Sponsor')
  assert.equal(localizeSponsor(sponsor, 'en').name, 'English Sponsor')
  assert.equal(localizedSponsor(sponsor, 'fa'), sponsor)
  assert.equal(sponsor.name, 'حامی فارسی')
})

test('untranslated historical sponsors retain their names and media', () => {
  for (const name_en of [null, '', ' ']) {
    const historical = { ...sponsor, name_en }
    assert.equal(localizedSponsor(historical, 'en').name, sponsor.name)
    assert.equal(localizedSponsor(historical, 'en').logo_url, sponsor.logo_url)
  }
})

test('home sponsor migration adds translations without rewriting names or authorization', () => {
  const sql = readFileSync(new URL('../db/migrations/10007_home_sponsor_translation.sql', import.meta.url), 'utf8')
  assert.match(sql, /alter table public\.home_sponsors add column if not exists name_en text/)
  assert.doesNotMatch(sql, /\b(update|delete|drop|policy|grant)\b/i)
})
