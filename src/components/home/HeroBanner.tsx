import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import type { HomeBanner } from '@/types/database'

export function HeroBanner({ banners }: { banners: HomeBanner[] }) {
  const reduceMotion = useReducedMotion()
  const cmsBanner = banners[0]

  return (
    <section className="relative min-h-[min(94dvh,880px)] overflow-hidden bg-[#061624]">
      <img
        src="/images/tabarestan-hero.png"
        alt="چشم‌انداز جنگل‌های هیرکانی و دماوند در هویت روبوکاپ تبرستان"
        className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,17,31,.98)_0%,rgba(4,17,31,.78)_42%,rgba(4,17,31,.16)_72%),linear-gradient(0deg,#061624_0%,transparent_35%)] rtl:bg-[linear-gradient(270deg,rgba(4,17,31,.98)_0%,rgba(4,17,31,.76)_43%,rgba(4,17,31,.12)_75%),linear-gradient(0deg,#061624_0%,transparent_35%)]" />
      <div className="absolute inset-0 tabarestan-pattern opacity-30" />

      <div className="relative mx-auto flex min-h-[min(94dvh,880px)] max-w-7xl items-center px-5 pb-20 pt-32 sm:px-8 lg:px-10">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-rc-accent/30 bg-rc-accent/10 px-4 py-2 text-xs font-medium text-emerald-200 backdrop-blur-md">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-rc-accent opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-rc-accent" /></span>
            از قلب مازندران، رو به آینده
          </div>
          <p className="mb-3 font-mono text-xs tracking-[0.28em] text-sky-300 uppercase sm:text-sm">ROBOCUP TABARESTAN · AMOL</p>
          <h1 className="text-5xl font-black leading-[1.12] text-white sm:text-6xl lg:text-8xl">
            روبوکاپ تبرستان
            <span className="mt-2 block text-2xl font-bold text-emerald-300 sm:text-3xl">برگزارکننده مسابقات ملی و بین‌المللی</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">مرجع برگزاری رقابت‌های حرفه‌ای رباتیک در سطح کشور و عرصه بین‌المللی؛ از آمل و مازندران، میزبان تیم‌ها و قهرمانان ایران و جهان.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to={cmsBanner?.link_url || '/signup'} className="tabarestan-button-primary">ثبت‌نام در مسابقات <span aria-hidden="true">←</span></Link>
            <Link to="/leagues" className="tabarestan-button-secondary">مشاهده لیگ‌ها</Link>
          </div>
          <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/15 pt-6 text-sm text-slate-300">
            <span><strong className="me-2 text-white">آمل</strong> شهر علم و طبیعت</span>
            <span><strong className="me-2 text-white">مازندران</strong> میزبان نوآوری</span>
            <span><strong className="me-2 text-rc-accent">۱۴۰۵</strong> فصل تازه رقابت</span>
          </div>
        </motion.div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-rc-bg to-transparent" />
    </section>
  )
}
