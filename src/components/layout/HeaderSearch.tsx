import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchActiveLeagues } from '@/features/companies/api'
import { supabase } from '@/lib/supabase'

type Hit =
  | { kind: 'league'; title: string; href: string; hint?: string }
  | { kind: 'company'; title: string; href: string; hint?: string }
  | { kind: 'blog'; title: string; href: string; hint?: string }

export function HeaderSearch() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    const id = window.setTimeout(() => {
      void (async () => {
        setBusy(true)
        try {
          const like = `%${term}%`
          const [leagues, companies, posts] = await Promise.all([
            fetchActiveLeagues().catch(() => []),
            supabase.from('companies').select('name, slug').ilike('name', like).limit(6),
            supabase
              .from('blog_posts')
              .select('title, slug')
              .eq('status', 'published')
              .ilike('title', like)
              .limit(6),
          ])
          const leagueHits: Hit[] = leagues
            .filter(
              (l) =>
                l.name.toLowerCase().includes(term.toLowerCase()) ||
                l.slug.toLowerCase().includes(term.toLowerCase()),
            )
            .slice(0, 6)
            .map((l) => ({
              kind: 'league',
              title: l.name,
              href: `/leagues/${l.slug}`,
              hint: l.category ?? undefined,
            }))
          const companyHits: Hit[] = ((companies.data ?? []) as Array<{ name: string; slug: string }>).map(
            (c) => ({
              kind: 'company',
              title: c.name,
              href: `/companies/${c.slug}`,
            }),
          )
          const blogHits: Hit[] = ((posts.data ?? []) as Array<{ title: string; slug: string }>).map(
            (p) => ({
              kind: 'blog',
              title: p.title,
              href: `/blog/${p.slug}`,
            }),
          )
          setHits([...leagueHits, ...companyHits, ...blogHits].slice(0, 12))
        } finally {
          setBusy(false)
        }
      })()
    }, 280)
    return () => window.clearTimeout(id)
  }, [q])

  const label = useMemo(
    () => ({
      league: t('nav.leagues'),
      company: t('nav.companies'),
      blog: t('nav.blog'),
    }),
    [t],
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-rc-line p-2 text-rc-muted hover:bg-rc-hover hover:text-rc-text"
        aria-label={t('search.title')}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] border border-rc-line bg-rc-navy p-3 shadow-xl">
          <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-rc-blue uppercase">
            {t('search.title')}
          </p>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full border border-rc-line bg-rc-surface px-3 py-2 text-sm outline-none focus:border-rc-blue/50"
          />
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {busy ? <li className="px-2 py-2 text-xs text-rc-muted">{t('app.loading')}</li> : null}
            {!busy && q.trim().length >= 2 && hits.length === 0 ? (
              <li className="px-2 py-2 text-xs text-rc-muted">{t('search.empty')}</li>
            ) : null}
            {hits.map((h) => (
              <li key={`${h.kind}-${h.href}`}>
                <Link
                  to={h.href}
                  onClick={() => {
                    setOpen(false)
                    setQ('')
                  }}
                  className="block px-2 py-2 text-sm hover:bg-rc-hover"
                >
                  <span className="font-mono text-[9px] text-rc-blue uppercase">{label[h.kind]}</span>
                  <p className="font-medium">{h.title}</p>
                  {h.hint ? <p className="text-xs text-rc-muted">{h.hint}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
