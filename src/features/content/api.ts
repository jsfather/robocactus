import { backend } from '@/lib/backend'
import { validateDocumentFile } from '@/lib/validation'
import { slugify } from '@/lib/validation'
import type {
  Announcement,
  BlogPost,
  ContentCategory,
  ContentStatus,
  GalleryCategory,
  GalleryItem,
  League,
} from '@/types/database'

export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  const { data, error } = await backend
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw new Error(error.message)
  return attachPostCategories((data ?? []) as BlogPost[])
}

export async function fetchPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await backend
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return (await attachPostCategories([data as BlogPost]))[0] ?? null
}

/** Admin: all posts including drafts */
export async function fetchAllPosts(): Promise<BlogPost[]> {
  const { data, error } = await backend
    .from('blog_posts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return attachPostCategories((data ?? []) as BlogPost[])
}

export async function upsertBlogPost(input: {
  id?: string
  title: string
  slug?: string
  cover_image?: string | null
  body: string
  status: ContentStatus
  author_id?: string | null
  excerpt?: string | null
  seo_title?: string | null
  meta_description?: string | null
  og_image?: string | null
  category_id?: string | null
  author_name?: string | null
  cover_alt?: string | null
}): Promise<BlogPost> {
  const slug = slugify(input.slug || input.title)
  let publishedAt: string | null = null
  if (input.status === 'published') {
    publishedAt = new Date().toISOString()
    if (input.id) {
      const { data: existing } = await backend
        .from('blog_posts')
        .select('published_at')
        .eq('id', input.id)
        .maybeSingle()
      if (existing?.published_at) publishedAt = existing.published_at as string
    }
  }

  const payload = {
    title: input.title.trim(),
    slug,
    cover_image: input.cover_image ?? null,
    body: input.body,
    status: input.status,
    author_id: input.author_id ?? null,
    published_at: publishedAt,
    excerpt: input.excerpt?.trim() || null,
    seo_title: input.seo_title?.trim() || null,
    meta_description: input.meta_description?.trim() || null,
    og_image: input.og_image?.trim() || input.cover_image || null,
    category_id: input.category_id || null,
    author_name: input.author_name?.trim() || null,
    cover_alt: input.cover_alt?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await backend
      .from('blog_posts')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as BlogPost
  }

  const { data, error } = await backend.from('blog_posts').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as BlogPost
}

export async function deleteBlogPost(id: string): Promise<void> {
  const { error } = await backend.from('blog_posts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchPublishedAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await backend
    .from('announcements')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw new Error(error.message)
  return attachAnnouncementCategories((data ?? []) as Announcement[])
}

export async function fetchAllAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await backend
    .from('announcements')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)
  return attachAnnouncementCategories((data ?? []) as Announcement[])
}

export async function upsertAnnouncement(input: {
  id?: string
  title: string
  body: string
  league_id?: string | null
  status: ContentStatus
  created_by?: string | null
  excerpt?: string | null
  seo_title?: string | null
  meta_description?: string | null
  cover_image?: string | null
  slug?: string
  category_id?: string | null
  author_name?: string | null
  cover_alt?: string | null
  og_image?: string | null
}): Promise<Announcement> {
  let publishedAt: string | null = null
  if (input.status === 'published') {
    publishedAt = new Date().toISOString()
    if (input.id) {
      const { data: existing } = await backend
        .from('announcements')
        .select('published_at')
        .eq('id', input.id)
        .maybeSingle()
      if (existing?.published_at) publishedAt = existing.published_at as string
    }
  }

  const payload = {
    title: input.title.trim(),
    body: input.body,
    league_id: input.league_id || null,
    status: input.status,
    created_by: input.created_by ?? null,
    published_at: publishedAt,
    excerpt: input.excerpt?.trim() || null,
    seo_title: input.seo_title?.trim() || null,
    meta_description: input.meta_description?.trim() || null,
    cover_image: input.cover_image ?? null,
    slug: slugify(input.slug || input.title),
    category_id: input.category_id || null,
    author_name: input.author_name?.trim() || null,
    cover_alt: input.cover_alt?.trim() || null,
    og_image: input.og_image?.trim() || input.cover_image || null,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await backend
      .from('announcements')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as Announcement
  }

  const { data, error } = await backend.from('announcements').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as Announcement
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await backend.from('announcements').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchPublishedAnnouncementBySlug(slug: string): Promise<Announcement | null> {
  const { data, error } = await backend.from('announcements').select('*').eq('slug', slug).eq('status', 'published').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return (await attachAnnouncementCategories([data as Announcement]))[0] ?? null
}

async function categoryMap() {
  const { data, error } = await backend.from('content_categories').select('*').order('name_fa')
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as ContentCategory[]).map((category) => [category.id, category]))
}

