import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HomeSponsor } from '@/features/home/homeSectionsApi'
import { HomeSection } from './HomeSection'

function SponsorLogo({ sponsor }: { sponsor: HomeSponsor }) {
  const [failed, setFailed] = useState(!sponsor.logo_url)
  if (failed) return <span className="text-xl font-black text-slate-400" aria-hidden="true">{sponsor.name.trim().slice(0, 1).toUpperCase()}</span>
  return <img src={sponsor.logo_url} alt={sponsor.name} className="max-h-16 max-w-[9rem] object-contain" loading="lazy" decoding="async" onError={() => setFailed(true)} />
}

export function SponsorsSlider({ sponsors }: { sponsors: HomeSponsor[] }) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const [manualPaused, setManualPaused] = useState(false)
  const [interactionPaused, setInteractionPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const goTo = useCallback((index: number) => {
    if (!sponsors.length) return
    const next = (index + sponsors.length) % sponsors.length
    const viewport = viewportRef.current
    const target = viewport?.querySelector<HTMLElement>(`[data-sponsor-index="${next}"]`)
    if (viewport && target) {
      const viewportRect = viewport.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      viewport.scrollBy({ left: targetRect.left + targetRect.width / 2 - (viewportRect.left + viewportRect.width / 2), behavior: reducedMotion ? 'auto' : 'smooth' })
    }
    setCurrent(next)
  }, [reducedMotion, sponsors.length])
  useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const sync = () => setReducedMotion(query.matches); sync(); query.addEventListener('change', sync); return () => query.removeEventListener('change', sync) }, [])
  useEffect(() => { if (sponsors.length <= 1 || manualPaused || interactionPaused || reducedMotion) return; const timer = window.setInterval(() => { if (!document.hidden) goTo(current + 1) }, 5000); return () => clearInterval(timer) }, [current, goTo, interactionPaused, manualPaused, reducedMotion, sponsors.length])
  if (!sponsors.length) return null

  return <HomeSection title={t('home.sponsorsTitle')} subtitle={t('home.sponsorsSubtitle')} className="bg-white !py-14 sm:!py-16">
    <div className="border-y border-slate-300 py-6">
      <div className="mb-4 flex items-center justify-between"><p className="text-xs font-bold text-slate-500">{current + 1} / {sponsors.length}</p>{sponsors.length > 1 ? <div className="flex items-center gap-1"><button type="button" onClick={() => goTo(current - 1)} className="grid size-11 place-items-center border border-slate-300 text-slate-700 transition-colors hover:border-rc-blue hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue" aria-label={t('home.sponsorsPrevious')}>→</button><button type="button" onClick={() => setManualPaused((value) => !value)} className="min-h-11 border border-slate-300 px-3 text-xs font-bold text-slate-700 transition-colors hover:border-rc-blue hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue" aria-pressed={manualPaused}>{manualPaused ? t('home.sponsorsPlay') : t('home.sponsorsPause')}</button><button type="button" onClick={() => goTo(current + 1)} className="grid size-11 place-items-center border border-slate-300 text-slate-700 transition-colors hover:border-rc-blue hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue" aria-label={t('home.sponsorsNext')}>←</button></div> : null}</div>
      <div ref={viewportRef} onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)} onFocusCapture={() => setInteractionPaused(true)} onBlurCapture={() => setInteractionPaused(false)} onPointerDown={() => setInteractionPaused(true)} onPointerUp={() => setInteractionPaused(false)} className="flex touch-pan-x snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-roledescription="carousel" aria-label={t('home.sponsorsTitle')}>{sponsors.map((sponsor, index) => {
        const content = <article className="flex h-36 w-48 flex-col items-center justify-center border-e border-slate-200 px-5 text-center sm:w-56"><div className="grid h-20 w-full place-items-center"><SponsorLogo sponsor={sponsor} /></div><p className="mt-2 max-w-full truncate text-sm font-bold text-slate-700">{sponsor.name}</p></article>
        return <div key={sponsor.id} data-sponsor-index={index} className="shrink-0 snap-center">{sponsor.link_url ? <a href={sponsor.link_url} target="_blank" rel="noreferrer" className="block transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue" aria-label={sponsor.name}>{content}</a> : content}</div>
      })}</div>
    </div>
  </HomeSection>
}
