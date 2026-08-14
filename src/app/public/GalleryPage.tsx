import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, PanelCard, Select } from '@/components/ui/FormControls'
import { fetchActiveLeagues } from '@/features/companies/api'
import { fetchGalleryCategories, fetchGalleryItems } from '@/features/content/api'
import type { GalleryCategory, GalleryItem, League } from '@/types/database'

function Lightbox({
  items,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  items: GalleryItem[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const item = items[index]
  if (!item) return null

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft') onNext()
    if (e.key === 'ArrowRight') onPrev()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal
      tabIndex={0}
      onKeyDown={onKey}
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute end-4 top-4 text-2xl text-white/80 hover:text-white"
        onClick={onClose}
        aria-label="close"
      >
        ✕
      </button>
      <button
        type="button"
        className="absolute start-3 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/70 hover:text-white"
        onClick={(e) => {
          e.stopPropagation()
          onPrev()
        }}
      >
        ‹
      </button>
      <button
        type="button"
        className="absolute end-3 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/70 hover:text-white"
        onClick={(e) => {
          e.stopPropagation()
          onNext()
        }}
      >
        ›
      </button>
      <div className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {item.media_type === 'video' ? (
          <video src={item.media_url} controls autoPlay className="max-h-[80vh] w-full bg-black" />
        ) : (
          <img src={item.media_url} alt={item.caption ?? ''} className="max-h-[80vh] w-full object-contain" />
        )}
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white/80">
          <p>{item.caption || '—'}</p>
          <p className="font-mono text-xs">
            {index + 1} / {items.length}
          </p>
        </div>
      </div>
    </div>
  )
}

export function GalleryPage() {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [categories, setCategories] = useState<GalleryCategory[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [year, setYear] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (filters?: { year?: string; leagueId?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const [gallery, cats, leagueList] = await Promise.all([
        fetchGalleryItems({
          year: filters?.year ? Number(filters.year) : undefined,
          leagueId: filters?.leagueId || undefined,
        }),
        fetchGalleryCategories(false),
        fetchActiveLeagues().catch(() => [] as League[]),
      ])
      setItems(gallery)
      setCategories(cats)
      setLeagues(leagueList)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFilter = (event: FormEvent) => {
    event.preventDefault()
    setSelectedCategory(null)
    void load({ year, leagueId })
  }

  const catName = (cat: GalleryCategory) =>
    i18n.language?.startsWith('fa') ? cat.name_fa : cat.name_en

  const categoryTiles = useMemo(() => {
    const photos = items.filter((i) => i.media_type !== 'video')
    const tiles: { id: string; name: string; cover: string; count: number }[] = []

    for (const cat of categories) {
      const inCat = photos.filter((i) => i.category_id === cat.id)
      if (!inCat.length) continue
      tiles.push({
        id: cat.id,
        name: catName(cat),
        cover: cat.cover_url || inCat[0]!.media_url,
        count: inCat.length,
      })
    }

    const orphan = photos.filter((i) => !i.category_id)
    if (orphan.length) {
      tiles.push({
        id: 'none',
        name: t('content.uncategorized'),
        cover: orphan[0]!.media_url,
        count: orphan.length,
      })
    }

    return tiles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, categories, i18n.language, t])

  const categoryItems = useMemo(() => {
    if (!selectedCategory) return []
    return items.filter((i) => {
      if (i.media_type === 'video') return false
      if (selectedCategory === 'none') return !i.category_id
      return i.category_id === selectedCategory
    })
  }, [items, selectedCategory])

  const selectedTitle = useMemo(() => {
    if (!selectedCategory) return ''
    if (selectedCategory === 'none') return t('content.uncategorized')
    const cat = categories.find((c) => c.id === selectedCategory)
    return cat ? catName(cat) : t('content.uncategorized')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, categories, i18n.language, t])

  const openLightbox = (idx: number) => setLightboxIndex(idx)

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <div>
        <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">Gallery</p>
        <h1 className="mt-1 text-3xl font-semibold md:text-4xl">{t('content.galleryTitle')}</h1>
        <p className="mt-2 max-w-2xl text-rc-muted">{t('content.gallerySubtitle')}</p>
      </div>

      <PanelCard title={t('rankings.filters')}>
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={onFilter}>
          <Select label={t('rankings.year')} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">{t('rankings.allYears')}</option>
            {[...new Set(items.map((i) => i.season_year).filter(Boolean))]
              .map(Number)
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </Select>
          <Select label={t('team.league')} value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
            <option value="">{t('rankings.allLeagues')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={loading}>
            {t('rankings.apply')}
          </Button>
        </form>
        <div className="mt-3 max-w-xs">
          <Input
            label={t('content.customYear')}
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            dir="ltr"
          />
        </div>
      </PanelCard>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}

      {!loading && !selectedCategory ? (
        <>
          <h2 className="text-xl font-semibold">{t('content.galleryCategories')}</h2>
          {categoryTiles.length === 0 ? (
            <p className="text-rc-muted">{t('content.galleryEmpty')}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoryTiles.map((cat) => (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className="group relative block w-full overflow-hidden border border-rc-line text-start"
                  >
                    <img
                      src={cat.cover}
                      alt=""
                      className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <p className="text-lg font-semibold text-white">{cat.name}</p>
                      <p className="font-mono text-xs text-white/70">
                        {t('content.photoCount', { count: cat.count })}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {!loading && selectedCategory ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <button
                type="button"
                className="text-sm text-rc-blue hover:underline"
                onClick={() => setSelectedCategory(null)}
              >
                ← {t('content.backToCategories')}
              </button>
              <h2 className="mt-1 text-2xl font-semibold">{selectedTitle}</h2>
            </div>
          </div>
          {categoryItems.length === 0 ? (
            <p className="text-rc-muted">{t('content.galleryEmpty')}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryItems.map((item, idx) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="group block w-full overflow-hidden border border-rc-line"
                    onClick={() => openLightbox(idx)}
                  >
                    <img
                      src={item.media_url}
                      alt={item.caption ?? ''}
                      className="aspect-video w-full object-cover transition duration-400 group-hover:scale-105"
                    />
                    {item.caption ? (
                      <p className="truncate p-2 text-start text-sm text-rc-muted">{item.caption}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {lightboxIndex != null ? (
        <Lightbox
          items={categoryItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex((i) => {
              if (i == null) return 0
              return (i - 1 + categoryItems.length) % categoryItems.length
            })
          }
          onNext={() =>
            setLightboxIndex((i) => {
              if (i == null) return 0
              return (i + 1) % categoryItems.length
            })
          }
        />
      ) : null}
    </div>
  )
}
