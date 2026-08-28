import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchActiveLeagues } from '@/features/companies/api'
import { backend } from '@/lib/backend'

type Hit =
  | { kind: 'league'; title: string; href: string; hint?: string }
  | { kind: 'company'; title: string; href: string; hint?: string }
  | { kind: 'blog'; title: string; href: string; hint?: string }

export function HeaderSearch({ expanded = false }: { expanded?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const onPointer = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', onPointer)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer) }
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
            backend.from('companies').select('name, slug').ilike('name', like).limit(6),
            backend
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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={expanded ? 'flex min-h-10 w-72 items-center justify-between rounded-full bg-white/75 ps-5 pe-1.5 text-slate-500 transition hover:bg-white hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue' : 'grid size-11 place-items-center border-s border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue'}
        aria-label={t('search.title')}
        aria-expanded={open}
        aria-controls="header-search-panel"
      >
        {expanded ? <span className="truncate text-xs">{t('search.placeholder')}</span> : null}<span className={expanded ? 'grid size-9 shrink-0 place-items-center rounded-full bg-slate-950 text-white' : undefined}><svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg></span>
      </button>
      {open ? (
        <div id="header-search-panel" className="absolute end-0 top-full z-50 mt-2 w-[min(25rem,calc(100vw-1rem))] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_18px_45px_rgb(15_23_42/0.16)]">
          <p className="mb-3 text-xs font-black tracking-[0.12em] text-slate-500">
            {t('search.title')}
          </p>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="min-h-12 w-full border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-rc-blue focus:ring-2 focus:ring-sky-100"
          />
          <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto">
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
                  className="block min-h-12 px-3 py-3 text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue"
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
