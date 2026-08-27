import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const navigation = read('../src/components/layout/MobileBottomNavigation.tsx')
const layout = read('../src/components/layout/PublicLayout.tsx')
const footer = read('../src/components/layout/PublicFooter.tsx')
const sponsors = read('../src/components/home/SponsorsSlider.tsx')
const chat = read('../src/components/live-chat/LiveChatWidget.tsx')
const scroll = read('../src/components/layout/ScrollToTop.tsx')
const app = read('../src/App.tsx')

test('home is the prominent centered mobile action', () => {
  assert.ok(navigation.indexOf("to: '/blog'") < navigation.indexOf("to: '/'") )
  assert.ok(navigation.indexOf("to: '/'") < navigation.indexOf("to: '/about'"))
  assert.match(navigation, /icon === 'home'/)
  assert.match(navigation, /size-15 -translate-y-3/)
})

test('mobile clearance matches the fixed navigation and safe area', () => {
  assert.match(navigation, /h-\[5\.25rem\]/)
  assert.match(navigation, /safe-area-inset-bottom/)
  assert.match(layout, /pb-\[calc\(5\.25rem\+env\(safe-area-inset-bottom\)\)\]/)
})

test('sponsor autoplay scrolls only its own horizontal viewport', () => {
  assert.match(sponsors, /viewport\.scrollBy/)
  assert.match(sponsors, /horizontalDelta/)
  assert.doesNotMatch(sponsors, /scrollIntoView/)
})

test('chat launcher uses one cleaned-up twenty-second delay', () => {
  assert.match(chat, /setTimeout\(\(\) => setLauncherVisible\(true\), 20_000\)/)
  assert.match(chat, /clearTimeout\(timer\)/)
  assert.match(chat, /animate-rc-fade-up/)
})

test('route changes reset scroll centrally without smooth animation', () => {
  assert.match(scroll, /\[pathname\]/)
  assert.match(scroll, /behavior: 'auto'/)
  assert.match(app, /<ScrollToTop \/>/)
})

test('footer has separated content, contact and copyright hierarchy', () => {
  assert.match(footer, /footer\.ctaTitle/)
  assert.match(footer, /lg:grid-cols/)
  assert.match(footer, /border-t border-white\/10 bg-\[#03283b\]/)
  assert.match(footer, /tel:\$\{phone\.replace/)
})
