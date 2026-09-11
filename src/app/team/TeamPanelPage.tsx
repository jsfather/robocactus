import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input, PanelCard, Select, StatusBadge } from '@/components/ui/FormControls'
import { DocumentUploadField } from '@/components/ui/DocumentUploadField'
import { BirthDateField } from '@/components/ui/BirthDateField'
import { numericInput } from '@/lib/validation'
import { PanelPage } from '@/components/layout/PanelShell'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import {
  fetchCaptainTeams,
  fetchTeamById,
  fetchTeamDocuments,
  fetchTeamMembers,
  uploadMemberNationalId,
  uploadMemberPhoto,
} from '@/features/registration/api'
import { fetchTeamPublishedResult } from '@/features/live-results/api'
import { PodiumCup } from '@/components/live-results/PodiumCup'
import { ageFromBirthDate, formatAppDate, formatSeasonYear } from '@/lib/dates'
import type { DocumentRow, Invoice, ResultRow, Team, TeamMember } from '@/types/database'
import type { League } from '@/types/database'
import { backend } from '@/lib/backend'
import { safeSameOriginUrl } from '@/lib/safe-url'
import { fetchAttendanceSnapshot, type AttendanceClearance, type AttendanceSettings } from '@/features/attendance/api'
import { fetchMemberRegistrationDocTypes, type RegistrationDocType } from '@/features/notifications/api'
import { withoutDigits } from '@/lib/iran'

function TeamAsset({ path, alt, onOpen }: { path?: string | null; alt: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => { if (!path) { setUrl(''); return }; if (/^https?:/i.test(path)) { setUrl(safeSameOriginUrl(path) ?? ''); return }; void backend.storage.from('team-documents').createSignedUrl(path, 600).then(({ data }) => setUrl(data.signedUrl)) }, [path])
  if (!url) return <span className="grid h-20 w-28 place-items-center rounded-xl bg-slate-100 px-2 text-center text-[10px] text-slate-400">تصویری ثبت نشده</span>
  if (/\.pdf(?:$|\?)/i.test(path ?? '')) return <button type="button" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="grid h-20 w-28 place-items-center rounded-xl bg-red-50 text-xs font-black text-red-700">PDF · بازکردن</button>
  return <button type="button" onClick={() => onOpen(url)} className="group relative block h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100"><img src={url} alt={alt} className="size-full object-cover transition group-hover:scale-[1.04]" /><span className="absolute inset-x-0 bottom-0 bg-slate-950/65 py-1 text-[9px] font-bold text-white">مشاهده</span></button>
}

