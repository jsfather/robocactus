import { backend } from '@/lib/backend'
import type { BlogPost, Company, HomeBanner, League } from '@/types/database'

export type HomeStats = {
  teams: number
  cities: number
  leagues: number
  seasons: number
}

export type TopCompany = Pick<Company, 'id' | 'name' | 'slug' | 'logo_url' | 'bio'> & {
  podium_count: number
}

export async function fetchActiveBanners(): Promise<HomeBanner[]> {
  const { data, error } = await backend
    .from('home_banners')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as HomeBanner[]
}

export async function fetchAllBanners(): Promise<HomeBanner[]> {
  const { data, error } = await backend
    .from('home_banners')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as HomeBanner[]
}

export async function upsertBanner(input: {
  id?: string
  title: string
  subtitle?: string | null
  image_url: string
  link_url?: string | null
  sort_order?: number
  is_active?: boolean
}): Promise<HomeBanner> {
  const payload = {
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() || null,
    image_url: input.image_url.trim(),
    link_url: input.link_url?.trim() || null,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
  }

  if (input.id) {
    const { data, error } = await backend
      .from('home_banners')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as HomeBanner
  }

  const { data, error } = await backend.from('home_banners').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as HomeBanner
}

export async function deleteBanner(id: string): Promise<void> {
  const { error } = await backend.from('home_banners').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchHomeStats(): Promise<HomeStats> {
  const { data, error } = await backend.rpc('home_stats')
  if (error) throw new Error(error.message)
  const raw = (data ?? {}) as Record<string, unknown>
  return {
    teams: Number(raw.teams ?? 0),
    cities: Number(raw.cities ?? 0),
    leagues: Number(raw.leagues ?? 0),
    seasons: Number(raw.seasons ?? 0),
  }
}

export async function fetchTopCompanies(limit = 6): Promise<TopCompany[]> {
  const { data, error } = await backend
    .from('results')
    .select('company_id, rank, companies ( id, name, slug, logo_url, bio )')
    .not('published_at', 'is', null)
    .lte('rank', 3)

  if (error) throw new Error(error.message)

  const map = new Map<string, TopCompany>()
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const company = row.companies as
      | { id: string; name: string; slug: string; logo_url: string | null; bio: string | null }
      | null
    if (!company?.id) continue
    const current = map.get(company.id)
    if (current) {
      current.podium_count += 1
    } else {
      map.set(company.id, {
        id: company.id,
        name: company.name,
        slug: company.slug,
        logo_url: company.logo_url,
        bio: company.bio,
        podium_count: 1,
      })
    }
  }

  return [...map.values()]
    .sort((a, b) => b.podium_count - a.podium_count)
    .slice(0, limit)
}

export async function fetchLatestNews(limit = 3): Promise<BlogPost[]> {
  const { data, error } = await backend
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as BlogPost[]
}

export async function submitContactMessage(input: {
  full_name: string
  email: string
  phone?: string
  subject: string
  body: string
  captchaToken?: string
}): Promise<void> {
  const response = await fetch('/api/forms/contact', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: input.full_name.trim(), email: input.email.trim(), phone: input.phone?.trim() || null,
      subject: input.subject.trim(), body: input.body.trim(), captchaToken: input.captchaToken,
    }),
  })
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
}

export async function fetchContactMessages(): Promise<
  Array<{
    id: string
    full_name: string
    email: string
    phone: string | null
    subject: string
    body: string
    status: 'new' | 'in_review' | 'resolved' | 'spam'
    admin_note: string | null
    assigned_to: string | null
    reviewed_at: string | null
    updated_at: string
    created_at: string
  }>
> {
  const { data, error } = await backend
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{
    id: string
    full_name: string
    email: string
    phone: string | null
    subject: string
    body: string
    status: 'new' | 'in_review' | 'resolved' | 'spam'
    admin_note: string | null
    assigned_to: string | null
    reviewed_at: string | null
    updated_at: string
    created_at: string
  }>
}

export async function updateContactMessage(id: string, patch: { status?: 'new' | 'in_review' | 'resolved' | 'spam'; admin_note?: string | null; assigned_to?: string | null }): Promise<void> {
  const { error } = await backend.from('contact_messages').update({ ...patch, reviewed_at: patch.status && patch.status !== 'new' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export function leagueAccent(category: string | null | undefined): {
  border: string
  glow: string
  text: string
} {
  const key = (category ?? '').toLowerCase()
  if (key.includes('rescue') || key.includes('امداد')) {
    return {
      border: 'border-rc-orange/40',
      glow: 'from-rc-orange/25 to-transparent',
      text: 'text-rc-orange',
    }
  }
  if (key.includes('soccer') || key.includes('فوتبال')) {
    return {
      border: 'border-rc-blue/40',
      glow: 'from-rc-blue/25 to-transparent',
      text: 'text-rc-blue',
    }
  }
  if (key.includes('human') || key.includes('انسان')) {
    return {
      border: 'border-emerald-400/40',
      glow: 'from-emerald-400/20 to-transparent',
      text: 'text-emerald-400',
    }
  }
  return {
    border: 'border-rc-accent/35',
    glow: 'from-rc-accent/20 to-transparent',
    text: 'text-rc-accent',
  }
}

export type { League }
