import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import React, { createElement, useCallback, useState, act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { chatMediaType, chatFilename, CHAT_FILE_MAX_BYTES } from '../server/chat-media.ts'
import { mergeChatMessages } from '../src/features/live-chat/messages.ts'
import { ChatTranscript } from '../src/components/live-chat/ChatConversation.tsx'
import type { LiveChatMessage } from '../src/features/live-chat/api.ts'

function png(width=100,height=100) {
  const buffer=Buffer.alloc(33)
  Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer)
  buffer.write('IHDR',12);buffer.writeUInt32BE(width,16);buffer.writeUInt32BE(height,20)
  return buffer
}

test('attachment checks reject wrong MIME, unsupported executable formats, oversize data and huge image dimensions',()=>{
  assert.equal(chatMediaType(Buffer.from('%PDF-1.7\n%%EOF'),'application/pdf'),'application/pdf')
  assert.equal(chatMediaType(png(),'image/png'),'image/png')
  assert.equal(chatMediaType(png(),'application/pdf'),null)
  assert.equal(chatMediaType(Buffer.from('<svg onload="alert(1)">'),'image/svg+xml'),null)
  assert.equal(chatMediaType(Buffer.from('<html>'),'image/jpeg'),null)
  assert.equal(chatMediaType(png(100000,100000),'image/png'),null)
  assert.equal(chatMediaType(Buffer.alloc(CHAT_FILE_MAX_BYTES+1),'application/pdf'),null)
  assert.equal(chatMediaType(Buffer.alloc(0),'audio/webm'),null)
})

test('voice containers use explicit audio MIME types and filenames get a matching safe extension',()=>{
  const webm=Buffer.concat([Buffer.from([26,69,223,163]),Buffer.from('webm OpusHead')])
  assert.equal(chatMediaType(webm,'audio/webm;codecs=opus'),'audio/webm')
  assert.equal(chatMediaType(webm,'video/webm'),null)
  assert.equal(chatMediaType(Buffer.from('OggS OpusHead'),'audio/ogg'),'audio/ogg')
  assert.equal(chatFilename('../report.html','application/pdf'),'.._report.pdf')
  assert.doesNotMatch(chatFilename('bad\r\n/name\u202e.exe','image/png'),/[\r\n/\u202e]/)
  assert.match(chatFilename('voice.anything','audio/mp4'),/\.m4a$/)
})

const initial:LiveChatMessage={id:'m1',session_id:'s1',sender_kind:'guest',sender_id:null,body:'Hello',created_at:'2026-10-22T10:00:00Z',read_at:null,updated_at:'2026-10-22T10:00:00Z'}

test('edits reset old receipts and delayed updates cannot resurrect deleted text',()=>{
  const read={...initial,read_at:'2026-10-22T10:01:00Z',updated_at:'2026-10-22T10:01:00Z'}
  const edit={...initial,body:'Edited',edited_at:'2026-10-22T10:02:00Z',updated_at:'2026-10-22T10:02:00Z'}
  assert.equal(mergeChatMessages([read],[edit])[0]?.read_at,null)
  assert.equal(mergeChatMessages([edit],[read])[0]?.body,'Edited')
  const deleted={...edit,body:'',deleted_at:'2026-10-22T10:03:00Z',updated_at:'2026-10-22T10:03:00Z'}
  assert.equal(mergeChatMessages([deleted],[edit])[0]?.deleted_at,deleted.deleted_at)
  assert.equal(mergeChatMessages([deleted],[edit])[0]?.body,'')
})

test('viewing in an embedded admin panel updates sender ticks even when document.hasFocus is false',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',pretendToBeVisual:true})
  const keys=['window','document','IntersectionObserver','IS_REACT_ACT_ENVIRONMENT']
  const previous=new Map(keys.map((key)=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  const install=(key:string,value:unknown)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})
  install('window',dom.window);install('document',dom.window.document);install('IS_REACT_ACT_ENVIRONMENT',true)
  dom.window.document.hasFocus=()=>false
  class Observer {
    constructor(private callback:(entries:unknown[])=>void){}
    observe(target:Element){this.callback([{target,isIntersecting:true}])}
    disconnect(){}
  }
  install('IntersectionObserver',Observer)
  let calls=0
  function Pair(){
    const [messages,setMessages]=useState([initial])
    const read=useCallback(async(ids:string[])=>{
      calls++;assert.deepEqual(ids,['m1'])
      const rows=[{...initial,read_at:'2026-10-22T10:01:00Z',updated_at:'2026-10-22T10:01:00Z'}]
      setMessages((current)=>mergeChatMessages(current,rows));return rows
    },[])
    return <><ChatTranscript messages={messages} viewer="guest" guestName="Visitor" language="fa" onRead={async()=>[]} /><ChatTranscript messages={messages} viewer="agent" guestName="Visitor" language="fa" onRead={read} /></>
  }
  const root=createRoot(dom.window.document.getElementById('root')!)
  try {
    await act(async()=>{root.render(createElement(Pair))})
    await act(async()=>{await new Promise((resolve)=>setTimeout(resolve,400))})
    assert.equal(calls,1)
    assert.match(dom.window.document.body.textContent || '',/خوانده شد/)
  } finally {
    await act(async()=>root.unmount());dom.window.close()
    for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
  }
})

test('media and moderation keep authorization, tombstones and history on the server',()=>{
  const server=readFileSync(new URL('../server/chat.ts',import.meta.url),'utf8')
  const migration=readFileSync(new URL('../db/migrations/10009_chat_private_media_and_moderation.sql',import.meta.url),'utf8')
  assert.match(server,/id=\$\{sessionId\}::uuid and session_token=\$\{token\}/)
  assert.match(server,/has_panel_permission\('chat'\)/)
  assert.match(server,/message.sender_id!==actor.userId/)
  assert.match(server,/m.deleted_at is null/)
  assert.match(server,/app_private.chat_message_audit/)
  assert.match(server,/for update/)
  assert.match(server,/activeUploads>=8/)
  assert.match(migration,/revoke all on app_private.chat_attachments from public,anon,authenticated/)
  assert.match(migration,/revoke insert,update,delete on public.live_chat_messages/)
  assert.match(migration,/size<=5242880/)
})
