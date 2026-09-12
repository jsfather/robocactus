import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPublishedPosts } from '@/features/content/api'
import { ArticleCard } from '@/components/content/ArticleCard'
import { formatAppDate } from '@/lib/dates'
import type { BlogPost } from '@/types/database'

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" className="size-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}

function BookIcon() {
  return <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z" /><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20M9 6h7M9 10h5" /></svg>
}

function HeroFeature({ post, isEn }: { post: BlogPost; isEn: boolean }) {
  const category = isEn ? post.category?.name_en : post.category?.name_fa
  return <Link to={`/blog/${post.slug}`} className="group relative block min-h-[22rem] overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950/30 shadow-2xl shadow-slate-950/20 transition duration-300 hover:-translate-y-1 hover:border-white/30">
    {post.cover_image ? <img src={post.cover_image} alt={post.cover_alt || post.title} loading="eager" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#38bdf855,transparent_35%),linear-gradient(145deg,#0a4664,#0b7b68)]" />}
    <div className="absolute inset-0 bg-gradient-to-t from-[#031d2d] via-[#031d2d]/55 to-transparent" />
    <div className="relative flex min-h-[22rem] flex-col justify-end p-6 text-white sm:p-8"><div className="flex flex-wrap items-center gap-2 text-xs font-black"><span className="rounded-full bg-emerald-300 px-3 py-1.5 text-emerald-950">{isEn ? 'Featured story' : 'مطلب منتخب'}</span>{category ? <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 backdrop-blur">{category}</span> : null}</div><h2 className="mt-4 max-w-xl text-2xl font-black leading-[1.45] sm:text-3xl">{post.title}</h2>{post.excerpt ? <p className="mt-3 max-w-xl line-clamp-2 text-sm leading-7 text-white/80">{post.excerpt}</p> : null}<div className="mt-5 flex flex-wrap items-center gap-4 text-xs font-bold text-white/75"><span>{post.published_at ? formatAppDate(post.published_at, isEn ? 'en' : 'fa') : ''}</span><span className="inline-flex items-center gap-2 text-emerald-200">{isEn ? 'Read the story' : 'مشاهده مطلب'} <ArrowIcon /></span></div></div>
  </Link>
}

function LoadingCard() {
  return <div className="overflow-hidden rounded-[1.75rem] border border-slate-100 bg-white shadow-sm"><div className="aspect-[16/10] animate-pulse bg-slate-100" /><div className="space-y-3 p-5"><div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" /><div className="h-5 w-4/5 animate-pulse rounded bg-slate-100" /><div className="h-3 w-full animate-pulse rounded bg-slate-100" /><div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" /></div></div>
}

export function BlogListPage() {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [category, setCategory] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void fetchPublishedPosts().then((data) => { if (active) setPosts(data) }).catch((err: Error) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const categories = useMemo(() => Array.from(new Map(posts.filter((p) => p.category).map((p) => [p.category!.id, p.category!])).values()), [posts])
  const visible = useMemo(() => category === 'all' ? posts : posts.filter((post) => post.category_id === category), [category, posts])
  const featured = visible[0]
  const rest = visible.slice(1)
  const labels = isEn ? {
    kicker: 'TABARESTAN EDITORIAL', title: 'Stories, updates\nand the people behind every league.', description: 'Follow official news, competition insights and practical guidance from the Tabarestan Cup team.', explore: 'Explore active leagues', latest: 'Latest stories', latestDescription: 'Clear, useful updates for teams, participants and the wider robotics community.', all: 'All stories', count: 'published stories', empty: t('content.blogEmpty'),
  } : {
    kicker: 'تحریریه جام تبرستان', title: 'داستان‌ها، خبرها\nو آدم‌های پشت هر لیگ.', description: 'خبرهای رسمی، نگاه‌های تخصصی و راهنمای کاربردی تیم جام تبرستان را یک‌جا دنبال کنید.', explore: 'مشاهده لیگ‌های فعال', latest: 'تازه‌ترین مطالب', latestDescription: 'اطلاعات روشن و کاربردی برای تیم‌ها، شرکت‌کنندگان و جامعه رباتیک.', all: 'همه مطالب', count: 'مطلب منتشرشده', empty: t('content.blogEmpty'),
  }

  return <main className="min-h-screen overflow-hidden bg-[#f6fafb] pb-20">
    <section className="relative overflow-hidden bg-[#062f46] text-white">
      <div className="pointer-events-none absolute -end-28 -top-36 size-[30rem] rounded-full border-[72px] border-cyan-300/10" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-52 -start-24 size-[28rem] rounded-full bg-emerald-400/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-20 sm:px-8 sm:pb-20 sm:pt-28 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:gap-16">
        <div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/25 bg-white/10 px-3 py-1.5 text-xs font-black tracking-[0.14em] text-emerald-200"><BookIcon />{labels.kicker}</div><h1 className="mt-6 whitespace-pre-line text-4xl font-black leading-[1.25] tracking-tight sm:text-6xl">{labels.title}</h1><p className="mt-6 max-w-xl text-base leading-8 text-sky-50/80 sm:text-lg">{labels.description}</p><div className="mt-8 flex flex-wrap items-center gap-3"><Link to="/leagues" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-emerald-950 shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-emerald-200">{labels.explore}<ArrowIcon /></Link>{loading ? <span className="inline-flex min-h-12 items-center rounded-2xl border border-white/15 bg-white/5 px-8 py-3"><span className="h-3 w-28 animate-pulse rounded bg-white/20" /></span> : <span className="inline-flex min-h-12 items-center rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white/75">{posts.length.toLocaleString(isEn ? 'en-US' : 'fa-IR')} {labels.count}</span>}</div></div>
        <div className="relative lg:pt-4">{loading ? <div className="min-h-[22rem] animate-pulse rounded-[2rem] border border-white/15 bg-white/10" /> : featured ? <HeroFeature post={featured} isEn={isEn} /> : <div className="grid min-h-[22rem] place-items-center rounded-[2rem] border border-white/15 bg-white/5 p-8 text-center text-white/70"><div><BookIcon /><p className="mt-4 text-sm leading-7">{labels.empty}</p></div></div>}</div>
      </div>
    </section>

    <div className="relative z-10 mx-auto -mt-7 max-w-7xl px-4 sm:px-8"><div className="flex flex-col gap-4 rounded-[1.5rem] border border-slate-100 bg-white p-3 shadow-[0_18px_55px_rgb(7_59_85/0.1)] sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 sm:pb-0"><button type="button" onClick={() => setCategory('all')} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-black transition ${category === 'all' ? 'bg-[#063d59] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>{labels.all}</button>{categories.map((item) => <button type="button" key={item.id} onClick={() => setCategory(item.id)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-black transition ${category === item.id ? 'bg-[#063d59] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>{isEn ? item.name_en : item.name_fa}</button>)}</div><span className="hidden shrink-0 items-center gap-2 px-3 text-xs font-bold text-slate-400 sm:inline-flex"><span className="size-2 rounded-full bg-emerald-500" />{visible.length.toLocaleString(isEn ? 'en-US' : 'fa-IR')} {labels.count}</span></div></div>

    <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-8 sm:pt-20"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black tracking-[0.16em] text-emerald-700">{labels.kicker}</p><h2 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">{labels.latest}</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">{labels.latestDescription}</p></div>{visible.length ? <span className="hidden rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-800 sm:inline-flex">{visible.length.toLocaleString(isEn ? 'en-US' : 'fa-IR')} {labels.count}</span> : null}</div>
      {loading ? <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"><LoadingCard /><LoadingCard /><LoadingCard /></div> : null}
      {error ? <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700">{error}</div> : null}
      {!loading && !error && !visible.length ? <div className="mt-8 rounded-[2rem] border border-dashed border-sky-200 bg-white p-14 text-center text-slate-600 shadow-sm"><BookIcon /><p className="mt-4 text-sm leading-7">{labels.empty}</p></div> : null}
      {!loading && !error && featured ? <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{rest.map((post) => <ArticleCard key={post.id} to={`/blog/${post.slug}`} title={post.title} excerpt={post.excerpt} image={post.cover_image} imageAlt={post.cover_alt} publishedAt={post.published_at} category={isEn ? post.category?.name_en : post.category?.name_fa} />)}</div> : null}
    </section>
  </main>
}
