import type { Request, Response, Router } from 'express'
import multer from 'multer'
import { sql } from 'drizzle-orm'
import { db, userFromRequest, withRequestRole, type Transaction } from './db.js'
import { isGuestChatToken } from './chat-token.js'
import { rateLimited } from './rate-limit.js'
import { CHAT_FILE_MAX_BYTES, CHAT_SESSION_MAX_BYTES, chatFilename, chatMediaType } from './chat-media.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CHAT_FILE_MAX_BYTES, files: 1, fields: 1, fieldSize: 20_000, parts: 2 } }).single('file')
let activeUploads = 0

class ChatError extends Error { constructor(public status: number, message: string) { super(message) } }

async function authorize(request: Request, sessionId: string) {
  if (!uuid.test(sessionId)) throw new ChatError(404,'session_not_found')
  const token = request.get('x-chat-token')
  if (token) {
    if (!isGuestChatToken(token)) throw new ChatError(404,'session_not_found')
    const result = await db.execute(sql`select id from public.live_chat_sessions where id=${sessionId}::uuid and session_token=${token}`)
    if (!result.rows.length) throw new ChatError(404,'session_not_found')
    return { kind: 'guest' as const, userId: null, token }
  }
  const user = await userFromRequest(request)
  if (!user) throw new ChatError(401,'authentication_required')
  const allowed = await withRequestRole(user, (transaction) => transaction.execute(sql`select public.has_panel_permission('chat') as allowed`))
  if (allowed.rows[0]?.allowed !== true) throw new ChatError(403,'forbidden')
  return { kind: 'agent' as const, userId: user.id, token: null }
}

async function lockedSession(transaction: Transaction, id: string) {
  const result = await transaction.execute(sql`select status from public.live_chat_sessions where id=${id}::uuid for update`)
  if (!result.rows.length) throw new ChatError(404,'session_not_found')
  return result.rows[0]!
}

function fail(response: Response, error: unknown) {
  if (error instanceof ChatError) return response.status(error.status).json({ error: error.message })
  console.error('[chat] request failed', { name: error instanceof Error ? error.name : 'unknown' })
  return response.status(500).json({ error: 'chat_request_failed' })
}

