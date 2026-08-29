import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatAppDate } from '@/lib/dates'

type Props = { to: string; title: string; excerpt?: string | null; image?: string | null; imageAlt?: string | null; publishedAt?: string | null; category?: string | null; kind?: 'article' | 'announcement'; featured?: boolean }
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length

export function ArticleCard({ to, title, excerpt, image, imageAlt, publishedAt, category, kind = 'article', featured }: Props) {
  const { i18n } = useTranslation(); const isEn = i18n.language.startsWith('en'); const minutes = Math.max(1, Math.ceil(words(excerpt || title) / 180))
  return <Link to={to} className={`group flex h-full overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white shadow-[0_16px_48px_rgb(18_76_98/0.08)] transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_24px_60px_rgb(18_76_98/0.14)] ${featured ? 'flex-col sm:grid sm:grid-cols-[1.15fr_1fr]' : 'flex-col'}`}>
    <div className={`relative overflow-hidden bg-gradient-to-br from-sky-100 to-emerald-100 ${featured ? 'min-h-64' : 'aspect-[16/10]'}`}>{image ? <img src={image} alt={imageAlt || title} loading="lazy" className="size-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="grid size-full place-items-center text-sm font-black text-sky-700">{isEn ? 'TABARESTAN NEWS' : 'خبرهای جام تبرستان'}</div>}<span className="absolute start-4 top-4 rounded-full bg-slate-950/80 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur">{kind === 'announcement' ? (isEn ? 'Announcement' : 'اطلاعیه') : (category || (isEn ? 'Article' : 'مطلب'))}</span></div>
    <div className="flex flex-1 flex-col p-5 sm:p-6"><div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-500">{publishedAt ? <time>{formatAppDate(publishedAt, i18n.language)}</time> : null}<span>{minutes.toLocaleString(isEn ? 'en-US' : 'fa-IR')} {isEn ? 'min read' : 'دقیقه مطالعه'}</span></div><h2 className={`${featured ? 'mt-4 text-2xl' : 'mt-3 text-lg'} line-clamp-2 font-black leading-8 text-slate-900 transition group-hover:text-sky-700`}>{title}</h2>{excerpt ? <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">{excerpt}</p> : null}<span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-black text-sky-700">{isEn ? 'Read more' : 'مطالعه مطلب'} <span className="transition group-hover:-translate-x-1" aria-hidden="true">←</span></span></div>
  </Link>
}
