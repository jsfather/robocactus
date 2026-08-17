import { useTranslation } from 'react-i18next'
import type { HomeSponsor } from '@/features/home/homeSectionsApi'
import { HomeSection } from './HomeSection'

export function SponsorsSlider({ sponsors }: { sponsors: HomeSponsor[] }) {
  const { t } = useTranslation()
  if (!sponsors.length) return null

  // Triple for smoother loop when few logos
  const loop = [...sponsors, ...sponsors, ...sponsors]

  return (
    <HomeSection
      index="01"
      title={t('home.sponsorsTitle')}
      subtitle={t('home.sponsorsSubtitle')}
      className="bg-white"
    >
      <div className="relative mx-auto max-w-6xl rounded-[2rem] bg-gradient-to-l from-sky-50 to-emerald-50 p-6 sm:p-10">
        {/* Left / right frame rails — “window” edges */}
        <div
          className="pointer-events-none absolute inset-y-0 start-0 z-20 w-px bg-gradient-to-b from-transparent via-rc-blue/70 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 end-0 z-20 w-px bg-gradient-to-b from-transparent via-rc-blue/70 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-2 start-0 z-20 w-3 border-y border-s border-rc-blue/40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-2 end-0 z-20 w-3 border-y border-e border-rc-blue/40"
          aria-hidden
        />

        {/* Only the center viewport is visible; sides fully masked */}
        <div className="sponsors-marquee-window relative overflow-hidden py-4">
          <div className="flex w-max animate-rc-marquee gap-10 will-change-transform hover:[animation-play-state:paused]">
            {loop.map((s, i) => {
              const card = (
                <span className="flex h-20 w-40 items-center justify-center rounded-2xl border border-white bg-white px-4 shadow-sm sm:w-44">
                  <img
                    src={s.logo_url}
                    alt={s.name}
                    className="max-h-10 max-w-full object-contain opacity-90"
                    loading="lazy"
                  />
                </span>
              )
              return s.link_url ? (
                <a
                  key={`${s.id}-${i}`}
                  href={s.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0"
                  title={s.name}
                >
                  {card}
                </a>
              ) : (
                <div key={`${s.id}-${i}`} className="shrink-0" title={s.name}>
                  {card}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </HomeSection>
  )
}
