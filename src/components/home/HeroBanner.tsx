import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeBanner, HomepageContent } from '@/types/database'

export function HeroBanner({ banners, loading = false, content }: { banners: HomeBanner[]; loading?: boolean; content?: HomepageContent['hero'] }) {
  const { i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  const reduceMotion = useReducedMotion()
  const cmsBanner = banners[0]

  if (loading) {
    return <section aria-busy="true" className="min-h-[min(94dvh,880px)] animate-pulse bg-[#061624]" />
  }
  if (!cmsBanner) return null

  return (
    <section className="relative min-h-[min(94dvh,880px)] overflow-hidden bg-[#061624]">
      <img
        src={cmsBanner.image_url}
        alt={cmsBanner.title}
        className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,17,31,.98)_0%,rgba(4,17,31,.78)_42%,rgba(4,17,31,.16)_72%),linear-gradient(0deg,#061624_0%,transparent_35%)] rtl:bg-[linear-gradient(270deg,rgba(4,17,31,.98)_0%,rgba(4,17,31,.76)_43%,rgba(4,17,31,.12)_75%),linear-gradient(0deg,#061624_0%,transparent_35%)]" />
      <div className="absolute inset-0 tabarestan-pattern opacity-30" />

      <div className="relative mx-auto flex min-h-[min(94dvh,880px)] max-w-7xl items-center px-5 pb-20 pt-32 sm:px-8 lg:px-10">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="max-w-3xl">
          {content?.eyebrow_fa || content?.eyebrow_en ? <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-rc-accent/30 bg-rc-accent/10 px-4 py-2 text-xs font-medium text-emerald-200 backdrop-blur-md">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-rc-accent opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-rc-accent" /></span>
            <span>{isEn ? content.eyebrow_en || content.eyebrow_fa : content.eyebrow_fa || content.eyebrow_en}</span>
          </div> : null}
          {content?.kicker_fa || content?.kicker_en ? <p className="mb-3 font-mono text-xs tracking-[0.28em] text-sky-300 uppercase sm:text-sm">{isEn ? content.kicker_en || content.kicker_fa : content.kicker_fa || content.kicker_en}</p> : null}
          <h1 className="text-5xl font-black leading-[1.12] text-white sm:text-6xl lg:text-8xl">{cmsBanner.title}</h1>
          {cmsBanner.subtitle ? <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">{cmsBanner.subtitle}</p> : null}
          <div className="mt-9 flex flex-wrap gap-3">
            {cmsBanner.link_url && (content?.primary_label_fa || content?.primary_label_en) ? <Link to={cmsBanner.link_url} className="tabarestan-button-primary">{isEn ? content.primary_label_en || content.primary_label_fa : content.primary_label_fa || content.primary_label_en}<span aria-hidden="true">←</span></Link> : null}
            {content?.secondary_label_fa || content?.secondary_label_en ? <Link to="/leagues" className="tabarestan-button-secondary">{isEn ? content.secondary_label_en || content.secondary_label_fa : content.secondary_label_fa || content.secondary_label_en}</Link> : null}
          </div>
          {(isEn ? content?.stats_en : content?.stats_fa)?.length ? <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/15 pt-6 text-sm text-slate-300">{(isEn ? content?.stats_en : content?.stats_fa)?.map((stat) => <span key={`${stat.value}-${stat.label}`} className="inline-flex items-baseline gap-2 whitespace-nowrap"><strong className="text-white">{stat.value}</strong><span>{stat.label}</span></span>)}</div> : null}
        </motion.div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-rc-bg to-transparent" />
    </section>
  )
}
