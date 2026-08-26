import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePageSeo } from '@/components/seo/SeoManager'
import { fetchPersonProfile, type PublicPersonProfile } from '@/features/leagues/peopleApi'
import { contentLocale, localizeLeague, localizePerson } from '@/features/leagues/localize'

function Lines({ value }: { value?: string | null }) {
  const lines = (value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return null
  return <ul className="grid gap-2">{lines.map((line, index) => <li key={`${line}-${index}`} className="flex gap-3 text-sm leading-7 text-rc-muted"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" /><span>{line}</span></li>)}</ul>
}

export function PersonProfilePage() {
  const { slug = '' } = useParams()
  const { i18n } = useTranslation()
  const locale = contentLocale(i18n.language)
  const [data, setData] = useState<PublicPersonProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    void fetchPersonProfile(slug)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug])

  const person = useMemo(() => data ? localizePerson(data.person, locale) : null, [data, locale])
  const league = useMemo(() => data ? localizeLeague(data.league, locale) : null, [data, locale])
  const labels = locale === 'en' ? {
    back: 'Back to league', judge: 'Judge', committee: 'Technical committee', identity: 'Identity & background', education: 'Education', honors: 'Honors', awards: 'Awards', courses: 'Courses & certificates', company: 'Companies & professional activity', contact: 'Contact', born: 'Date of birth', nationality: 'Nationality', city: 'City', notFound: 'Profile not found.', league: 'Competition league', website: 'Website', linkedin: 'LinkedIn',
  } : {
    back: 'بازگشت به صفحه لیگ', judge: 'داور', committee: 'عضو کمیته فنی', identity: 'اطلاعات هویتی و معرفی', education: 'سوابق تحصیلی', honors: 'افتخارات', awards: 'جوایز', courses: 'دوره‌ها و گواهی‌نامه‌ها', company: 'شرکت‌ها و فعالیت حرفه‌ای', contact: 'راه‌های ارتباطی', born: 'تاریخ تولد', nationality: 'ملیت', city: 'شهر', notFound: 'صفحه رزومه یافت نشد.', league: 'لیگ مسابقاتی', website: 'وب‌سایت', linkedin: 'لینکدین',
  }

  usePageSeo({ title: person?.full_name, description: person?.bio ?? undefined, image: person?.photo_url ?? undefined })

  if (loading) return <div className="min-h-[60vh] px-4 pt-40 text-center text-rc-muted">…</div>
  if (!person || !league || error) return <div className="mx-auto min-h-[60vh] max-w-3xl px-4 pt-40"><p className="text-red-500">{error || labels.notFound}</p><Link to="/leagues" className="mt-4 inline-block text-rc-blue">{labels.back}</Link></div>

  const profile = data!.person
  const localizedValue = (fa?: string | null, en?: string | null) => locale === 'en' ? en || fa : fa || en
  const sections = [
    { key: 'education', title: labels.education, value: localizedValue(profile.education_fa, profile.education_en) },
    { key: 'honors', title: labels.honors, value: localizedValue(profile.honors_fa, profile.honors_en) },
    { key: 'awards', title: labels.awards, value: localizedValue(profile.awards_fa, profile.awards_en) },
    { key: 'courses', title: labels.courses, value: localizedValue(profile.courses_fa, profile.courses_en) },
    { key: 'company', title: labels.company, value: localizedValue(profile.company_info_fa, profile.company_info_en) },
  ].filter((section) => section.value)

  return <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50/40 pb-24 pt-32">
    <div className="mx-auto max-w-6xl px-4 sm:px-8">
      <Link to={`/leagues/${league.slug}`} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-rc-blue hover:underline">← {labels.back}</Link>
      <section className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#087eb8] via-[#087ca0] to-[#0b9c70] p-6 text-white shadow-[0_30px_90px_rgb(8_90_110/0.22)] sm:p-10">
        <div className="absolute -end-20 -top-20 size-72 rounded-full border-[48px] border-white/10" />
        <div className="relative flex flex-col gap-7 sm:flex-row sm:items-center">
          <div className="size-36 shrink-0 overflow-hidden rounded-[2rem] border-4 border-white/25 bg-white/10 shadow-2xl sm:size-44">{person.photo_url ? <img src={person.photo_url} alt={person.full_name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl font-black">ID</div>}</div>
          <div className="min-w-0"><span className="inline-flex rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold backdrop-blur">{person.role_kind === 'judge' ? labels.judge : labels.committee}</span><h1 className="mt-4 text-3xl font-black sm:text-5xl">{person.full_name}</h1>{person.specialty ? <p className="mt-3 text-lg font-bold text-emerald-100">{person.specialty}</p> : null}<Link to={`/leagues/${league.slug}`} className="mt-5 inline-flex rounded-xl bg-white/15 px-4 py-2 text-sm backdrop-blur hover:bg-white/25">{labels.league}: {league.name}</Link></div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.5fr]">
        <aside className="space-y-6"><section className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black text-slate-800">{labels.identity}</h2>{person.bio ? <p className="mt-4 text-sm leading-8 text-rc-muted">{person.bio}</p> : null}<Lines value={localizedValue(profile.identity_summary_fa, profile.identity_summary_en)} /><dl className="mt-5 grid gap-3 text-sm">{profile.birth_date ? <div className="flex justify-between gap-4 border-t border-sky-50 pt-3"><dt className="text-rc-muted">{labels.born}</dt><dd dir="ltr">{profile.birth_date}</dd></div> : null}{localizedValue(profile.nationality_fa, profile.nationality_en) ? <div className="flex justify-between gap-4 border-t border-sky-50 pt-3"><dt className="text-rc-muted">{labels.nationality}</dt><dd>{localizedValue(profile.nationality_fa, profile.nationality_en)}</dd></div> : null}{localizedValue(profile.city_fa, profile.city_en) ? <div className="flex justify-between gap-4 border-t border-sky-50 pt-3"><dt className="text-rc-muted">{labels.city}</dt><dd>{localizedValue(profile.city_fa, profile.city_en)}</dd></div> : null}</dl></section>
          {(profile.email || profile.phone || profile.website_url || profile.linkedin_url) ? <section className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black text-slate-800">{labels.contact}</h2><div className="mt-4 grid gap-3 text-sm">{profile.email ? <a href={`mailto:${profile.email}`} className="break-all text-rc-blue">{profile.email}</a> : null}{profile.phone ? <a href={`tel:${profile.phone}`} className="text-rc-blue" dir="ltr">{profile.phone}</a> : null}{profile.website_url ? <a href={profile.website_url} target="_blank" rel="noreferrer" className="text-rc-blue">{labels.website}</a> : null}{profile.linkedin_url ? <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="text-rc-blue">{labels.linkedin}</a> : null}</div></section> : null}
        </aside>
        <main className="space-y-5">{sections.map((section, index) => <section key={section.key} className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-xs font-black text-rc-blue">{String(index + 1).padStart(2, '0')}</span><h2 className="text-xl font-black text-slate-800 sm:text-2xl">{section.title}</h2></div><div className="mt-5"><Lines value={section.value} /></div></section>)}</main>
      </div>
    </div>
  </div>
}

