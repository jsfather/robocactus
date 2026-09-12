import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePageSeo } from '@/components/seo/SeoManager'
import { fetchPersonProfile, type PublicPersonProfile } from '@/features/leagues/peopleApi'
import { contentLocale, localizeLeague, localizePerson } from '@/features/leagues/localize'
import { safeExternalUrl } from '@/lib/safe-url'
import { sanitizeHtml } from '@/lib/sanitize'

function Lines({ value }: { value?: string | null }) {
  const lines = (value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return null
  return <ul className="grid gap-2">{lines.map((line, index) => <li key={`${line}-${index}`} className="flex gap-3 text-sm leading-7 text-slate-700"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" /><span>{line}</span></li>)}</ul>
}

function RoleIcon({ role }: { role: string }) {
  return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{role === 'judge' ? <><path d="M7 4h10l-1 5a4 4 0 0 1-8 0L7 4Z" /><path d="M12 13v6M8 20h8" /></> : <><path d="M12 3 4 7v5c0 4.5 3.4 7.5 8 9 4.6-1.5 8-4.5 8-9V7l-8-4Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>}</svg>
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
}

function SpecialtyIcon() {
  return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 4 7l8 4 8-4-8-4Z" /><path d="m7 10 1 7c2.5 1.5 5.5 1.5 8 0l1-7" /></svg>
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
    setError(null)
    void fetchPersonProfile(slug)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug])

  const person = useMemo(() => data ? localizePerson(data.person, locale) : null, [data, locale])
  const league = useMemo(() => data ? localizeLeague(data.league, locale) : null, [data, locale])
  const labels = locale === 'en' ? {
    back: 'Back to league', judge: 'Judge', committee: 'Technical committee', identity: 'Identity & background', education: 'Education', honors: 'Honors', awards: 'Awards', courses: 'Courses & certificates', company: 'Companies & professional activity', contact: 'Contact', born: 'Date of birth', nationality: 'Nationality', city: 'City', notFound: 'Profile not found.', league: 'Competition league', website: 'Website', linkedin: 'LinkedIn', experience: 'Years of experience', founder: 'Platform founder', histories: 'Competition history', judgingHistory: 'Judging record', committeeHistory: 'Technical committee record',
  } : {
    back: 'بازگشت به صفحه لیگ', judge: 'داور', committee: 'عضو کمیته فنی', identity: 'اطلاعات هویتی و معرفی', education: 'سوابق تحصیلی', honors: 'افتخارات', awards: 'جوایز', courses: 'دوره‌ها و گواهی‌نامه‌ها', company: 'شرکت‌ها و فعالیت حرفه‌ای', contact: 'راه‌های ارتباطی', born: 'تاریخ تولد', nationality: 'ملیت', city: 'شهر', notFound: 'صفحه رزومه یافت نشد.', league: 'لیگ مسابقاتی', website: 'وب‌سایت', linkedin: 'لینکدین', experience: 'سال سابقه', founder: 'بنیان‌گذار پلتفرم', histories: 'سوابق حضور در مسابقات', judgingHistory: 'سوابق داوری', committeeHistory: 'سوابق کمیته فنی',
  }

  usePageSeo({ title: person?.full_name, description: person?.bio ?? undefined, image: person?.photo_url ?? undefined })

  if (loading) return <div className="min-h-[60vh] px-4 pt-40 text-center text-rc-muted">…</div>
  if (!person || !league || error) return <div className="mx-auto min-h-[60vh] max-w-3xl px-4 pt-40"><p className="text-red-500">{error || labels.notFound}</p><Link to="/leagues" className="mt-4 inline-block text-rc-blue">{labels.back}</Link></div>

  const profile = data!.person
  const profileLeagues = data!.leagues
  const founderBadgeUrl = safeExternalUrl(person.founder_badge_url)
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
        <div className="absolute -end-20 -top-20 size-72 rounded-full border-[48px] border-white/10" aria-hidden="true" />
        <div className="relative flex flex-col gap-7 sm:flex-row sm:items-center">
          <div className="size-36 shrink-0 overflow-hidden rounded-[2rem] border-4 border-white/30 bg-slate-950/20 shadow-2xl sm:size-44">{person.photo_url ? <img src={person.photo_url} alt={person.full_name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl font-black">ID</div>}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-[#062f46] px-3.5 py-2 text-xs font-black text-white shadow-lg shadow-slate-950/20"> <RoleIcon role={person.role_kind} />{person.role_kind === 'judge' ? labels.judge : labels.committee}</span>
              {person.is_founder ? <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-100/70 bg-amber-300 px-3.5 py-2 text-xs font-black text-amber-950 shadow-lg shadow-amber-950/15">{founderBadgeUrl ? <span className="grid h-7 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-950/15 p-1"><img src={founderBadgeUrl} alt="" className="size-full object-contain" /></span> : <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true"><path d="m12 3 2.2 5.1 5.5.5-4.2 3.6 1.3 5.3-4.8-2.8-4.8 2.8 1.3-5.3-4.2-3.6 5.5-.5L12 3Z" /></svg>}{labels.founder}</span> : null}
            </div>
            <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{person.full_name}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {person.specialty ? <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-100/80 bg-cyan-100 px-3.5 py-2 text-sm font-black text-cyan-950 shadow-lg shadow-slate-950/10"><SpecialtyIcon />{person.specialty}</span> : null}
              {person.experience_years != null ? <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-100/80 bg-emerald-300 px-3.5 py-2 text-sm font-black text-emerald-950 shadow-lg shadow-emerald-950/15"><ClockIcon />{person.experience_years.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')} {labels.experience}</span> : null}
            </div>
          </div>
        </div>
      </section>

      {profileLeagues.length > 0 ? <section className="mt-8 rounded-[2rem] border border-sky-100 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black tracking-[.16em] text-rc-blue">{labels.histories}</p><h2 className="mt-2 flex items-center gap-3 text-2xl font-black text-slate-900"><span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-rc-blue"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 19V5h16v14M8 9h8M8 13h5" /></svg></span>{person.role_kind === 'judge' ? labels.judgingHistory : labels.committeeHistory}</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">{profileLeagues.length.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{profileLeagues.map((item) => { const localized = localizeLeague(item, locale); return <Link key={item.id} to={`/leagues/${item.slug}`} className="group flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50"><span className="min-w-0"><strong className="block truncate text-sm font-black text-slate-800 group-hover:text-rc-blue">{localized.name}</strong><small className="mt-1 block text-xs text-slate-500">{localized.category || labels.league}</small></span><svg viewBox="0 0 24 24" className="size-5 shrink-0 text-slate-400 transition group-hover:text-rc-blue" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></Link> })}</div></section> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.5fr]">
        <aside className="space-y-6"><section className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black text-slate-800">{labels.identity}</h2>{person.bio ? <div className="resume-content mt-4 text-sm leading-8 text-rc-muted [&_a]:font-bold [&_a]:text-sky-700 [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-black [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-black [&_li]:ms-5 [&_li]:list-disc [&_ol]:ms-5 [&_ol]:list-decimal [&_p]:my-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(person.bio) }} /> : null}<Lines value={localizedValue(profile.identity_summary_fa, profile.identity_summary_en)} /><dl className="mt-5 grid gap-3 text-sm">{profile.birth_date ? <div className="flex justify-between gap-4 border-t border-sky-50 pt-3"><dt className="text-rc-muted">{labels.born}</dt><dd dir="ltr">{profile.birth_date}</dd></div> : null}{localizedValue(profile.nationality_fa, profile.nationality_en) ? <div className="flex justify-between gap-4 border-t border-sky-50 pt-3"><dt className="text-rc-muted">{labels.nationality}</dt><dd>{localizedValue(profile.nationality_fa, profile.nationality_en)}</dd></div> : null}{localizedValue(profile.city_fa, profile.city_en) ? <div className="flex justify-between gap-4 border-t border-sky-50 pt-3"><dt className="text-rc-muted">{labels.city}</dt><dd>{localizedValue(profile.city_fa, profile.city_en)}</dd></div> : null}</dl></section>
          {(profile.email || profile.phone || safeExternalUrl(profile.website_url) || safeExternalUrl(profile.linkedin_url)) ? <section className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black text-slate-800">{labels.contact}</h2><div className="mt-4 grid gap-3 text-sm">{profile.email ? <a href={`mailto:${profile.email}`} className="break-all text-rc-blue">{profile.email}</a> : null}{profile.phone ? <a href={`tel:${profile.phone}`} className="text-rc-blue" dir="ltr">{profile.phone}</a> : null}{safeExternalUrl(profile.website_url) ? <a href={safeExternalUrl(profile.website_url)!} target="_blank" rel="noreferrer" className="text-rc-blue">{labels.website}</a> : null}{safeExternalUrl(profile.linkedin_url) ? <a href={safeExternalUrl(profile.linkedin_url)!} target="_blank" rel="noreferrer" className="text-rc-blue">{labels.linkedin}</a> : null}</div></section> : null}
        </aside>
        <main className="space-y-5">{sections.map((section) => <section key={section.key} className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-rc-blue"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg></span><h2 className="text-xl font-black text-slate-800 sm:text-2xl">{section.title}</h2></div><div className="mt-5"><Lines value={section.value} /></div></section>)}</main>
      </div>
    </div>
  </div>
}
