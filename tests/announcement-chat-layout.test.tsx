import React, { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { localizedAnnouncement } from '../src/features/content/translations.ts'
import { ChatComposer } from '../src/components/live-chat/ChatConversation.tsx'
import { chatViewportMetrics, useChatViewport } from '../src/features/live-chat/useChatViewport.ts'
import type { Announcement } from '../src/types/database.ts'
import { AnnouncementsSlider } from '../src/components/home/AnnouncementsSlider.tsx'

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
const announcement:Announcement={id:'notice',title:'عنوان فارسی',body:'متن فارسی',league_id:null,status:'published',published_at:null,created_by:null,title_en:'English notice',body_en:'English body',excerpt_en:'English summary',seo_title_en:'Notice SEO',meta_description_en:'Notice description',author_name_en:'Author',cover_alt_en:'Cover'}

test('announcements select independent English content and metadata without modifying Persian records',()=>{
  const translated=localizedAnnouncement(announcement,'en-US')
  assert.equal(translated.title,'English notice');assert.equal(translated.body,'English body')
  assert.equal(translated.excerpt,'English summary');assert.equal(translated.seo_title,'Notice SEO')
  assert.equal(translated.meta_description,'Notice description');assert.equal(translated.author_name,'Author')
  assert.equal(translated.cover_alt,'Cover');assert.equal(announcement.title,'عنوان فارسی')
  assert.equal(localizedAnnouncement(announcement,'fa'),announcement)
  assert.equal(localizedAnnouncement({...announcement,title_en:' ',body_en:null},'en').body,announcement.body)
})

test('announcement cards render localized content, optional covers and links in a responsive grid',async()=>{
  for(const language of ['fa','en']){
    const i18n=createInstance()
    await i18n.init({lng:language,resources:{[language]:{translation:{}}},interpolation:{escapeValue:false}})
    const notices=[{...announcement,published_at:'2026-11-12T10:00:00Z'}, {...announcement,id:'with-cover',cover_image:'/notice.webp',cover_alt:'تصویر اطلاعیه'}]
    const render=(items:Announcement[])=>renderToStaticMarkup(
      <I18nextProvider i18n={i18n}><MemoryRouter><AnnouncementsSlider announcements={items}/></MemoryRouter></I18nextProvider>,
    )
    assert.equal(render([]),'')
    const dom=new JSDOM(render(notices))
    const document=dom.window.document
    assert.equal(document.querySelectorAll('li').length,2)
    assert.equal(document.querySelectorAll('img').length,1)
    assert.equal(document.querySelector('h3')?.textContent,language==='fa'?'عنوان فارسی':'English notice')
    assert.equal(document.querySelector('li a')?.getAttribute('href'),'/news/notice')
    assert.equal(document.querySelector('time')?.getAttribute('datetime'),'2026-11-12T10:00:00Z')
    assert.match(document.querySelector('ul')?.className || '',/grid-cols-1.*md:grid-cols-2.*xl:grid-cols-3/)
    dom.window.close()
  }
})

test('paperclip and microphone controls have accessible names and limits appear below the message form',()=>{
  for(const language of ['fa','en']){
    const markup=renderToStaticMarkup(createElement(ChatComposer,{value:'',onChange:()=>{},onSubmit:()=>{},busy:false,language,onFileChange:()=>{}}))
    const dom=new JSDOM(markup)
    const label=dom.window.document.querySelector('label[title]')!
    assert.ok(label.querySelector('svg'));assert.ok(label.querySelector('input[type="file"]'))
    const mic=dom.window.document.querySelector(`button[aria-label="${language==='fa'?'ضبط ویس':'Record voice'}"]`)!
    assert.ok(mic.querySelector('svg'));assert.equal(mic.textContent,'')
    assert.ok(markup.indexOf(language==='fa'?'محدودیت‌های پیوست و ویس':'Attachment and voice limits')>markup.indexOf('</form>'))
    assert.match(markup,/PDF · JPEG · PNG/)
    dom.window.close()
  }
})

test('visual viewport metrics account for the keyboard and scrolling browser viewport',()=>{
  const metrics=chatViewportMetrics(320,50,800) as Record<string,string>
  assert.equal(metrics['--chat-vv-height'],'320px')
  assert.equal(metrics['--chat-vv-top'],'50px')
  assert.equal(metrics['--chat-vv-bottom'],'430px')
})

test('mobile viewport resize updates chat height and restores background scrolling on close',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'https://example.test'})
  const keys=['window','document','IS_REACT_ACT_ENVIRONMENT']
  const previous=new Map(keys.map((key)=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  const viewport=Object.assign(new dom.window.EventTarget(),{height:700,offsetTop:0})
  Object.defineProperty(dom.window,'visualViewport',{value:viewport})
  Object.defineProperty(dom.window,'matchMedia',{value:()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}})})
  Object.defineProperty(globalThis,'window',{value:dom.window,configurable:true,writable:true})
  Object.defineProperty(globalThis,'document',{value:dom.window.document,configurable:true,writable:true})
  Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true})
  dom.window.document.body.style.overflow='scroll'
  function Probe(){const {style,compact}=useChatViewport(true);return <div id="viewport" style={style} data-compact={compact} />}
  const root=createRoot(dom.window.document.getElementById('root')!)
  try{
    await act(async()=>root.render(<Probe/>))
    assert.equal(dom.window.document.body.style.overflow,'hidden')
    await act(async()=>{viewport.height=320;viewport.offsetTop=50;viewport.dispatchEvent(new dom.window.Event('resize'));await new Promise((resolve)=>setTimeout(resolve,60))})
    const element=dom.window.document.getElementById('viewport')!
    assert.equal(element.style.getPropertyValue('--chat-vv-height'),'320px')
    assert.equal(element.style.getPropertyValue('--chat-vv-top'),'50px')
    assert.equal(element.dataset.compact,'true')
    await act(async()=>root.unmount())
    assert.equal(dom.window.document.body.style.overflow,'scroll')
  }finally{
    dom.window.close()
    for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
  }
})

test('homepage notices appear once, below the introduction and above statistics, and realtime invalidation never publishes draft text',()=>{
  const home=read('src/app/public/HomePage.tsx')
  assert.ok(home.indexOf('<AnnouncementsSlider')>home.indexOf('<TabarestanStory content='))
  assert.ok(home.indexOf('<AnnouncementsSlider')<home.indexOf('<CompetitionStats'))
  assert.equal(home.split('<AnnouncementsSlider').length-1,1)
  assert.match(read('server/realtime.ts'),/if\(tableName==='announcements'\) return \{ id: primaryValue \}/)
})

test('review location reads only assigned reviewers correspondence data and leaves public profile RLS untouched',()=>{
  const migration=read('db/migrations/10010_announcement_translations_review_location.sql')
  assert.match(migration,/has_panel_permission\('team_review'\)/)
  assert.match(migration,/la.league_id=v_team.league_id and la.user_id=auth.uid\(\)/)
  assert.match(migration,/where id=v_team.captain_id/)
  assert.match(migration,/'correspondence_address',v_address/)
  assert.doesNotMatch(migration,/alter table public.profiles|grant select on.*profiles/i)
  assert.match(migration,/grant execute on function public.get_team_review_location\(uuid\) to authenticated/)
  assert.match(read('src/features/judging/TeamReviewLocation.tsx'),/نشانی مکاتبات ثبت‌کننده/)
})
