import { sql } from 'drizzle-orm'
import { db } from './db.js'

export async function rateLimited(key: string, maximum: number, windowMs: number): Promise<boolean> {
  const resetAt = new Date(Date.now() + windowMs)
  const result = await db.execute(sql`
    insert into app_private.security_rate_limits(key,count,reset_at)
    values(${key},1,${resetAt})
    on conflict(key) do update set
      count=case when app_private.security_rate_limits.reset_at<=now() then 1 else app_private.security_rate_limits.count+1 end,
      reset_at=case when app_private.security_rate_limits.reset_at<=now() then excluded.reset_at else app_private.security_rate_limits.reset_at end
    returning count
  `)
  return Number(result.rows[0]?.count ?? 1)>maximum
}
