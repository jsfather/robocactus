import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HomeSponsor } from '@/features/home/homeSectionsApi'

function SponsorLogo({ sponsor }: { sponsor: HomeSponsor }) {
  const [failed, setFailed] = useState(!sponsor.logo_url)
  if (failed) return <span className="text-4xl font-black text-slate-300" aria-hidden="true">{sponsor.name.trim().slice(0, 1).toUpperCase()}</span>
  return <img src={sponsor.logo_url} alt={sponsor.name} className="max-h-24 max-w-[10rem] object-contain" loading="lazy" decoding="async" onError={() => setFailed(true)} />
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

  return <section className="relative overflow-hidden bg-slate-50 py-16 sm:py-20" aria-labelledby="sponsors-heading"><div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-white to-transparent" aria-hidden="true" /><div className="relative mx-auto max-w-7xl px-4 sm:px-8">
    <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-rc-accent/10 text-rc-accent"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0M18 5v6M15 8h6" /></svg></span><div><h2 id="sponsors-heading" className="text-2xl font-black text-slate-950 sm:text-3xl">{t('home.sponsorsTitle')}</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-slate-500">{t('home.sponsorsSubtitle')}</p></div></div></div>{sponsors.length > 1 ? <div className="flex items-center gap-2"><button type="button" onClick={() => goTo(current - 1)} className="grid size-11 place-items-center rounded-full bg-rc-blue text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue focus-visible:ring-offset-2" aria-label={t('home.sponsorsPrevious')}>→</button><button type="button" onClick={() => goTo(current + 1)} className="grid size-11 place-items-center rounded-full bg-rc-accent text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent focus-visible:ring-offset-2" aria-label={t('home.sponsorsNext')}>←</button><button type="button" onClick={() => setManualPaused((value) => !value)} className="sr-only" aria-pressed={manualPaused}>{manualPaused ? t('home.sponsorsPlay') : t('home.sponsorsPause')}</button></div> : null}</header>

    <div ref={viewportRef} onScroll={() => { const viewport = viewportRef.current; if (!viewport) return; const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2; let nearest = current; let distance = Infinity; viewport.querySelectorAll<HTMLElement>('[data-sponsor-index]').forEach((item) => { const rect = item.getBoundingClientRect(); const nextDistance = Math.abs(rect.left + rect.width / 2 - center); if (nextDistance < distance) { distance = nextDistance; nearest = Number(item.dataset.sponsorIndex) } }); if (nearest !== current) setCurrent(nearest) }} onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)} onFocusCapture={() => setInteractionPaused(true)} onBlurCapture={() => setInteractionPaused(false)} onPointerDown={() => setInteractionPaused(true)} onPointerUp={() => setInteractionPaused(false)} className="flex touch-pan-x snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-roledescription="carousel" aria-label={t('home.sponsorsTitle')}>
      {sponsors.map((sponsor, index) => { const blue = index % 2 === 0; const card = <article className="group relative flex h-72 w-56 flex-col overflow-hidden rounded-[2rem] bg-white p-4 text-center shadow-[0_18px_48px_rgb(15_23_42/0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_58px_rgb(15_23_42/0.12)]"><div className="pointer-events-none absolute -start-20 -top-24 size-52 rounded-full border border-rc-blue/10" /><div className="pointer-events-none absolute -start-14 -top-18 size-44 rounded-full border border-rc-accent/10" /><div className="relative grid min-h-0 flex-1 place-items-center"><SponsorLogo sponsor={sponsor} /></div><div className="relative border-t border-slate-100 pt-5"><h3 className={`truncate text-sm font-black ${blue ? 'text-rc-blue' : 'text-rc-accent'}`}>{sponsor.name}</h3><p className="mt-2 text-xs font-semibold text-slate-500">{t('home.sponsorsOfficialLabel', { defaultValue: 'حامی رسمی جام تبرستان' })}</p></div></article>; return <div key={sponsor.id} data-sponsor-index={index} className="w-56 shrink-0 snap-center">{sponsor.link_url ? <a href={sponsor.link_url} target="_blank" rel="noreferrer" className="block rounded-[2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue focus-visible:ring-offset-2">{card}</a> : card}</div> })}
    </div>
    {sponsors.length > 1 ? <div className="mt-5 flex justify-center gap-2">{sponsors.map((sponsor, index) => <button key={sponsor.id} type="button" onClick={() => goTo(index)} className={`h-2 rounded-full transition-all ${current === index ? `w-8 ${index % 2 === 0 ? 'bg-rc-blue' : 'bg-rc-accent'}` : 'w-2 bg-slate-300 hover:bg-slate-400'}`} aria-label={`${t('home.sponsorsTitle')} ${index + 1}`} aria-current={current === index ? 'true' : undefined} />)}</div> : null}
  </div></section>
}
