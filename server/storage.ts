import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Request, Response, Router } from 'express'
import multer from 'multer'
import { sql } from 'drizzle-orm'
import { config } from './config.js'
import { db, userFromRequest, withRequestRole } from './db.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } })

function cleanObjectPath(value: unknown): string {
  const objectPath = String(value ?? '').replace(/^\/+/, '')
  if (!objectPath || objectPath.includes('..') || objectPath.includes('\\')) throw new Error('invalid_path')
  return objectPath
}

function signedValue(bucket: string, objectPath: string, expires: number): string {
  return createHmac('sha256', config.uploadSecret).update(`${bucket}:${objectPath}:${expires}`).digest('base64url')
}

async function lookupObject(bucket: string, objectPath: string) {
  const result = await db.execute(sql`
    select disk_path, mime_type, is_public, content
    from app_private.storage_objects
    where bucket = ${bucket} and object_path = ${objectPath}
    limit 1
  `)
  return result.rows[0] as { disk_path: string; mime_type: string | null; is_public: boolean; content: Buffer | null } | undefined
}

async function sendStoredObject(response: Response, object: { disk_path: string; mime_type: string | null; content: Buffer | null } | undefined) {
  if (!object) { response.sendStatus(404); return }
  if (object.content?.length) {
    response.type(object.mime_type ?? 'application/octet-stream').send(object.content)
    return
  }
  try {
    const body = await fs.readFile(object.disk_path)
    response.type(object.mime_type ?? 'application/octet-stream').send(body)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') { response.sendStatus(404); return }
    console.error('[storage] read failed', { diskPath: object.disk_path, error })
    response.status(503).json({ error: 'storage_read_failed' })
  }
}

function pathFromRegex(request: Request, group: number): string {
  return cleanObjectPath(decodeURIComponent(request.params[group] ?? ''))
}