function EditableMemberAsset({ label, file, stored, privateFile, busy, onChange }: { label: string; file?: File | null; stored?: string | null; privateFile?: boolean; busy: boolean; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState('')
  useEffect(() => { if (file) { const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }; if (!stored) { setPreview(''); return }; if (!privateFile || /^https?:/i.test(stored)) { setPreview(safeSameOriginUrl(stored) ?? ''); return }; void backend.storage.from('team-documents').createSignedUrl(stored, 600).then(({ data }) => setPreview(data.signedUrl)) }, [file, privateFile, stored])
  return <DocumentUploadField label={label} required value={preview} busy={busy} onSelect={onChange} onRemove={() => onChange(null)} />
}

export function TeamPanelPage() {
  const { t, i18n } = useTranslation()
  const { teamId } = useParams()
  const [searchParams] = useSearchParams()
  const editMemberId = searchParams.get('editMember')
  const editAllRequested = searchParams.get('edit') === 'all'
  const { user, profile, loading: authLoading } = useAuth()
  const { settings: siteSettings } = useSiteSettings()
  const [teams, setTeams] = useState<Team[]>([])
  const [team, setTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [result, setResult] = useState<ResultRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [league, setLeague] = useState<League | null>(null)
  const [editing, setEditing] = useState(false)
  const [memberEdits, setMemberEdits] = useState<TeamMember[]>([])
  const [saving, setSaving] = useState(false)
  const [photoFiles, setPhotoFiles] = useState<Record<string, File | null>>({})
  const [idFiles, setIdFiles] = useState<Record<string, File | null>>({})
  const [viewerUrl, setViewerUrl] = useState('')
  const [attendance, setAttendance] = useState<AttendanceClearance | null>(null)
  const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettings | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [memberDocTypes, setMemberDocTypes] = useState<RegistrationDocType[]>([])

  useEffect(() => { if (editMemberId && members.some((member) => member.id === editMemberId && member.review_status === 'rejected')) setEditing(true) }, [editMemberId, members])
  useEffect(() => { if (editAllRequested && profile?.role === 'super_admin') setEditing(true) }, [editAllRequested, profile?.role])

  useEffect(() => {
    if (!user || authLoading) return

    const run = async () => {
      setLoading(true)
      setError(null)
      setMissing(false)
      try {
        if (teamId) {
          const row = await fetchTeamById(teamId)
          setTeam(row)
          if (!row) {
            setMissing(true)
            setMembers([])
            setDocs([])
            setResult(null)
          } else {
            const [m, d, r, leagueResponse, attendanceResponse, invoiceResponse, activeMemberDocTypes] = await Promise.all([
              fetchTeamMembers(row.id),
              fetchTeamDocuments(row.id),
              fetchTeamPublishedResult(row.id).catch(() => null),
              backend.from('leagues').select('*').eq('id', row.league_id).maybeSingle(),
              fetchAttendanceSnapshot(row.id,row.league_id).catch(()=>null),
              backend.from('invoices').select('*').eq('team_id',row.id).is('archived_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle(),
              fetchMemberRegistrationDocTypes().catch(() => []),
            ])
            const safeMembers = m.map((member) => ({ ...member, photo_url: safeSameOriginUrl(member.photo_url) }))
            setMembers(safeMembers)
            setMemberEdits(safeMembers)
            setDocs(d)
            setResult(r)
            setLeague((leagueResponse.data as League | null) ?? null)
            setAttendance(attendanceResponse?.flow??null)
            setAttendanceSettings(attendanceResponse?.settings??null)
            setInvoice((invoiceResponse.data as Invoice|null)??null)
            setMemberDocTypes(activeMemberDocTypes)
          }
        } else {
          setTeams(await fetchCaptainTeams(user.id))
          setTeam(null)
          setResult(null)
          setAttendanceSettings(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'))
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [user, teamId, authLoading, t])

  if (authLoading || loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (teamId && missing) {
    return (
      <PanelPage title={t('team.notFoundTitle')} description={t('team.notFoundHint')} index="TEAM">
        <PanelCard title={t('team.listTitle')}>
          <Link to="/team" className="text-sm text-rc-blue hover:underline">
            ← {t('team.backToList')}
          </Link>
        </PanelCard>
      </PanelPage>
    )
  }

  if (teamId && team) {
    const isParticipantView = profile?.role === 'company_admin' || profile?.role === 'team_captain'
    const isManagementView = profile?.role === 'super_admin'
    const hasRejectedMember = members.some((member) => member.review_status === 'rejected')
    const editLocked = profile?.role !== 'super_admin' && !hasRejectedMember && Boolean(league?.team_edit_deadline && new Date(league.team_edit_deadline).getTime() < Date.now())
    const permitIssued = attendance?.stage === 'confirmed'
    const paymentPaid = invoice?.status === 'paid'
    const hasNoMembers = members.length === 0
    const memberPhotoEnabled = memberDocTypes.some((type) => type.code === 'member_photo')
    const memberIdentityEnabled = memberDocTypes.some((type) => type.code === 'member_identity')
    const memberEducationEnabled = siteSettings?.member_education_enabled !== false
    const memberFieldOfStudyEnabled = siteSettings?.member_field_of_study_enabled !== false
    const saveMemberEdits = async () => {
      setSaving(true)
      setError(null)
      try {
        const editableMembers = isManagementView || team.status === 'draft' ? memberEdits : memberEdits.filter((member) => member.review_status === 'rejected' && (!editMemberId || member.id === editMemberId))
        const invalidAgeMember = editableMembers.find((member) => {
          if (member.role !== 'member') return false
          const age = ageFromBirthDate(member.birth_date)
          return age == null || (league?.min_age != null && age < league.min_age) || (league?.max_age != null && age > league.max_age)
        })
        if (invalidAgeMember) throw new Error(`سن اعضای عادی تیم باید در بازه مجاز لیگ (${league?.min_age ?? 'بدون حداقل'} تا ${league?.max_age ?? 'بدون حداکثر'} سال) باشد.`)
        for (const member of editableMembers) {
          const { error: updateError } = await backend.from('team_members').update({
            first_name: member.first_name,
            last_name: member.last_name,
            first_name_fa: member.first_name_fa,
            last_name_fa: member.last_name_fa,
            first_name_en: member.first_name_en,
            last_name_en: member.last_name_en,
            full_name: `${member.first_name_fa ?? member.first_name ?? ''} ${member.last_name_fa ?? member.last_name ?? ''}`.trim(),
            national_id: member.national_id,
            birth_date: member.birth_date,
            role: member.role,
            phone: member.phone,
            residence: null,
            nationality: member.nationality,
            education_level: member.education_level,
            field_of_study: member.field_of_study,
          }).eq('id', member.id)
          if (updateError) throw new Error(updateError.message)
          if (memberPhotoEnabled && photoFiles[member.id]) await uploadMemberPhoto(team.id, member.id, photoFiles[member.id]!)
          if (memberIdentityEnabled && idFiles[member.id] && user) await uploadMemberNationalId({ userId: user.id, teamId: team.id, memberId: member.id, file: idFiles[member.id]! })
          if (team.status !== 'draft') { const submitted = await backend.rpc('submit_team_member_correction', { p_member_id: member.id }); if (submitted.error) throw new Error(submitted.error.message) }
        }
        const refreshed = await fetchTeamMembers(team.id)
        const safeMembers = refreshed.map((member) => ({ ...member, photo_url: safeSameOriginUrl(member.photo_url) }))
        setMembers(safeMembers)
        setMemberEdits(safeMembers)
        setPhotoFiles({}); setIdFiles({})
        setEditing(false)
      } catch (err) { setError(err instanceof Error ? err.message : t('common.error')) } finally { setSaving(false) }
    }
    return (
      <PanelPage
        title={team.name}
        description={`${team.province}${team.city ? ` · ${team.city}` : ''}`}
        index="TEAM"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={permitIssued?'approved':hasNoMembers?'draft':team.status}
              label={permitIssued?'تأییدشده و مجاز به حضور':hasNoMembers?'نیازمند تکمیل اعضای تیم':t(`team.statuses.${team.status}`, { defaultValue: team.status })}
            />
            {permitIssued?<span className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white"><span aria-hidden="true">✓</span> مجوز حضور صادر شده</span>:null}
            {!team.archived_at?<Link to={hasNoMembers?`/company/teams?resume=${team.id}`:`/team/${team.id}/attendance`}><Button type="button">{hasNoMembers?'تکمیل اطلاعات اعضای تیم':permitIssued?'مشاهده مجوز و اطلاعات لیگ':'ادامه ثبت‌نام'}</Button></Link>:<span className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">پرونده بایگانی‌شده</span>}
            {invoice?<Link to={`/payments/teams/${team.id}`}><Button type="button" variant="secondary">{paymentPaid?'مشاهده فاکتور':team.archived_at?'مشاهده پیش‌فاکتور بایگانی‌شده':'پرداخت فاکتور'}</Button></Link>:null}
          </div>
        }
      >
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <nav className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500" aria-label="موقعیت فعلی"><Link to={isManagementView ? '/super-admin/review' : '/company/teams'} className="text-sky-700">{isManagementView ? 'بررسی تیم‌ها' : 'تیم‌های ما'}</Link><span>←</span><strong className="text-slate-800">پرونده تیم {team.name}</strong></nav>

        <PanelCard title={t('liveResults.teamResult')}>
          {result ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <PodiumCup rank={result.rank} size={32} />
              <div>
                <p className="font-mono text-rc-muted">
                  {t('liveResults.rank')}: {result.rank ?? '—'} · {t('judging.score')}:{' '}
                  <span dir="ltr">{result.score ?? '—'}</span>
                </p>
                <p className="mt-1 text-rc-muted">{formatSeasonYear(result.season_year,i18n.language)}</p>
              </div>
              <Link to="/live" className="ms-auto text-rc-blue hover:underline">
                {t('nav.liveResults')}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-rc-muted">{t('liveResults.noTeamResult')}</p>
          )}
        </PanelCard>

        <PanelCard title={t('team.membersTitle')} actions={<Button type="button" variant="secondary" disabled={Boolean(team.archived_at) || (!isManagementView && (editLocked || (team.status !== 'draft' && !members.some((member) => member.review_status === 'rejected'))))} onClick={() => setEditing((value) => !value)}>{team.archived_at?'فقط‌خواندنی':!isManagementView && editLocked ? 'مهلت ویرایش پایان یافته' : editing ? 'انصراف' : isManagementView ? 'ویرایش کلی' : team.status !== 'draft' ? 'اصلاح اعضای ردشده' : 'ویرایش اطلاعات'}</Button>}>
          {league?.team_edit_deadline ? <p className="mb-3 text-xs text-rc-muted">مهلت ویرایش: {formatAppDate(league.team_edit_deadline, i18n.language, { withTime: true })}</p> : null}
          {editing ? <div className="space-y-4">
            {memberEdits.filter((member) => isManagementView || team.status === 'draft' || (member.review_status === 'rejected' && (!editMemberId || member.id === editMemberId))).map((member, index) => <div key={member.id} className="grid gap-3 rounded-2xl border border-rc-line p-4 md:grid-cols-2">
              <Input label="نام فارسی" value={member.first_name_fa ?? member.first_name ?? ''} onChange={(event) => { const value=withoutDigits(event.target.value); setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, first_name_fa: value, first_name: value } : row)) }} />
              <Input label="نام خانوادگی فارسی" value={member.last_name_fa ?? member.last_name ?? ''} onChange={(event) => { const value=withoutDigits(event.target.value); setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, last_name_fa: value, last_name: value } : row)) }} />
              <Input label="نام انگلیسی" value={member.first_name_en ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, first_name_en: withoutDigits(event.target.value) } : row))} dir="ltr" />
              <Input label="نام خانوادگی انگلیسی" value={member.last_name_en ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, last_name_en: withoutDigits(event.target.value) } : row))} dir="ltr" />
              <Input label="کد ملی" value={member.national_id ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, national_id: event.target.value } : row))} dir="ltr" />
              <BirthDateField label="تاریخ تولد" value={member.birth_date} minAge={member.role === 'member' ? league?.min_age ?? 0 : 0} maxAge={member.role === 'member' ? league?.max_age ?? 130 : 130} onChange={(date) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, birth_date: date } : row))} />
              <Select label="سمت در تیم" value={member.role ?? 'member'} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, role: event.target.value } : row))}><option value="captain">سرپرست</option><option value="coach">مربی</option><option value="member">عضو تیم</option></Select>
              <Input label="شماره تماس" value={member.phone ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, phone: numericInput(event.target.value, 11) } : row))} dir="ltr" inputMode="numeric" maxLength={11} />
              {memberEducationEnabled ? <Select label="آخرین مدرک تحصیلی" value={member.education_level ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, education_level: event.target.value as TeamMember['education_level'] } : row))}><option value="">انتخاب کنید</option><option value="primary">ابتدایی</option><option value="middle_school">متوسطه اول</option><option value="high_school">دیپلم / متوسطه دوم</option><option value="associate">کاردانی</option><option value="bachelor">کارشناسی</option><option value="master">کارشناسی ارشد</option><option value="doctorate">دکتری</option></Select> : null}
              {memberFieldOfStudyEnabled ? <Input label="رشته تحصیلی" value={member.field_of_study ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, field_of_study: event.target.value } : row))} /> : null}
              {memberPhotoEnabled ? <EditableMemberAsset label="تصویر پرسنلی" file={photoFiles[member.id]} stored={member.photo_url} busy={saving} onChange={(file) => setPhotoFiles((current) => ({ ...current, [member.id]: file }))} /> : null}
              {memberIdentityEnabled ? <EditableMemberAsset label="کارت ملی / مدرک هویت" file={idFiles[member.id]} stored={member.national_id_doc_path} privateFile busy={saving} onChange={(file) => setIdFiles((current) => ({ ...current, [member.id]: file }))} /> : null}
            </div>)}
            <Button type="button" onClick={() => void saveMemberEdits()} disabled={saving}>{saving ? 'در حال ذخیره…' : 'ذخیره تغییرات اعضا'}</Button>
          </div> : members.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {members.map((m) => {
                const displayName =
                  m.first_name || m.last_name
                    ? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()
                    : m.full_name
                const age = ageFromBirthDate(m.birth_date)
                return (
                  <article key={m.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><div className="size-16 shrink-0 overflow-hidden rounded-xl bg-sky-50">{memberPhotoEnabled && m.photo_url ? <button type="button" onClick={() => setViewerUrl(m.photo_url!)}><img src={m.photo_url} alt={displayName} className="size-16 object-cover" /></button> : <span className="grid size-full place-items-center text-xl font-black text-sky-700">{displayName.slice(0, 1)}</span>}</div><div className="min-w-0"><h3 className="truncate font-black text-slate-900">{displayName}</h3><span className="mt-1 inline-flex rounded-md bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">{m.role === 'captain' ? 'سرپرست' : m.role === 'coach' ? 'مربی' : 'عضو تیم'}</span></div><span className={`ms-auto rounded-md px-2 py-1 text-[10px] font-bold ${m.review_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : m.review_status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{m.review_status === 'approved' ? 'تأییدشده' : m.review_status === 'rejected' ? 'ردشده' : 'در انتظار بررسی'}</span></div><dl className="grid grid-cols-2 gap-3 p-4 text-xs"><div><dt className="text-slate-400">سن</dt><dd className="mt-1 font-bold text-slate-700">{age != null ? `${age.toLocaleString('fa-IR')} سال` : '—'}</dd></div><div><dt className="text-slate-400">تاریخ تولد</dt><dd className="mt-1 font-bold text-slate-700">{formatAppDate(m.birth_date, i18n.language)}</dd></div><div><dt className="text-slate-400">کد ملی</dt><dd className="mt-1 font-mono text-slate-700">{m.national_id ?? '—'}</dd></div>{memberEducationEnabled || memberFieldOfStudyEnabled ? <div><dt className="text-slate-400">تحصیلات</dt><dd className="mt-1 font-bold text-slate-700">{(memberFieldOfStudyEnabled ? m.field_of_study : null) || (memberEducationEnabled ? m.education_level || m.education : null) || '—'}</dd></div> : null}</dl>{memberIdentityEnabled ? <div className="border-t border-slate-100 p-3"><span className="mb-2 block text-[10px] font-bold text-slate-400">تصویر کارت ملی / هویت</span><TeamAsset path={m.national_id_doc_path} alt={`مدرک ${displayName}`} onOpen={setViewerUrl} /></div> : null}</article>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-rc-muted">{t('team.noMembers')}</p>
          )}
        </PanelCard>

        {attendanceSettings?.team_documents_enabled !== false ? <PanelCard title={t('team.docsTitle')}>
          {docs.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((d) => (
                <article key={d.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"><TeamAsset path={d.file_path} alt={d.doc_type} onOpen={setViewerUrl} /><div className="min-w-0"><strong className="block truncate text-sm text-slate-800">{d.team_member_id ? 'مدرک هویتی عضو' : d.doc_type === 'team_logo' ? 'لوگوی تیم' : d.doc_type}</strong><span className="mt-1 block truncate font-mono text-[10px] text-slate-400" dir="ltr">{d.file_path.split('/').pop()}</span></div></article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-rc-muted">{t('team.noDocs')}</p>
          )}
        </PanelCard> : null}

        {isParticipantView ? <PanelCard title="پشتیبانی این تیم" description="از این بخش می‌توانید درخواست خود را برای کارشناسان پشتیبانی ارسال و وضعیت پاسخ را پیگیری کنید."><Link to="/account/tickets" className="inline-flex min-h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">مشاهده و ارسال تیکت</Link></PanelCard> : null}

        {viewerUrl ? <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerUrl('') }}><div className="relative max-h-[90dvh] max-w-4xl overflow-hidden rounded-2xl bg-white p-2"><button type="button" className="absolute end-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-slate-950/70 text-xl text-white" onClick={() => setViewerUrl('')}>×</button><img src={viewerUrl} alt="نمایش بزرگ تصویر" className="max-h-[86dvh] max-w-full rounded-xl object-contain" /></div></div> : null}

        <Link to={isManagementView ? '/super-admin/review' : '/team'} className="inline-block text-sm text-rc-blue hover:underline">
          ← {t('team.backToList')}
        </Link>
      </PanelPage>
    )
  }

  return (
    <PanelPage
      title={t('team.captainPanelTitle')}
      description={t('team.captainPanelHint')}
      index="TEAM"
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="role-welcome relative overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#0a4964] to-[#087eb8] p-6 text-white shadow-[0_22px_60px_rgb(8_126_184/0.18)] sm:p-8"><p className="text-sm font-black text-sky-200">مدیریت تیم‌های مجموعه</p><h2 className="mt-2 text-2xl font-black text-white">{profile?.full_name ?? 'مدیر مجموعه'}، وضعیت تیم‌ها در دسترس شماست</h2><p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-100">اعضا، مدارک، وضعیت بررسی و پرداخت هر تیم را از این بخش دنبال کنید.</p><div className="mt-5 inline-flex rounded-xl bg-[#ffffff16] px-4 py-2 text-xs font-bold text-white">{teams.length} تیم در حساب مجموعه</div></div>

      <PanelCard title={t('team.listTitle')}>
        {teams.length === 0 ? (
          <p className="text-sm text-rc-muted">
            {t('team.captainEmpty')}{' '}
            <Link to="/company" className="text-rc-blue hover:underline">
              {t('company.panelTitle')}
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-rc-line/60">
            {teams.map((row) => (
              <li key={row.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <StatusBadge
                    status={row.status}
                    label={t(`team.statuses.${row.status}`, { defaultValue: row.status })}
                  />
                </div>
                <Link to={`/team/${row.id}`} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800">
                  پرونده تیم
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </PanelPage>
  )
}
