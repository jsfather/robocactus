import { getPublicEnv } from '@/lib/env'

export type BackendUser = {
  id: string
  email?: string | null
  phone?: string | null
  user_metadata?: Record<string, unknown>
  created_at?: string
}

export type BackendSession = {
  access_token: string
  expires_at?: number
  user: BackendUser
}

export type BackendAuthOptions = {
  otp_login_enabled: boolean
  password_login_enabled: boolean
  email_magic_login_enabled: boolean
  email_signup_enabled: boolean
  phone_signup_enabled: boolean
  online_payment_enabled: boolean
  card_to_card_enabled: boolean
  bank_card_number: string | null
  bank_iban: string | null
  bank_account_owner: string | null
}

type BackendError = { message: string }
type BackendResult<T = unknown> = { data: T; error: BackendError | null; count?: number | null }
type QueryAction = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

const configuredBase = getPublicEnv('VITE_API_URL')?.trim().replace(/\/$/, '')
const apiBase = configuredBase ?? ''

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const error = body.error as { message?: string } | string | undefined
    throw new Error(typeof error === 'string' ? error : error?.message ?? `HTTP ${response.status}`)
  }
  return body as T
}

class QueryBuilder implements PromiseLike<BackendResult<any>> {
  private spec: Record<string, unknown>

