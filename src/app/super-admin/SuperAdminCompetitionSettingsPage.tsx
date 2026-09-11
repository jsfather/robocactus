import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import { ImageUploadField } from '@/components/ui/ImageUploadField'
import { PanelPage } from '@/components/layout/PanelShell'
import {
  deleteCompetitionPerson,
  deleteCompetitionSponsor,
  fetchCompetitionSettings,
  setCompetitionPersonLeagues,
  setCompetitionSponsorLeagues,
  setLeagueJudgingEnabled,
  upsertCompetitionPerson,
  upsertCompetitionSponsor,
  type CompetitionPersonInput,
  type CompetitionSponsorInput,
} from '@/features/competitions/settingsApi'
import type { CompetitionPerson, CompetitionSponsor, League } from '@/types/database'

type SettingsData = Awaited<ReturnType<typeof fetchCompetitionSettings>>
type Tab = 'people' | 'sponsors'

const emptyPerson = (): CompetitionPersonInput => ({
  slug: '', full_name: '', full_name_en: '', photo_url: null, specialty: '', specialty_en: '',
  bio: '', bio_en: '', identity_summary_fa: '', identity_summary_en: '', education_fa: '', education_en: '',
  honors_fa: '', honors_en: '', awards_fa: '', awards_en: '', courses_fa: '', courses_en: '',
  company_info_fa: '', company_info_en: '', birth_date: null, nationality_fa: '', nationality_en: '',
  city_fa: '', city_en: '', email: '', phone: '', website_url: '', linkedin_url: '',
  is_profile_published: true, role_kind: 'judge', sort_order: 0,
})

const emptySponsor = (): CompetitionSponsorInput => ({ name: '', name_en: '', logo_url: null, website_url: '', sort_order: 0 })

