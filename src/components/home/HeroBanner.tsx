import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeBanner } from '@/types/database'

export function HeroBanner({ banners }: { banners: HomeBanner[] }) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)

  const slides =
    banners.length > 0
      ? banners
      : [
          {
            id: 'fallback',
            title: t('app.name'),
            subtitle: t('home.heroSubtitle'),
            image_url: '',
            link_url: '/signup',
            sort_order: 0,
            is_active: true,
          } satisfies HomeBanner,
        ]

  useEffect(() => {
    if (reduceMotion || slides.length < 2) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, 6000)
    return () => window.clearInterval(id)
  }, [reduceMotion, slides.length])

  const slide = slides[index] ?? slides[0]

  return (
    <section className="relative min-h-[min(92dvh,820px)] w-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          className="absolute inset-0"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.7 }}
        >
          {slide.image_url ? (
            <img
              src={slide.image_url}
              alt=""
              className="h-full w-full object-cover"
              fetchPriority={index === 0 ? 'high' : 'low'}
              decoding="async"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(ellipse_at_30%_20%,rgba(59,130,246,0.35),transparent_50%),radial-gradient(ellipse_at_80%_70%,rgba(249,115,22,0.22),transparent_45%),linear-gradient(160deg,#0b0f19_0%,#111827_55%,#0b0f19_100%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-rc-bg via-rc-bg/70 to-rc-bg/25" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.06)_1px,transparent_1px)] bg-[length:36px_36px] opacity-40" />
        </motion.div>
      </AnimatePresence>

      <div className="relative mx-auto flex min-h-[min(92dvh,820px)] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 md:justify-center md:pb-24 md:pt-20">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="max-w-2xl"
        >
          <p className="mb-3 font-mono text-sm tracking-[0.28em] text-rc-blue uppercase">
            RoboCactus
          </p>
          <h1 className="text-4xl font-bold leading-tight text-balance text-rc-text md:text-6xl">
            {slide.title || t('app.name')}
          </h1>
          <p className="mt-4 max-w-xl text-base text-rc-muted md:text-lg">
            {slide.subtitle || t('home.heroSubtitle')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={slide.link_url || '/signup'}
              className="rounded-md bg-rc-accent px-5 py-2.5 text-sm font-medium text-rc-bg hover:brightness-110"
            >
              {t('home.ctaRegister')}
            </Link>
            <Link
              to="/leagues"
              className="rounded-md border border-rc-blue/45 bg-rc-blue/10 px-5 py-2.5 text-sm text-rc-blue hover:bg-rc-blue/20"
            >
              {t('home.ctaExplore')}
            </Link>
          </div>
        </motion.div>

        {slides.length > 1 ? (
          <div className="absolute bottom-6 start-4 flex gap-2 md:start-auto md:end-4">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={[
                  'h-1.5 w-8 rounded-full transition',
                  i === index ? 'bg-rc-blue' : 'bg-white/25 hover:bg-white/40',
                ].join(' ')}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
