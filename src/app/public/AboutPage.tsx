import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { fetchStaticPage } from '@/features/leagues/adminApi'
import { sanitizeHtml } from '@/lib/sanitize'
import { usePageSeo } from '@/components/seo/SeoManager'
import type { StaticPage } from '@/types/database'

const copy = {
  fa: {
    eyebrow: 'جام تبرستان · آمل، مازندران', title: 'مسابقه‌ای برای ساختن آینده، نه فقط انتخاب یک برنده',
    lead: 'جام تبرستان بستری حرفه‌ای برای رقابت، یادگیری و دیده‌شدن استعدادهایی است که در مرز رباتیک، مکاترونیک و هوش مصنوعی مسئله حل می‌کنند.',
    intro: 'ما مسابقات را یک تجربه آموزشی و صنعتی یکپارچه می‌دانیم؛ جایی که تیم‌ها ایده خود را به سامانه‌ای واقعی تبدیل می‌کنند، زیر فشار مسابقه تصمیم می‌گیرند و با داوری شفاف بازخورد می‌گیرند. مسیر فعالیت ما از مازندران آغاز شده، اما نگاه آن ملی و بین‌المللی است.',
    mission: ['ماموریت ما', 'طراحی و برگزاری رقابت‌های استانداردی که دانش فنی را به تجربه عملی، همکاری تیمی و فرصت رشد حرفه‌ای تبدیل کند.'],
    vision: ['چشم‌انداز ما', 'تبدیل‌شدن به یکی از مراجع معتبر مسابقات فناوری در منطقه؛ پلی میان استعدادهای جوان، دانشگاه، صنعت و جامعه جهانی نوآوری.'],
    scope: 'از رقابت محلی تا حضور جهانی', scopeBody: 'ساختار لیگ‌ها برای رده‌های سنی و سطوح مهارتی مختلف طراحی می‌شود. هدف، ایجاد یک مسیر پایدار از نخستین تجربه رقابت تا تیم‌های دانشگاهی و حرفه‌ای است.',
    fields: [['رباتیک', 'طراحی، کنترل و ارزیابی سامانه‌های رباتیکی در سناریوهای واقعی مسابقه.'], ['مکاترونیک', 'پیوند مکانیک، الکترونیک، کنترل و ساخت برای رسیدن به عملکرد قابل اتکا.'], ['هوش مصنوعی', 'ادراک، تصمیم‌گیری و راهبردهای هوشمند برای حل مسئله در محیط پویا.'], ['مسابقات حرفه‌ای', 'قوانین روشن، داوری تخصصی، نتایج قابل پیگیری و تجربه منظم برای تیم‌ها.']],
    cta: 'لیگ‌های جام تبرستان را ببینید', guide: 'راهنمای ثبت‌نام', activity: 'حوزه‌های فعالیت', values: 'ماموریت و چشم‌انداز', national: 'گستره ملی و بین‌المللی',
  },
  en: {
    eyebrow: 'Tabarestan Cup · Amol, Mazandaran', title: 'A competition designed to build the future—not merely choose a winner',
    lead: 'Tabarestan Cup is a professional arena where emerging talent competes, learns and earns recognition across robotics, mechatronics and artificial intelligence.',
    intro: 'We see competition as a complete learning and engineering experience. Teams turn ideas into working systems, make decisions under real constraints and receive structured feedback from specialist judges. Our roots are in Mazandaran, while our ambition and standards reach across Iran and into the international technology community.',
    mission: ['Our mission', 'To create rigorous competitions that turn technical knowledge into practical capability, teamwork and meaningful professional opportunity.'],
    vision: ['Our vision', 'To become a trusted regional platform for technology competitions, connecting young talent with universities, industry and the global innovation ecosystem.'],
    scope: 'From local opportunity to global readiness', scopeBody: 'Our leagues serve different age groups and levels of experience, creating a sustainable progression from a first competition to university and professional teams.',
    fields: [['Robotics', 'Designing, controlling and evaluating robotic systems through authentic competition scenarios.'], ['Mechatronics', 'Bringing mechanics, electronics, control and fabrication together in reliable systems.'], ['Artificial intelligence', 'Applying perception, decision-making and intelligent strategy in dynamic environments.'], ['Professional competition', 'Clear rules, specialist judging, traceable results and an organized team experience.']],
    cta: 'Explore Tabarestan Cup leagues', guide: 'Registration guide', activity: 'What we work on', values: 'Mission and vision', national: 'National and international reach',
  },
}