  constructor(table: string) {
    this.spec = { table, action: 'select' satisfies QueryAction, filters: [], orders: [] }
  }

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.spec.select = columns
    this.spec.count = options?.count
    this.spec.head = options?.head
    return this
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.spec.action = 'insert'
    this.spec.values = values
    return this
  }

  update(values: Record<string, unknown>) {
    this.spec.action = 'update'
    this.spec.values = values
    return this
  }

  upsert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.spec.action = 'upsert'
    this.spec.values = values
    return this
  }

  delete() {
    this.spec.action = 'delete'
    return this
  }

  private addFilter(operator: string, column: string, value: unknown, comparison?: string) {
    const filters = this.spec.filters as Array<Record<string, unknown>>
    filters.push({ operator, column, value, comparison })
    return this
  }

  eq(column: string, value: unknown) { return this.addFilter('eq', column, value) }
  neq(column: string, value: unknown) { return this.addFilter('neq', column, value) }
  gt(column: string, value: unknown) { return this.addFilter('gt', column, value) }
  gte(column: string, value: unknown) { return this.addFilter('gte', column, value) }
  lt(column: string, value: unknown) { return this.addFilter('lt', column, value) }
  lte(column: string, value: unknown) { return this.addFilter('lte', column, value) }
  like(column: string, value: unknown) { return this.addFilter('like', column, value) }
  ilike(column: string, value: unknown) { return this.addFilter('ilike', column, value) }
  in(column: string, values: unknown[]) { return this.addFilter('in', column, values) }
  is(column: string, value: unknown) { return this.addFilter('is', column, value) }
  not(column: string, comparison: string, value: unknown) {
    return this.addFilter('not', column, value, comparison)
  }
  contains(column: string, value: unknown) { return this.addFilter('contains', column, value) }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const orders = this.spec.orders as Array<Record<string, unknown>>
    orders.push({ column, ascending: options?.ascending ?? true, nullsFirst: options?.nullsFirst })
    return this
  }

  limit(value: number) {
    this.spec.limit = value
    return this
  }

  range(from: number, to: number) {
    this.spec.range = [from, to]
    return this
  }

  single() {
    this.spec.single = 'single'
    return this
  }

  maybeSingle() {
    this.spec.single = 'maybeSingle'
    return this
  }

  private async execute(): Promise<BackendResult<any>> {
    try {
      return await apiRequest<BackendResult<any>>('/query', {
        method: 'POST',
        body: JSON.stringify(this.spec),
      })
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
    }
  }

  then<TResult1 = BackendResult<any>, TResult2 = never>(
    onfulfilled?: ((value: BackendResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
const authListeners = new Set<(event: AuthEvent, session: BackendSession | null) => void>()

async function authCall(path: string, body?: Record<string, unknown>) {
  try {
    return await apiRequest<Record<string, any>>(`/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } }
  }
}

const auth = {
  async getOptions() {
    try {
      const response = await apiRequest<{ options: BackendAuthOptions }>('/auth/options')
      return { data: response.options, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
    }
  },
  async getSession() {
    const response = await authCall('session')
    return { data: { session: (response.session ?? null) as BackendSession | null }, error: response.error ?? null }
  },
  async getUser() {
    const response = await authCall('session')
    return { data: { user: (response.user ?? null) as BackendUser | null }, error: response.error ?? null }
  },
  async signInWithPassword(input: { email: string; password: string }) {
    const response = await authCall('sign-in', input)
    if (!response.error && response.session) {
      for (const listener of authListeners) listener('SIGNED_IN', response.session as BackendSession)
    }
    return { data: response, error: response.error ?? null }
  },
  async signUp(input: {
    email: string
    password: string
    options?: { data?: Record<string, unknown>; emailRedirectTo?: string }
  }) {
    const response = await authCall('sign-up', {
      email: input.email,
      password: input.password,
      metadata: input.options?.data ?? {},
      redirectTo: input.options?.emailRedirectTo,
    })
    if (!response.error && response.session) {
      for (const listener of authListeners) listener('SIGNED_IN', response.session as BackendSession)
    }
    return { data: response, error: response.error ?? null }
  },
  async signInWithOtp(input: {
    email: string
    options?: { emailRedirectTo?: string; shouldCreateUser?: boolean }
  }) {
    const response = await authCall('magic-link', {
      email: input.email,
      redirectTo: input.options?.emailRedirectTo,
      shouldCreateUser: input.options?.shouldCreateUser,
    })
    return { data: response, error: response.error ?? null }
  },
  async exchangeCodeForSession(code: string) {
    const response = await authCall('exchange', { code })
    if (!response.error && response.session) {
      for (const listener of authListeners) listener('SIGNED_IN', response.session as BackendSession)
    }
    return { data: response, error: response.error ?? null }
  },
  async verifyOtp(input: { token_hash: string; type: string }) {
    const response = await authCall('exchange', { token_hash: input.token_hash, type: input.type })
    if (!response.error && response.session) {
      for (const listener of authListeners) listener('SIGNED_IN', response.session as BackendSession)
    }
    return { data: response, error: response.error ?? null }
  },
  async signOut() {
    const response = await authCall('sign-out', {})
    if (!response.error) for (const listener of authListeners) listener('SIGNED_OUT', null)
    return { error: response.error ?? null }
  },
  onAuthStateChange(callback: (event: AuthEvent, session: BackendSession | null) => void) {
    authListeners.add(callback)
    return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }
  },
}

class StorageBucket {
  private readonly bucket: string

  constructor(bucket: string) {
    this.bucket = bucket
  }

  async upload(path: string, file: File, options?: { upsert?: boolean; contentType?: string }) {
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('path', path)
      form.append('upsert', String(options?.upsert ?? false))
      const data = await apiRequest<Record<string, unknown>>(`/storage/${encodeURIComponent(this.bucket)}`, {
        method: 'POST',
        body: form,
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
    }
  }

  getPublicUrl(path: string) {
    return { data: { publicUrl: `${apiBase}/api/storage/public/${encodeURIComponent(this.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}` } }
  }

  getPrivateUrl(path: string) {
    return { data: { privateUrl: `${apiBase}/api/storage/private/${encodeURIComponent(this.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}` } }
  }

  async createSignedUrl(path: string, expiresIn: number) {
    try {
      const data = await apiRequest<{ signedUrl: string }>(`/storage/${encodeURIComponent(this.bucket)}/signed-url`, {
        method: 'POST',
        body: JSON.stringify({ path, expiresIn }),
      })
      return { data: { signedUrl: data.signedUrl }, error: null }
    } catch (error) {
      return { data: { signedUrl: '' }, error: { message: error instanceof Error ? error.message : String(error) } }
    }
  }

  async remove(paths: string[]) {
    try {
      const data = await apiRequest<Record<string, unknown>>(`/storage/${encodeURIComponent(this.bucket)}`, {
        method: 'DELETE',
        body: JSON.stringify({ paths }),
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
    }
  }
}

type ChangeHandler = {
  filter: { event: string; table: string; filter?: string }
  callback: (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void
}

class RealtimeChannel {
  private handlers: ChangeHandler[] = []
  private source: EventSource | null = null
  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  on(_type: 'postgres_changes', filter: ChangeHandler['filter'] & { schema?: string }, callback: ChangeHandler['callback']) {
    this.handlers.push({ filter, callback })
    return this
  }

  subscribe(callback?: (status: string) => void) {
    const tables = [...new Set(this.handlers.map((handler) => handler.filter.table))].join(',')
    this.source = new EventSource(`${apiBase}/api/realtime?tables=${encodeURIComponent(tables)}`, { withCredentials: true })
    this.source.onopen = () => callback?.('SUBSCRIBED')
    this.source.onerror = () => callback?.('CHANNEL_ERROR')
    this.source.onmessage = (message) => {
      const event = JSON.parse(message.data) as { table: string; event: string; record?: Record<string, unknown>; old_record?: Record<string, unknown> }
      for (const handler of this.handlers) {
        if (handler.filter.table !== event.table) continue
        if (handler.filter.event !== '*' && handler.filter.event !== event.event) continue
        if (handler.filter.filter) {
          const match = handler.filter.filter.match(/^([^=]+)=eq\.(.*)$/)
          if (match && String(event.record?.[match[1]!]) !== match[2]) continue
        }
        handler.callback({ new: event.record ?? {}, old: event.old_record ?? {}, eventType: event.event })
      }
    }
    return this
  }

  close() {
    this.source?.close()
    this.source = null
  }
}

export const backend = {
  from(table: string) { return new QueryBuilder(table) },
  async rpc(name: string, args: Record<string, unknown> = {}): Promise<BackendResult<any>> {
    try {
      return await apiRequest<BackendResult<any>>(`/rpc/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify(args),
      })
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
    }
  },
  auth,
  storage: { from(bucket: string) { return new StorageBucket(bucket) } },
  channel(name: string) { return new RealtimeChannel(name) },
  async removeChannel(channel: RealtimeChannel) { channel.close(); return 'ok' },
}

export function isBackendConfigured(): boolean {
  return configuredBase !== 'disabled'
}
