import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { ImageUploadField } from '@/components/ui/ImageUploadField'
import { PanelPage } from '@/components/layout/PanelShell'
import { backend } from '@/lib/backend'
import { upsertLeaguePerson } from '@/features/leagues/adminApi'
import type { LeaguePerson } from '@/types/database'

export function SuperAdminPersonEditPage() {
  const { personId = '' } = useParams()
  const [form, setForm] = useState<LeaguePerson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void backend.from('league_people').select('*').eq('id', personId).maybeSingle().then(({ data, error: fetchError }) => {
      if (fetchError) setError(fetchError.message)
      else setForm(data as LeaguePerson | null)
    })
  }, [personId])

  const patch = (value: Partial<LeaguePerson>) => setForm((current) => current ? { ...current, ...value } : current)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      setForm(await upsertLeaguePerson({ ...form, id: form.id }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ذخیره رزومه ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  if (!form) return <div className="px-4 py-12 text-rc-muted">{error || 'در حال بارگذاری…'}</div>

  return <PanelPage index="CV.01" title="رزومه داور یا عضو کمیته" description="اطلاعات عمومی فرد را به فارسی و انگلیسی مدیریت کنید.">
    <div className="mb-4 flex flex-wrap gap-3 text-sm"><Link to={`/super-admin/leagues/${form.league_id}`} className="text-rc-blue">بازگشت به تنظیمات لیگ</Link><Link to={`/people/${form.slug}`} target="_blank" className="text-emerald-600">مشاهده صفحه عمومی</Link></div>
    <form className="space-y-6" onSubmit={(event) => void save(event)}>
      <FieldError message={error ?? undefined} />
      <PanelCard title="مشخصات اصلی و تصویر">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="نام و نام خانوادگی فارسی" required value={form.full_name} onChange={(event) => patch({ full_name: event.target.value })} />
          <Input label="Full name in English" required value={form.full_name_en ?? ''} onChange={(event) => patch({ full_name_en: event.target.value })} dir="ltr" />
          <Input label="آدرس صفحه (slug)" required value={form.slug} onChange={(event) => patch({ slug: event.target.value })} dir="ltr" />
          <Select label="سمت" value={form.role_kind} onChange={(event) => patch({ role_kind: event.target.value })}><option value="judge">داور</option><option value="committee">کمیته فنی</option></Select>
          <Input label="تخصص فارسی" value={form.specialty ?? ''} onChange={(event) => patch({ specialty: event.target.value })} />
          <Input label="Specialty in English" value={form.specialty_en ?? ''} onChange={(event) => patch({ specialty_en: event.target.value })} dir="ltr" />
          <div className="md:col-span-2"><ImageUploadField label="تصویر پروفایل" value={form.photo_url} onChange={(url) => patch({ photo_url: url })} /></div>
          <Textarea label="معرفی کوتاه فارسی" value={form.bio ?? ''} onChange={(event) => patch({ bio: event.target.value })} />
          <Textarea label="Short biography in English" value={form.bio_en ?? ''} onChange={(event) => patch({ bio_en: event.target.value })} dir="ltr" />
          <Select label="وضعیت انتشار رزومه" value={form.is_profile_published === false ? '0' : '1'} onChange={(event) => patch({ is_profile_published: event.target.value === '1' })}><option value="1">منتشر شود</option><option value="0">پنهان باشد</option></Select>
          <Input label="ترتیب نمایش" type="number" value={form.sort_order} onChange={(event) => patch({ sort_order: Number(event.target.value) })} dir="ltr" />
        </div>
      </PanelCard>

      <PanelCard title="اطلاعات هویتی عمومی">
        <div className="grid gap-3 md:grid-cols-2"><DateTimeField label="تاریخ تولد" withTime={false} value={form.birth_date ? `${form.birth_date}T12:00:00.000Z` : null} onChange={(iso) => patch({ birth_date: iso?.slice(0, 10) ?? null })} /><span />
          <Input label="ملیت فارسی" value={form.nationality_fa ?? ''} onChange={(event) => patch({ nationality_fa: event.target.value })} /><Input label="Nationality" value={form.nationality_en ?? ''} onChange={(event) => patch({ nationality_en: event.target.value })} dir="ltr" />
          <Input label="شهر فارسی" value={form.city_fa ?? ''} onChange={(event) => patch({ city_fa: event.target.value })} /><Input label="City" value={form.city_en ?? ''} onChange={(event) => patch({ city_en: event.target.value })} dir="ltr" />
          <Textarea label="اطلاعات هویتی و معرفی فارسی" value={form.identity_summary_fa ?? ''} onChange={(event) => patch({ identity_summary_fa: event.target.value })} /><Textarea label="Identity & background" value={form.identity_summary_en ?? ''} onChange={(event) => patch({ identity_summary_en: event.target.value })} dir="ltr" />
        </div>
      </PanelCard>

      <PanelCard title="سوابق و رزومه دوزبانه" description="هر مورد را در یک خط جداگانه وارد کنید.">
        <div className="grid gap-4 md:grid-cols-2">
          <Textarea label="تحصیلات فارسی" className="min-h-32" value={form.education_fa ?? ''} onChange={(event) => patch({ education_fa: event.target.value })} /><Textarea label="Education" className="min-h-32" value={form.education_en ?? ''} onChange={(event) => patch({ education_en: event.target.value })} dir="ltr" />
          <Textarea label="افتخارات فارسی" className="min-h-32" value={form.honors_fa ?? ''} onChange={(event) => patch({ honors_fa: event.target.value })} /><Textarea label="Honors" className="min-h-32" value={form.honors_en ?? ''} onChange={(event) => patch({ honors_en: event.target.value })} dir="ltr" />
          <Textarea label="جوایز فارسی" className="min-h-32" value={form.awards_fa ?? ''} onChange={(event) => patch({ awards_fa: event.target.value })} /><Textarea label="Awards" className="min-h-32" value={form.awards_en ?? ''} onChange={(event) => patch({ awards_en: event.target.value })} dir="ltr" />
          <Textarea label="دوره‌ها و گواهی‌ها فارسی" className="min-h-32" value={form.courses_fa ?? ''} onChange={(event) => patch({ courses_fa: event.target.value })} /><Textarea label="Courses & certificates" className="min-h-32" value={form.courses_en ?? ''} onChange={(event) => patch({ courses_en: event.target.value })} dir="ltr" />
          <Textarea label="شرکت و فعالیت حرفه‌ای فارسی" className="min-h-32" value={form.company_info_fa ?? ''} onChange={(event) => patch({ company_info_fa: event.target.value })} /><Textarea label="Companies & professional activity" className="min-h-32" value={form.company_info_en ?? ''} onChange={(event) => patch({ company_info_en: event.target.value })} dir="ltr" />
        </div>
      </PanelCard>

      <PanelCard title="اطلاعات تماس عمومی">
        <div className="grid gap-3 md:grid-cols-2"><Input label="ایمیل" type="email" value={form.email ?? ''} onChange={(event) => patch({ email: event.target.value })} dir="ltr" /><Input label="تلفن" value={form.phone ?? ''} onChange={(event) => patch({ phone: event.target.value })} dir="ltr" /><Input label="وب‌سایت" value={form.website_url ?? ''} onChange={(event) => patch({ website_url: event.target.value })} dir="ltr" /><Input label="LinkedIn" value={form.linkedin_url ?? ''} onChange={(event) => patch({ linkedin_url: event.target.value })} dir="ltr" /></div>
      </PanelCard>
      <Button type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره کامل رزومه'}</Button>
    </form>
  </PanelPage>
}

