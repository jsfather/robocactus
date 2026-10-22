import type { BlogPost, HomeBanner } from '@/types/database'

export function localizedSponsor<T extends { name: string; name_en?: string | null }>(sponsor: T, language: string): T {
  return language.startsWith('en') && sponsor.name_en?.trim()
    ? { ...sponsor, name: sponsor.name_en.trim() }
    : sponsor
}

export function localizedBanner(banner: HomeBanner, language: string): HomeBanner {
  if (!language.startsWith('en')) return banner
  return { ...banner, title: banner.title_en?.trim() || banner.title, subtitle: banner.subtitle_en?.trim() || banner.subtitle }
}

export function localizedPost(post: BlogPost, language: string): BlogPost {
  if (!language.startsWith('en')) return post
  return {
    ...post,
    title: post.title_en?.trim() || post.title,
    body: post.body_en?.trim() || post.body,
    excerpt: post.excerpt_en?.trim() || post.excerpt,
    seo_title: post.seo_title_en?.trim() || post.title_en?.trim() || post.seo_title,
    meta_description: post.meta_description_en?.trim() || post.excerpt_en?.trim() || post.meta_description,
    author_name: post.author_name_en?.trim() || post.author_name,
    cover_alt: post.cover_alt_en?.trim() || post.title_en?.trim() || post.cover_alt,
  }
}
