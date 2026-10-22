import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { localizedBanner, localizedPost } from '../src/features/content/translations.ts'
import { normalizeIranMobileInput } from '../server/phone.ts'
import { chatErrorMessage } from '../src/features/live-chat/errors.ts'
import type { BlogPost, HomeBanner } from '../src/types/database.ts'

const post: BlogPost = { id: 'post', title: 'عنوان فارسی', body: '<p>فارسی</p>', slug: 'post', cover_image: null, status: 'published', published_at: null, author_id: null, created_at: '', title_en: 'English title', body_en: '<p>English</p>', excerpt_en: 'Summary', author_name_en: 'Author', cover_alt_en: 'Image' }
const banner: HomeBanner = { id: 'banner', title: 'فارسی', subtitle: 'توضیح', title_en: 'English banner', subtitle_en: 'English description', image_url: '/image.webp', link_url: null, sort_order: 0, is_active: true }

test('English blog content, metadata and accessibility copy are selected without mutating Persian data', () => {
  const english = localizedPost(post, 'en-US')
  assert.equal(english.title, 'English title')
  assert.equal(english.body, '<p>English</p>')
  assert.equal(english.excerpt, 'Summary')
  assert.equal(english.seo_title, 'English title')
  assert.equal(english.meta_description, 'Summary')
  assert.equal(english.author_name, 'Author')
  assert.equal(english.cover_alt, 'Image')
  assert.equal(localizedPost(post, 'fa'), post)
  assert.equal(post.title, 'عنوان فارسی')
})

test('existing untranslated content remains visible and explicit English SEO overrides fallbacks', () => {
  assert.equal(localizedPost({ ...post, title_en: ' ', body_en: null }, 'en').title, post.title)
  assert.equal(localizedPost({ ...post, body_en: null }, 'en').body, post.body)
  assert.equal(localizedPost({ ...post, seo_title_en: 'SEO', meta_description_en: 'Description' }, 'en').seo_title, 'SEO')
})

test('banner languages switch independently and untranslated historical banners remain available', () => {
  assert.equal(localizedBanner(banner, 'en').title, 'English banner')
  assert.equal(localizedBanner(banner, 'en').subtitle, 'English description')
  assert.equal(localizedBanner(banner, 'fa'), banner)
  assert.equal(localizedBanner({ ...banner, title_en: null }, 'en').title, banner.title)
})

test('mobile numbers accept numeral keyboards and country prefixes but reject extra digits and letters', () => {
  for (const input of ['09123456789', '۰۹۱۲۳۴۵۶۷۸۹', '٠٩١٢٣٤٥٦٧٨٩', '+989123456789', '00989123456789']) {
    assert.equal(normalizeIranMobileInput(input), '09123456789')
  }
  for (const input of ['091234567890', '0912345678', '12345678901', 'abc09123456789', '09123456789abc', '++989123456789']) {
    assert.equal(normalizeIranMobileInput(input), null)
  }
})

test('chat errors are useful in both languages and do not expose internal failures', () => {
  assert.match(chatErrorMessage('invalid_chat_identity', 'fa'), /۱۱/)
  assert.match(chatErrorMessage('message_too_long', 'en'), /5,000/)
  assert.doesNotMatch(chatErrorMessage('private database query', 'en'), /private database query/)
})

test('chat repair matches the actual session schema and retains message limits and session isolation', () => {
  const migration = readFileSync(new URL('../db/migrations/10006_content_translations_and_chat_repair.sql', import.meta.url), 'utf8')
  const realtime = readFileSync(new URL('../server/realtime.ts', import.meta.url), 'utf8')
  assert.match(migration, /where session_token=p_token for update/)
  assert.match(migration, /length\(p_body\)>5000/)
  assert.match(migration, />=12/)
  assert.match(migration, /grant execute[\s\S]*to anon,authenticated/)
  assert.doesNotMatch(realtime, /guest_token/)
  assert.match(realtime, /s\.session_token=\$\{client\.guestChatToken\}/)
})
