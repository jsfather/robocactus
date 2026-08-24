import { createHash } from 'node:crypto'
import type { Request } from 'express'
import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, eq, gt, sql } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { config } from './config.js'

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
})

export const db = drizzle(pool, { schema })
export type Database = NodePgDatabase<typeof schema>
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AuthUser = {
  id: string
  email: string | null
  phone: string | null
  user_metadata: Record<string, unknown>
  created_at: string
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function userFromRequest(request: Request): Promise<AuthUser | null> {
  const token = request.cookies?.rc_session as string | undefined
  if (!token) return null
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1)
  const user = rows[0]?.user
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    user_metadata: (user.rawUserMetaData ?? {}) as Record<string, unknown>,
    created_at: user.createdAt.toISOString(),
  }
}

export async function withRequestRole<T>(
  user: AuthUser | null,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (transaction) => {
    await transaction.execute(sql.raw(`set local role ${user ? 'authenticated' : 'anon'}`))
    await transaction.execute(
      sql`select set_config('request.jwt.claim.sub', ${user?.id ?? ''}, true), set_config('request.jwt.claim.role', ${user ? 'authenticated' : 'anon'}, true)`,
    )
    return callback(transaction)
  })
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.execute(sql`delete from app_private.sessions where expires_at <= now()`)
  await db.execute(sql`delete from app_private.one_time_tokens where expires_at <= now() - interval '1 day'`)
  await db.execute(sql`delete from app_private.realtime_events where created_at < now() - interval '7 days'`)
}