export function registerStorageRoutes(router: Router): void {
  router.post('/storage/:bucket', upload.single('file'), async (request, response) => {
    const user = await userFromRequest(request)
    if (!user || !request.file) {
      response.status(401).json({ error: 'authentication_required' })
      return
    }
    const bucket = String(request.params.bucket)
    const objectPath = cleanObjectPath(request.body.path)
    const upsert = request.body.upsert === 'true'
    const diskName = randomUUID()
    await fs.mkdir(config.uploadDir, { recursive: true })
    const diskPath = path.join(config.uploadDir, diskName)

    try {
      const bucketResult = await db.execute(sql`
        select public, file_size_limit, allowed_mime_types from storage.buckets where id = ${bucket}
      `)
      const bucketRow = bucketResult.rows[0]
      if (!bucketRow) throw new Error('bucket_not_found')
      if (bucketRow.file_size_limit && request.file.size > Number(bucketRow.file_size_limit)) {
        throw new Error('file_too_large')
      }
      const allowedMimeTypes = bucketRow.allowed_mime_types as string[] | null
      if (allowedMimeTypes?.length && !allowedMimeTypes.includes(request.file.mimetype)) {
        throw new Error('invalid_file_type')
      }

      await withRequestRole(user, async (transaction) => {
        if (upsert) {
          await transaction.execute(sql`
            insert into storage.objects(bucket_id, name, owner, metadata)
            values (${bucket}, ${objectPath}, ${user.id}::uuid, ${{ mimetype: request.file!.mimetype, size: request.file!.size }})
            on conflict (bucket_id, name) do update
            set owner = excluded.owner, metadata = excluded.metadata, updated_at = now()
          `)
        } else {
          await transaction.execute(sql`
            insert into storage.objects(bucket_id, name, owner, metadata)
            values (${bucket}, ${objectPath}, ${user.id}::uuid, ${{ mimetype: request.file!.mimetype, size: request.file!.size }})
          `)
        }
      })

      const previous = await lookupObject(bucket, objectPath)
      await fs.writeFile(diskPath, request.file.buffer)
      await db.execute(sql`
        insert into app_private.storage_objects(id, bucket, object_path, disk_path, owner_id, mime_type, size, is_public, metadata, content)
        values (${randomUUID()}::uuid, ${bucket}, ${objectPath}, ${diskPath}, ${user.id}::uuid,
                ${request.file.mimetype}, ${request.file.size}, ${Boolean(bucketRow.public)}, ${{ originalName: request.file.originalname }},
                decode(${request.file.buffer.toString('base64')}, 'base64'))
        on conflict (bucket, object_path) do update set
          disk_path = excluded.disk_path,
          owner_id = excluded.owner_id,
          mime_type = excluded.mime_type,
          size = excluded.size,
          is_public = excluded.is_public,
          metadata = excluded.metadata,
          content = excluded.content,
          created_at = now()
      `)
      if (previous?.disk_path && previous.disk_path !== diskPath) await fs.unlink(previous.disk_path).catch(() => undefined)
      response.status(201).json({ path: objectPath })
    } catch (error) {
      await fs.unlink(diskPath).catch(() => undefined)
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  router.post('/storage/:bucket/signed-url', async (request, response) => {
    try {
      const user = await userFromRequest(request)
      if (!user) throw new Error('authentication_required')
      const bucket = String(request.params.bucket)
      const objectPath = cleanObjectPath(request.body?.path)
      await withRequestRole(user, async (transaction) => {
        const allowed = await transaction.execute(sql`
          select 1 from storage.objects where bucket_id = ${bucket} and name = ${objectPath} limit 1
        `)
        if (!allowed.rows.length) throw new Error('object_not_found')
      })
      const expires = Math.floor(Date.now() / 1000) + Math.min(Number(request.body?.expiresIn ?? 600), 604800)
      const signature = signedValue(bucket, objectPath, expires)
      const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/')
      response.json({ signedUrl: `${config.appUrl}/api/storage/signed/${encodeURIComponent(bucket)}/${encodedPath}?expires=${expires}&signature=${signature}` })
    } catch (error) {
      response.status(403).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  router.delete('/storage/:bucket', async (request, response) => {
    try {
      const user = await userFromRequest(request)
      if (!user) throw new Error('authentication_required')
      const bucket = String(request.params.bucket)
      const paths = (Array.isArray(request.body?.paths) ? request.body.paths : []).map(cleanObjectPath)
      for (const objectPath of paths) {
        await withRequestRole(user, async (transaction) => {
          const deleted = await transaction.execute(sql`
            delete from storage.objects where bucket_id = ${bucket} and name = ${objectPath} returning id
          `)
          if (!deleted.rows.length) throw new Error('object_not_found')
        })
        const object = await lookupObject(bucket, objectPath)
        await db.execute(sql`delete from app_private.storage_objects where bucket = ${bucket} and object_path = ${objectPath}`)
        if (object?.disk_path) await fs.unlink(object.disk_path).catch(() => undefined)
      }
      response.json({ paths })
    } catch (error) {
      response.status(403).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  router.get(/^\/storage\/public\/([^/]+)\/(.+)$/, async (request, response: Response) => {
    const bucket = decodeURIComponent(request.params[0] ?? '')
    const objectPath = pathFromRegex(request, 1)
    const object = await lookupObject(bucket, objectPath)
    if (!object?.is_public) {
      response.sendStatus(404)
      return
    }
    await sendStoredObject(response, object)
  })

  router.get(/^\/storage\/private\/([^/]+)\/(.+)$/, async (request, response: Response) => {
    const bucket = decodeURIComponent(request.params[0] ?? '')
    const objectPath = pathFromRegex(request, 1)
    const user = await userFromRequest(request)
    if (!user) {
      response.sendStatus(401)
      return
    }
    const allowed = await withRequestRole(user, async (transaction) => transaction.execute(sql`
      select 1 from storage.objects where bucket_id = ${bucket} and name = ${objectPath} limit 1
    `)).catch(() => null)
    if (!allowed?.rows.length) {
      response.sendStatus(404)
      return
    }
    const object = await lookupObject(bucket, objectPath)
    if (!object) {
      response.sendStatus(404)
      return
    }
    await sendStoredObject(response, object)
  })

  router.get(/^\/storage\/signed\/([^/]+)\/(.+)$/, async (request, response: Response) => {
    const bucket = decodeURIComponent(request.params[0] ?? '')
    const objectPath = pathFromRegex(request, 1)
    const expires = Number(request.query.expires)
    const signature = String(request.query.signature ?? '')
    const expected = signedValue(bucket, objectPath, expires)
    const valid = Number.isFinite(expires) && expires >= Math.floor(Date.now() / 1000)
      && signature.length === expected.length
      && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    if (!valid) {
      response.sendStatus(403)
      return
    }
    const object = await lookupObject(bucket, objectPath)
    if (!object) {
      response.sendStatus(404)
      return
    }
    await sendStoredObject(response, object)
  })
}