async function attachPostCategories(rows: BlogPost[]): Promise<BlogPost[]> {
  if (!rows.some((row) => row.category_id)) return rows
  const categories = await categoryMap()
  return rows.map((row) => ({ ...row, category: row.category_id ? categories.get(row.category_id) ?? null : null }))
}

async function attachAnnouncementCategories(rows: Announcement[]): Promise<Announcement[]> {
  if (!rows.some((row) => row.category_id)) return rows
  const categories = await categoryMap()
  return rows.map((row) => ({ ...row, category: row.category_id ? categories.get(row.category_id) ?? null : null }))
}

export async function fetchContentCategories(): Promise<ContentCategory[]> {
  const { data, error } = await backend.from('content_categories').select('*').order('name_fa')
  if (error) throw new Error(error.message)
  return (data ?? []) as ContentCategory[]
}

export async function createContentCategory(input: { name_fa: string; name_en: string }): Promise<ContentCategory> {
  const { data, error } = await backend.from('content_categories').insert({ ...input, slug: slugify(input.name_en || input.name_fa) }).select('*').single()
  if (error) throw new Error(error.message)
  return data as ContentCategory
}

export async function fetchGalleryItems(filters?: {
  year?: number
  leagueId?: string
  categoryId?: string
}): Promise<GalleryItem[]> {
  let query = backend.from('gallery_items').select('*').order('created_at', { ascending: false })
  if (filters?.year) query = query.eq('season_year', filters.year)
  if (filters?.leagueId) query = query.eq('league_id', filters.leagueId)
  if (filters?.categoryId) query = query.eq('category_id', filters.categoryId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as GalleryItem[]
}

export async function fetchGalleryCategories(includeInactive = false): Promise<GalleryCategory[]> {
  let query = backend.from('gallery_categories').select('*').order('sort_order').order('created_at')
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as GalleryCategory[]
}

export async function upsertGalleryCategory(input: {
  id?: string
  name_fa: string
  name_en: string
  cover_url?: string | null
  sort_order?: number
  is_active?: boolean
  description_fa?: string | null
  description_en?: string | null
}): Promise<GalleryCategory> {
  const payload = {
    name_fa: input.name_fa.trim(),
    name_en: input.name_en.trim(),
    cover_url: input.cover_url ?? null,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
    description_fa: input.description_fa?.trim() || null,
    description_en: input.description_en?.trim() || null,
  }
  if (input.id) {
    const { data, error } = await backend
      .from('gallery_categories')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as GalleryCategory
  }
  const { data, error } = await backend.from('gallery_categories').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as GalleryCategory
}

export async function deleteGalleryCategory(id: string): Promise<void> {
  const { error } = await backend.from('gallery_categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createGalleryItem(input: {
  media_url: string
  media_type?: string
  league_id?: string | null
  category_id?: string | null
  season_year?: number | null
  caption?: string | null
}): Promise<GalleryItem> {
  const { data, error } = await backend
    .from('gallery_items')
    .insert({
      media_url: input.media_url,
      media_type: input.media_type ?? 'image',
      league_id: input.league_id || null,
      category_id: input.category_id || null,
      season_year: input.season_year ?? null,
      caption: input.caption ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as GalleryItem
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const { error } = await backend.from('gallery_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function uploadContentMedia(userId: string, file: File): Promise<string> {
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
  ]
  if (!allowed.includes(file.type)) throw new Error('invalid_type')
  if (file.size > 10 * 1024 * 1024) throw new Error('too_large')

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await backend.storage.from('content-media').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = backend.storage.from('content-media').getPublicUrl(path)
  return data.publicUrl
}

export async function uploadProfileDocument(userId: string, file: File): Promise<string> {
  const validation = validateDocumentFile(file)
  if (validation) throw new Error(validation)
  const extension = file.name.split('.').pop() ?? 'bin'
  const path = `${userId}/${Date.now()}.${extension}`
  const { error } = await backend.storage.from('profile-documents').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return backend.storage.from('profile-documents').getPrivateUrl(path).data.privateUrl
}

export async function fetchLeaguesForContent(): Promise<League[]> {
  const { data, error } = await backend.from('leagues').select('*').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as League[]
}
