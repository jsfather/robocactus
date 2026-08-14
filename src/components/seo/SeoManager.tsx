import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { AppLocale } from '@/i18n'
import { useSiteSettings } from '@/hooks/useSiteSettings'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`
  let el = document.head.querySelector<HTMLLinkElement>(selector)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    if (hreflang) el.hreflang = hreflang
    document.head.appendChild(el)
  }
  el.href = href
}

function matchSeoKey(pathname: string): string {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/leagues')) return 'leagues'
  if (pathname.startsWith('/rankings')) return 'rankings'
  if (pathname.startsWith('/companies/')) return 'company'
  if (pathname.startsWith('/companies')) return 'companies'
  if (pathname.startsWith('/blog/')) return 'blogPost'
  if (pathname.startsWith('/blog') || pathname.startsWith('/news')) return 'blog'
  if (pathname.startsWith('/gallery')) return 'gallery'
  if (pathname.startsWith('/about')) return 'about'
  if (pathname.startsWith('/contact')) return 'contact'
  if (pathname.startsWith('/faq')) return 'faq'
  if (pathname.startsWith('/privacy')) return 'privacy'
  if (pathname.startsWith('/login')) return 'login'
  if (pathname.startsWith('/signup')) return 'signup'
  return 'default'
}

/** Updates document title / description / Open Graph for public routes. */
export function SeoManager() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { settings } = useSiteSettings()
  const locale = (i18n.language === 'en' ? 'en' : 'fa') as AppLocale
  const key = matchSeoKey(pathname)

  useEffect(() => {
    const site =
      (locale === 'en' ? settings?.site_name_en : settings?.site_name_fa) || t('seo.siteName')
    const cmsTitle = locale === 'en' ? settings?.seo_title_en : settings?.seo_title_fa
    const cmsDesc =
      locale === 'en' ? settings?.seo_description_en : settings?.seo_description_fa

    const title =
      (key === 'default' || key === 'home') && cmsTitle
        ? cmsTitle
        : t(`seo.pages.${key}.title`, { defaultValue: t('seo.pages.default.title') })
    const description =
      (key === 'default' || key === 'home') && cmsDesc
        ? cmsDesc
        : t(`seo.pages.${key}.description`, {
            defaultValue: t('seo.pages.default.description'),
          })
    const fullTitle = title.includes(site) ? title : `${title} | ${site}`
    const origin = window.location.origin
    const url = `${origin}${pathname}`
    const ogImage = settings?.og_image_default || `${origin}/og-default.svg`

    document.title = fullTitle
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', 'index,follow')
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', site)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:locale', locale === 'fa' ? 'fa_IR' : 'en_US')
    upsertMeta('property', 'og:image', ogImage)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', ogImage)

    upsertLink('canonical', url)
    upsertLink('alternate', url, locale)
    upsertLink('alternate', url, locale === 'fa' ? 'en' : 'fa')
    upsertLink('alternate', url, 'x-default')

    let script = document.getElementById('rc-jsonld') as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = 'rc-jsonld'
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: site,
      url: origin,
      description,
      inLanguage: [locale],
    })
  }, [key, locale, pathname, t, settings])

  return null
}

/** Optional page-level override (e.g. blog post title). */
export function usePageSeo(input: { title?: string; description?: string; image?: string }) {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { settings } = useSiteSettings()
  const locale = i18n.language === 'en' ? 'en' : 'fa'

  useEffect(() => {
    if (!input.title && !input.description) return
    const site =
      (locale === 'en' ? settings?.site_name_en : settings?.site_name_fa) || t('seo.siteName')
    const fullTitle = input.title
      ? input.title.includes(site)
        ? input.title
        : `${input.title} | ${site}`
      : document.title
    if (input.title) document.title = fullTitle
    if (input.description) {
      upsertMeta('name', 'description', input.description)
      upsertMeta('property', 'og:description', input.description)
      upsertMeta('name', 'twitter:description', input.description)
    }
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('name', 'twitter:title', fullTitle)
    if (input.image) {
      upsertMeta('property', 'og:image', input.image)
      upsertMeta('name', 'twitter:image', input.image)
    }
    upsertMeta('property', 'og:locale', locale === 'fa' ? 'fa_IR' : 'en_US')
    upsertLink('canonical', `${window.location.origin}${pathname}`)
  }, [input.title, input.description, input.image, locale, pathname, t, settings])
}