export function SuperAdminCompetitionSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null)
  const [tab, setTab] = useState<Tab>('people')
  const [personForm, setPersonForm] = useState<CompetitionPersonInput | null>(null)
  const [sponsorForm, setSponsorForm] = useState<CompetitionSponsorInput | null>(null)
  const [personLeagues, setPersonLeagues] = useState<string[]>([])
  const [sponsorLeagues, setSponsorLeagues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const reload = async () => {
    setError(null)
    setData(await fetchCompetitionSettings())
  }
  useEffect(() => { void reload().catch((err: Error) => setError(err.message)) }, [])

  const leagues = useMemo(() => (data?.leagues ?? []).filter((league) => league.is_active !== false), [data?.leagues])
  const people = data?.people ?? []
  const sponsors = data?.sponsors ?? []
  const personAssignments = data?.personLeagues ?? []
  const sponsorAssignments = data?.sponsorLeagues ?? []

  const assignedLeagues = (personId: string) => personAssignments.filter((row) => row.person_id === personId).map((row) => row.league_id)
  const assignedSponsorLeagues = (sponsorId: string) => sponsorAssignments.filter((row) => row.sponsor_id === sponsorId).map((row) => row.league_id)
  const leagueName = (id: string) => leagues.find((league) => league.id === id)?.name ?? 'لیگ حذف‌شده'
  const toggle = (current: string[], id: string) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]

  const editPerson = (person?: CompetitionPerson) => {
    setTab('people')
    setPersonForm(person ? { ...person, id: person.id } : emptyPerson())
    setPersonLeagues(person ? assignedLeagues(person.id) : [])
    setMessage('')
  }
  const editSponsor = (sponsor?: CompetitionSponsor) => {
    setTab('sponsors')
    setSponsorForm(sponsor ? { ...sponsor, id: sponsor.id } : emptySponsor())
    setSponsorLeagues(sponsor ? assignedSponsorLeagues(sponsor.id) : [])
    setMessage('')
  }

  const savePerson = async () => {
    if (!personForm?.full_name.trim()) return
    setBusy(true); setError(null); setMessage('')
    try {
      const person = await upsertCompetitionPerson(personForm)
      const selectedLeagues = person.role_kind === 'judge'
        ? personLeagues.filter((id) => (data?.leagues ?? []).find((league) => league.id === id)?.judging_enabled !== false)
        : personLeagues
      await setCompetitionPersonLeagues(person.id, selectedLeagues)
      await reload(); editPerson(person); setMessage('رزومه و نسبت لیگ‌ها ذخیره شد.')
    } catch (err) { setError(err instanceof Error ? err.message : 'ذخیره رزومه ناموفق بود.') } finally { setBusy(false) }
  }
  const saveSponsor = async () => {
    if (!sponsorForm?.name.trim()) return
    setBusy(true); setError(null); setMessage('')
    try {
      const sponsor = await upsertCompetitionSponsor(sponsorForm)
      await setCompetitionSponsorLeagues(sponsor.id, sponsorLeagues)
      await reload(); editSponsor(sponsor); setMessage('اسپانسر و لیگ‌های مرتبط ذخیره شد.')
    } catch (err) { setError(err instanceof Error ? err.message : 'ذخیره اسپانسر ناموفق بود.') } finally { setBusy(false) }
  }
  const removePerson = async (person: CompetitionPerson) => {
    if (!window.confirm(`رزومه «${person.full_name}» حذف شود؟`)) return
    setBusy(true); setError(null)
    try { await deleteCompetitionPerson(person.id); if (personForm?.id === person.id) setPersonForm(null); await reload() } catch (err) { setError(err instanceof Error ? err.message : 'حذف رزومه ناموفق بود.') } finally { setBusy(false) }
  }
  const removeSponsor = async (sponsor: CompetitionSponsor) => {
    if (!window.confirm(`اسپانسر «${sponsor.name}» حذف شود؟`)) return
    setBusy(true); setError(null)
    try { await deleteCompetitionSponsor(sponsor.id); if (sponsorForm?.id === sponsor.id) setSponsorForm(null); await reload() } catch (err) { setError(err instanceof Error ? err.message : 'حذف اسپانسر ناموفق بود.') } finally { setBusy(false) }
  }
  const toggleJudging = async (league: League, enabled: boolean) => {
    setBusy(true); setError(null)
    try { await setLeagueJudgingEnabled(league.id, enabled); await reload(); setMessage(`وضعیت داوری «${league.name}» ذخیره شد.`) } catch (err) { setError(err instanceof Error ? err.message : 'ذخیره وضعیت داوری ناموفق بود.') } finally { setBusy(false) }
  }

  if (!data) return <PanelPage index="REG.03" title="تنظیمات مسابقات"><FieldError message={error ?? undefined} /><p className="text-sm text-slate-500">در حال بارگذاری…</p></PanelPage>
  return <PanelPage index="REG.03" title="تنظیمات مسابقات" description="رزومه مشترک داوران و کمیته فنی، اسپانسرها و وضعیت داوری هر لیگ را یک‌جا مدیریت کنید.">
    <FieldError message={error ?? undefined} />
    {message ? <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <Button type="button" variant={tab === 'people' ? 'primary' : 'ghost'} onClick={() => setTab('people')}>داوران و کمیته فنی</Button>
      <Button type="button" variant={tab === 'sponsors' ? 'primary' : 'ghost'} onClick={() => setTab('sponsors')}>اسپانسرها</Button>
      <Link to="/super-admin/leagues" className="ms-auto inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold text-sky-700 hover:bg-sky-50">مدیریت لیگ‌ها</Link>
    </div>

    {tab === 'people' ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <PanelCard title="دفتر مشترک افراد" description="هر شخص را یک‌بار بسازید و از بخش نسبت به لیگ‌ها، در چند لیگ نمایش دهید.">
        <div className="mb-4 flex flex-wrap gap-2"><Button type="button" onClick={() => editPerson()}>افزودن شخص جدید</Button>{personForm ? <Button type="button" variant="ghost" onClick={() => setPersonForm(null)}>بستن فرم</Button> : null}</div>
        <div className="grid gap-3">{people.map((person) => <article key={person.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate">{person.full_name}</b><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{person.role_kind === 'judge' ? 'داور' : 'کمیته فنی'}</span></div><p className="mt-1 text-xs text-slate-500">{assignedLeagues(person.id).map(leagueName).join('، ') || 'هنوز به لیگی نسبت داده نشده'}</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => editPerson(person)}>ویرایش کوتاه</Button><Link to={`/super-admin/people/${person.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">رزومه کامل</Link><Button type="button" variant="danger" onClick={() => void removePerson(person)} disabled={busy}>حذف</Button></div></article>)}</div>
      </PanelCard>
      {personForm ? <PanelCard title={personForm.id ? 'ویرایش رزومه مشترک' : 'رزومه شخص جدید'}>
        <div className="grid gap-3 md:grid-cols-2"><Input label="نام و نام خانوادگی فارسی" required value={personForm.full_name} onChange={(e) => setPersonForm({ ...personForm, full_name: e.target.value })} /><Input label="Full name in English" dir="ltr" value={personForm.full_name_en ?? ''} onChange={(e) => setPersonForm({ ...personForm, full_name_en: e.target.value })} /><Input label="Slug" dir="ltr" value={personForm.slug} onChange={(e) => setPersonForm({ ...personForm, slug: e.target.value })} /><Select label="نقش" value={personForm.role_kind} onChange={(e) => setPersonForm({ ...personForm, role_kind: e.target.value as 'judge' | 'committee' })}><option value="judge">داور</option><option value="committee">کمیته فنی</option></Select><Input label="تخصص فارسی" value={personForm.specialty ?? ''} onChange={(e) => setPersonForm({ ...personForm, specialty: e.target.value })} /><Input label="Specialty" dir="ltr" value={personForm.specialty_en ?? ''} onChange={(e) => setPersonForm({ ...personForm, specialty_en: e.target.value })} /><div className="md:col-span-2"><ImageUploadField label="تصویر پروفایل" value={personForm.photo_url} onChange={(url) => setPersonForm({ ...personForm, photo_url: url })} /></div><Textarea label="معرفی و رزومه فارسی" value={personForm.bio ?? ''} onChange={(e) => setPersonForm({ ...personForm, bio: e.target.value })} /><Textarea label="Biography" dir="ltr" value={personForm.bio_en ?? ''} onChange={(e) => setPersonForm({ ...personForm, bio_en: e.target.value })} /><Textarea label="تحصیلات" value={personForm.education_fa ?? ''} onChange={(e) => setPersonForm({ ...personForm, education_fa: e.target.value })} /><Textarea label="Education" dir="ltr" value={personForm.education_en ?? ''} onChange={(e) => setPersonForm({ ...personForm, education_en: e.target.value })} /><Input label="ترتیب نمایش" type="number" dir="ltr" value={personForm.sort_order ?? 0} onChange={(e) => setPersonForm({ ...personForm, sort_order: Number(e.target.value) || 0 })} /><Select label="نمایش رزومه" value={personForm.is_profile_published === false ? 'hidden' : 'visible'} onChange={(e) => setPersonForm({ ...personForm, is_profile_published: e.target.value === 'visible' })}><option value="visible">نمایش داده شود</option><option value="hidden">مخفی باشد</option></Select></div>
        <div className="mt-5 rounded-2xl border border-slate-200 p-4"><h3 className="font-black">نمایش در لیگ‌ها</h3><p className="mt-1 text-xs leading-6 text-slate-500">لیگ‌های موردنظر را انتخاب کنید. برای داور، لیگ باید داوری فعال داشته باشد.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{leagues.map((league) => { const checked = personLeagues.includes(league.id); const disabled = personForm.role_kind === 'judge' && league.judging_enabled === false; return <label key={league.id} className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${disabled ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'border-slate-200'}`}><input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={() => setPersonLeagues(toggle(personLeagues, league.id))} /><span>{league.name}</span>{league.judging_enabled === false ? <span className="ms-auto text-[11px]">داوری خاموش</span> : null}</label> })}</div></div>
        <Button type="button" className="mt-5" disabled={busy || !personForm.full_name.trim()} onClick={() => void savePerson()}>{busy ? 'در حال ذخیره…' : 'ذخیره رزومه و نسبت‌ها'}</Button>
      </PanelCard> : <PanelCard title="وضعیت داوری لیگ‌ها" description="داوری هر لیگ مستقل از رزومه افراد فعال یا غیرفعال می‌شود."><div className="grid gap-3">{leagues.map((league) => <div key={league.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><span><b>{league.name}</b><small className="mt-1 block text-xs text-slate-500">{league.judging_enabled === false ? 'داوری غیرفعال؛ ثبت دستی برندگان' : 'داوری فعال'}</small></span><div className="flex flex-wrap items-center gap-3"><input type="checkbox" checked={league.judging_enabled !== false} disabled={busy} onChange={(e) => void toggleJudging(league, e.target.checked)} /><Link to={`/super-admin/leagues/${league.id}?tab=results`} className="text-sm font-bold text-sky-700 hover:underline">ثبت برندگان و آرشیو</Link></div></div>)}</div></PanelCard>}
    </div> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <PanelCard title="دفتر مشترک اسپانسرها" description="هر اسپانسر را یک‌بار ثبت کنید و در همه یا تعدادی از لیگ‌ها نمایش دهید."><div className="mb-4 flex flex-wrap gap-2"><Button type="button" onClick={() => editSponsor()}>افزودن اسپانسر جدید</Button>{sponsorForm ? <Button type="button" variant="ghost" onClick={() => setSponsorForm(null)}>بستن فرم</Button> : null}</div><div className="grid gap-3">{sponsors.map((sponsor) => <article key={sponsor.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><b className="truncate">{sponsor.name}</b><p className="mt-1 text-xs text-slate-500">{assignedSponsorLeagues(sponsor.id).map(leagueName).join('، ') || 'هنوز به لیگی نسبت داده نشده'}</p></div><div className="flex shrink-0 gap-2"><Button type="button" variant="secondary" onClick={() => editSponsor(sponsor)}>ویرایش</Button><Button type="button" variant="danger" onClick={() => void removeSponsor(sponsor)} disabled={busy}>حذف</Button></div></article>)}</div></PanelCard>
      {sponsorForm ? <PanelCard title={sponsorForm.id ? 'ویرایش اسپانسر' : 'اسپانسر جدید'}><div className="grid gap-3 md:grid-cols-2"><Input label="نام اسپانسر" required value={sponsorForm.name} onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })} /><Input label="Sponsor name" dir="ltr" value={sponsorForm.name_en ?? ''} onChange={(e) => setSponsorForm({ ...sponsorForm, name_en: e.target.value })} /><div className="md:col-span-2"><ImageUploadField label="لوگو" value={sponsorForm.logo_url} onChange={(url) => setSponsorForm({ ...sponsorForm, logo_url: url })} /></div><Input label="وب‌سایت" dir="ltr" value={sponsorForm.website_url ?? ''} onChange={(e) => setSponsorForm({ ...sponsorForm, website_url: e.target.value })} /><Input label="ترتیب نمایش" type="number" dir="ltr" value={sponsorForm.sort_order ?? 0} onChange={(e) => setSponsorForm({ ...sponsorForm, sort_order: Number(e.target.value) || 0 })} /></div><div className="mt-5 rounded-2xl border border-slate-200 p-4"><h3 className="font-black">نمایش در لیگ‌ها</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{leagues.map((league) => <label key={league.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={sponsorLeagues.includes(league.id)} onChange={() => setSponsorLeagues(toggle(sponsorLeagues, league.id))} />{league.name}</label>)}</div></div><Button type="button" className="mt-5" disabled={busy || !sponsorForm.name.trim()} onClick={() => void saveSponsor()}>{busy ? 'در حال ذخیره…' : 'ذخیره اسپانسر و نسبت‌ها'}</Button></PanelCard> : <PanelCard title="راهنمای نسبت‌دهی"><p className="text-sm leading-7 text-slate-600">یک اسپانسر را برای چند لیگ انتخاب کنید؛ حذف نسبت فقط نمایش آن را از آن لیگ حذف می‌کند و اطلاعات اصلی اسپانسر باقی می‌ماند.</p></PanelCard>}
    </div>}
  </PanelPage>
}