export function AboutPage() {
  const { i18n } = useTranslation(); const en = i18n.language.startsWith('en'); const c = en ? copy.en : copy.fa
  const [page, setPage] = useState<StaticPage | null>(null)
  useEffect(() => { void fetchStaticPage('about').then(setPage).catch(() => undefined) }, [])
  const cmsBody = (en ? page?.body_en : page?.body) || ''
  const cover = page?.cover_image || page?.og_image
  usePageSeo({ title: (en ? page?.title_en : page?.title) || c.title, description: c.lead, image: cover || undefined })
  return <div className="pb-20"><section className="relative min-h-[72vh] overflow-hidden bg-[#052f46] text-white">{cover ? <img src={cover} alt="" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,#0ea5a055,transparent_35%),linear-gradient(135deg,#052f46,#087eb8_55%,#087a58)]" />}<div className="absolute inset-0 bg-gradient-to-l from-[#042c42]/95 via-[#053c56]/80 to-[#042c42]/45" /><div className="relative mx-auto flex min-h-[72vh] max-w-7xl items-end px-4 pb-20 pt-36 sm:px-8"><motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl"><p className="text-xs font-black tracking-[.2em] text-cyan-200">{c.eyebrow}</p><h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl lg:text-7xl">{c.title}</h1><p className="mt-6 max-w-3xl text-base leading-8 text-white/78 sm:text-lg">{c.lead}</p></motion.div></div></section><main className="mx-auto max-w-7xl space-y-20 px-4 py-20 sm:px-8"><section className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start"><div><p className="text-xs font-black tracking-[.2em] text-sky-600">ABOUT TABARESTAN CUP</p><h2 className="mt-3 text-3xl font-black text-slate-900 sm:text-5xl">{c.national}</h2></div><div className="text-base leading-9 text-slate-600">{cmsBody ? <div className="space-y-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(cmsBody) }} /> : <p>{c.intro}</p>}</div></section><section><p className="text-xs font-black tracking-[.2em] text-sky-600">{c.values}</p><div className="mt-6 grid gap-5 md:grid-cols-2">{[c.mission, c.vision].map(([title, body], index) => <article key={title} className={`rounded-[2rem] p-7 text-white shadow-xl ${index ? 'bg-gradient-to-br from-[#087a58] to-[#0a9d77]' : 'bg-gradient-to-br from-[#063d59] to-[#087eb8]'}`}><span className="grid size-12 place-items-center rounded-2xl bg-white/15 text-lg font-black">0{index + 1}</span><h3 className="mt-6 text-2xl font-black">{title}</h3><p className="mt-3 leading-8 text-white/75">{body}</p></article>)}</div></section><section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black tracking-[.2em] text-emerald-600">TECHNOLOGY & COMPETITION</p><h2 className="mt-3 text-3xl font-black text-slate-900">{c.activity}</h2></div></div><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{c.fields.map(([title, body], index) => <article key={title} className="group rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-[0_14px_40px_rgb(7_59_85/0.07)] transition hover:-translate-y-1 hover:border-sky-200"><span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-sky-50 to-emerald-50 font-black text-sky-700">{String(index + 1).padStart(2, '0')}</span><h3 className="mt-5 text-lg font-black text-slate-900">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-500">{body}</p></article>)}</div></section><section className="overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#063d59] via-[#087eb8] to-[#087a58] p-7 text-white sm:p-10"><div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="text-2xl font-black sm:text-4xl">{c.scope}</h2><p className="mt-4 max-w-3xl leading-8 text-white/75">{c.scopeBody}</p></div><div className="flex flex-col gap-3"><Link to="/leagues" className="rounded-2xl bg-white px-6 py-3 text-center text-sm font-black text-sky-800">{c.cta}</Link><Link to="/registration-guide" className="rounded-2xl border border-white/25 bg-white/10 px-6 py-3 text-center text-sm font-black">{c.guide}</Link></div></div></section></main></div>
}
