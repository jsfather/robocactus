import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HomeSponsor } from '@/features/home/homeSectionsApi'
import { HomeSection } from './HomeSection'

function SponsorLogo({ sponsor }: { sponsor: HomeSponsor }) {
  const [failed, setFailed] = useState(!sponsor.logo_url)
  if (failed) return <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-sky-50 to-emerald-50 text-2xl font-black text-rc-blue" aria-hidden="true">{sponsor.name.trim().slice(0, 1).toUpperCase()}</span>
  return <img src={sponsor.logo_url} alt={sponsor.name} className="aspect-[3/2] h-full max-h-20 w-full max-w-[10rem] object-contain" loading="lazy" decoding="async" onError={() => setFailed(true)} />
}

export function SponsorsSlider({ sponsors }: { sponsors: HomeSponsor[] }) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const [interactionPaused, setInteractionPaused] = useState(false)
  const [manualPaused, setManualPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  const goTo = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (!sponsors.length) return
    const next = (index + sponsors.length) % sponsors.length
    const target = viewportRef.current?.querySelector<HTMLElement>(`[data-sponsor-index="${next}"]`)
    const viewport = viewportRef.current
    if (target && viewport) {
      const viewportRect = viewport.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const horizontalDelta = targetRect.left + targetRect.width / 2 - (viewportRect.left + viewportRect.width / 2)
      viewport.scrollBy({ left: horizontalDelta, behavior: reducedMotion ? 'auto' : behavior })
    }
    setCurrent(next)
  }, [reducedMotion, sponsors.length])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(query.matches)
    sync(); query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (sponsors.length <= 1 || manualPaused || interactionPaused || reducedMotion) return
    const timer = window.setInterval(() => {
      if (!document.hidden) goTo(current + 1)
    }, 4200)
    return () => window.clearInterval(timer)
  }, [current, goTo, interactionPaused, manualPaused, reducedMotion, sponsors.length])

  if (!sponsors.length) return null

  const handleScroll = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2
    let nearest = current
    let distance = Number.POSITIVE_INFINITY
    viewport.querySelectorAll<HTMLElement>('[data-sponsor-index]').forEach((item) => {
      const rect = item.getBoundingClientRect()
      const nextDistance = Math.abs(rect.left + rect.width / 2 - center)
      if (nextDistance < distance) { distance = nextDistance; nearest = Number(item.dataset.sponsorIndex) }
    })
    if (nearest !== current) setCurrent(nearest)
  }

  return <HomeSection index="01" title={t('home.sponsorsTitle')} subtitle={t('home.sponsorsSubtitle')} className="bg-white">
    <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-emerald-50/70 p-4 shadow-[0_18px_55px_rgb(16_84_105/0.08)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-2"><button type="button" onClick={() => goTo(current - 1)} className="grid size-10 place-items-center rounded-full border border-sky-100 bg-white text-rc-blue shadow-sm transition hover:border-sky-300 hover:bg-sky-50" aria-label={t('home.sponsorsPrevious')}>→</button><button type="button" onClick={() => goTo(current + 1)} className="grid size-10 place-items-center rounded-full border border-sky-100 bg-white text-rc-blue shadow-sm transition hover:border-sky-300 hover:bg-sky-50" aria-label={t('home.sponsorsNext')}>←</button></div>
        {sponsors.length > 1 ? <button type="button" onClick={() => setManualPaused((value) => !value)} className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:text-rc-blue" aria-pressed={manualPaused}>{manualPaused ? <span aria-hidden>▶</span> : <span aria-hidden>Ⅱ</span>}{manualPaused ? t('home.sponsorsPlay') : t('home.sponsorsPause')}</button> : null}
      </div>
      <div ref={viewportRef} onScroll={handleScroll} onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)} onFocusCapture={() => setInteractionPaused(true)} onBlurCapture={() => setInteractionPaused(false)} onPointerDown={() => setInteractionPaused(true)} onPointerUp={() => setInteractionPaused(false)} onPointerCancel={() => setInteractionPaused(false)} className="flex touch-pan-x snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-[calc(50%_-_7rem)] py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-roledescription="carousel" aria-label={t('home.sponsorsTitle')}>
        {sponsors.map((sponsor, index) => {
          const card = <article className="flex h-44 w-56 flex-col rounded-2xl border border-white bg-white p-4 text-center shadow-[0_10px_28px_rgb(16_84_105/0.08)] transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_16px_36px_rgb(16_84_105/0.12)]"><div className="grid aspect-[3/2] min-h-0 flex-1 place-items-center overflow-hidden rounded-xl bg-slate-50/80 p-3"><SponsorLogo sponsor={sponsor} /></div><p className="mt-3 truncate text-sm font-black text-slate-700">{sponsor.name}</p></article>
          return <div key={sponsor.id} data-sponsor-index={index} className="w-56 shrink-0 snap-center">{sponsor.link_url ? <a href={sponsor.link_url} target="_blank" rel="noreferrer" className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" aria-label={sponsor.name}>{card}</a> : card}</div>
        })}
      </div>
      {sponsors.length > 1 ? <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">{sponsors.map((sponsor, index) => <button key={sponsor.id} type="button" tabIndex={-1} onClick={() => goTo(index)} className={`h-1.5 rounded-full transition-all duration-300 ${current === index ? 'w-7 bg-rc-blue' : 'w-1.5 bg-slate-200'}`} />)}</div> : null}
    </div>
  </HomeSection>
}