export function registerChatRoutes(router: Router): void {
  router.post('/chat/sessions/:id/messages', async (request, response) => {
    let slot = false
    try {
      const id = String(request.params.id)
      const actor = await authorize(request,id)
      const sendLimit=actor.kind==='guest'?12:30
      if (await rateLimited(`chat-send:${id}:${actor.kind}:${request.ip}`,sendLimit,60_000)) throw new ChatError(429,'too_many_attempts')
      if (activeUploads>=8) throw new ChatError(503,'chat_busy')
      activeUploads++; slot=true
      await new Promise<void>((resolve,reject) => upload(request,response,(error) => error ? reject(new ChatError(error instanceof multer.MulterError && error.code==='LIMIT_FILE_SIZE' ? 413 : 400,'invalid_chat_upload')) : resolve()))
      const body = String(request.body?.body ?? '').trim()
      if (body.length>5000 || (!body && !request.file)) throw new ChatError(400,'invalid_message_body')
      const file = request.file
      const mime = file ? chatMediaType(file.buffer,file.mimetype) : null
      if (file && !mime) throw new ChatError(415,'invalid_file_content')
      if(file && await rateLimited(`chat-file:${request.ip}`,20,60*60_000)) throw new ChatError(429,'too_many_attempts')
      const result = await db.transaction(async (transaction) => {
        if ((await lockedSession(transaction,id)).status!=='open') throw new ChatError(409,'chat_closed')
        const recent=await transaction.execute(sql`select count(*) as count from public.live_chat_messages where session_id=${id}::uuid and sender_kind=${actor.kind} and created_at>now()-interval '1 minute'`)
        if(Number(recent.rows[0]?.count)>=sendLimit) throw new ChatError(429,'too_many_attempts')
        let attachmentId: string | null = null
        if (file && mime) {
          const quota = await transaction.execute(sql`select coalesce(sum(size),0) as bytes from app_private.chat_attachments where session_id=${id}::uuid`)
          if (Number(quota.rows[0]?.bytes)+file.size>CHAT_SESSION_MAX_BYTES) throw new ChatError(413,'chat_storage_limit')
          const attachment = await transaction.execute(sql`insert into app_private.chat_attachments(session_id,mime_type,filename,size,content) values(${id}::uuid,${mime},${chatFilename(file.originalname,mime)},${file.size},${file.buffer}) returning id`)
          attachmentId = String(attachment.rows[0]!.id)
        }
        const message = await transaction.execute(sql`insert into public.live_chat_messages(session_id,sender_kind,sender_id,body,attachment_id,attachment_name,attachment_mime,attachment_size)
          values(${id}::uuid,${actor.kind},${actor.userId}::uuid,${body},${attachmentId}::uuid,${file && mime ? chatFilename(file.originalname,mime) : null},${mime},${file?.size ?? null}) returning *`)
        await transaction.execute(sql`update public.live_chat_sessions set last_message_at=now(),assigned_to=coalesce(assigned_to,${actor.userId}::uuid) where id=${id}::uuid`)
        const saved=await transaction.execute(sql`select to_jsonb(m) as record from public.live_chat_messages m where id=${String(message.rows[0]!.id)}::uuid`)
        return saved.rows[0]?.record
      })
      response.status(201).json({ data: result })
    } catch (error) { fail(response,error) }
    finally { if(slot) activeUploads-- }
  })

  router.post('/chat/sessions/:id/read', async (request,response) => {
    try {
      const id=String(request.params.id)
      const actor=await authorize(request,id)
      const ids: unknown=request.body?.messageIds
      if (!Array.isArray(ids) || !ids.length || ids.length>500 || ids.some((value) => typeof value!=='string' || !uuid.test(value))) throw new ChatError(400,'invalid_message_ids')
      if(await rateLimited(`chat-read:${id}:${request.ip}`,120,60_000)) throw new ChatError(429,'too_many_attempts')
      const result=await db.transaction(async(transaction) => {
        await transaction.execute(sql`update public.live_chat_messages set read_at=now() where session_id=${id}::uuid and sender_kind=${actor.kind==='guest'?'agent':'guest'} and read_at is null and deleted_at is null and id in (${sql.join(ids.map((value) => sql`${value}::uuid`),sql`, `)})`)
        return transaction.execute(sql`select to_jsonb(m) as record from public.live_chat_messages m where session_id=${id}::uuid and id in (${sql.join(ids.map((value) => sql`${value}::uuid`),sql`, `)})`)
      })
      response.json({ data: result.rows.map((row) => row.record) })
    } catch(error) { fail(response,error) }
  })

  router.get('/chat/sessions/:id/messages/:messageId/attachment',async(request,response) => {
    try {
      const id=String(request.params.id)
      await authorize(request,id)
      if(await rateLimited(`chat-download:${id}:${request.ip}`,120,60_000)) throw new ChatError(429,'too_many_attempts')
      const messageId=String(request.params.messageId)
      if(!uuid.test(messageId)) throw new ChatError(404,'attachment_not_found')
      const result=await db.execute(sql`select a.mime_type,a.filename,a.content from app_private.chat_attachments a join public.live_chat_messages m on m.attachment_id=a.id where m.id=${messageId}::uuid and m.session_id=${id}::uuid and a.session_id=m.session_id and m.deleted_at is null`)
      const attachment=result.rows[0]
      if(!attachment) throw new ChatError(404,'attachment_not_found')
      response.set({ 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; sandbox", 'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(String(attachment.filename)).replace(/'/g,'%27')}` })
      response.type(String(attachment.mime_type)).send(attachment.content)
    } catch(error) { fail(response,error) }
  })

  router.patch('/chat/sessions/:id/messages/:messageId',async(request,response) => {
    try {
      const id=String(request.params.id)
      const actor=await authorize(request,id)
      if(actor.kind!=='agent') throw new ChatError(403,'forbidden')
      if(await rateLimited(`chat-moderate:${actor.userId}`,60,60_000)) throw new ChatError(429,'too_many_attempts')
      const messageId=String(request.params.messageId)
      const action=request.body?.action
      const body=String(request.body?.body ?? '').trim()
      if(!uuid.test(messageId) || !['edit','delete'].includes(action) || (action==='edit' && (!body || body.length>5000))) throw new ChatError(400,'invalid_message_body')
      const result=await db.transaction(async(transaction) => {
        const session=await lockedSession(transaction,id)
        if(action==='edit' && session.status!=='open') throw new ChatError(409,'chat_closed')
        const found=await transaction.execute(sql`select * from public.live_chat_messages where id=${messageId}::uuid and session_id=${id}::uuid for update`)
        const message=found.rows[0]
        if(!message || message.deleted_at || message.sender_kind==='system') throw new ChatError(404,'message_not_found')
        // Operators edit only their own replies; deletion is a support moderation action.
        if(action==='edit' && (message.sender_kind!=='agent' || message.sender_id!==actor.userId)) throw new ChatError(403,'forbidden')
        await transaction.execute(sql`insert into app_private.chat_message_audit(message_id,actor_id,action,previous_body) values(${messageId}::uuid,${actor.userId}::uuid,${action},${String(message.body)})`)
        if(action==='delete') await transaction.execute(sql`update public.live_chat_messages set body='',deleted_at=now() where id=${messageId}::uuid`)
        else await transaction.execute(sql`update public.live_chat_messages set body=${body},edited_at=clock_timestamp(),read_at=null where id=${messageId}::uuid`)
        return transaction.execute(sql`select to_jsonb(m) as record from public.live_chat_messages m where id=${messageId}::uuid`)
      })
      response.json({ data: result.rows[0]?.record })
    } catch(error) { fail(response,error) }
  })
}
