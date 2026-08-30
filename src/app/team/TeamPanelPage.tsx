import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input, PanelCard, Select, StatusBadge } from '@/components/ui/FormControls'
import { DocumentUploadField } from '@/components/ui/DocumentUploadField'
import { BirthDateField } from '@/components/ui/BirthDateField'
import { PanelPage } from '@/components/layout/PanelShell'
import { useAuth } from '@/hooks/useAuth'
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
import { ageFromBirthDate, formatAppDate } from '@/lib/dates'
import type { DocumentRow, ResultRow, Team, TeamMember } from '@/types/database'
import type { League } from '@/types/database'
import { backend } from '@/lib/backend'

function TeamAsset({ path, alt, onOpen }: { path?: string | null; alt: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => { if (!path) { setUrl(''); return }; if (/^https?:/i.test(path)) { setUrl(path); return }; void backend.storage.from('team-documents').createSignedUrl(path, 600).then(({ data }) => setUrl(data.signedUrl)) }, [path])
  if (!url) return <span className="grid aspect-[4/3] place-items-center rounded-xl bg-slate-100 text-xs text-slate-400">تصویری ثبت نشده</span>
  if (/\.pdf(?:$|\?)/i.test(path ?? '')) return <button type="button" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-red-50 font-black text-red-700">PDF · بازکردن فایل</button>
  return <button type="button" onClick={() => onOpen(url)} className="block w-full overflow-hidden rounded-xl bg-slate-100"><img src={url} alt={alt} className="aspect-[4/3] w-full object-cover transition hover:scale-[1.03]" /></button>
}

function EditableMemberAsset({ label, file, stored, privateFile, busy, onChange }: { label: string; file?: File | null; stored?: string | null; privateFile?: boolean; busy: boolean; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState('')
  useEffect(() => { if (file) { const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }; if (!stored) { setPreview(''); return }; if (!privateFile || /^https?:/i.test(stored)) { setPreview(stored); return }; void backend.storage.from('team-documents').createSignedUrl(stored, 600).then(({ data }) => setPreview(data.signedUrl)) }, [file, privateFile, stored])
  return <DocumentUploadField label={label} required value={preview} busy={busy} onSelect={onChange} onRemove={() => onChange(null)} />
}

export function TeamPanelPage() {
  const { t, i18n } = useTranslation()
  const { teamId } = useParams()
  const { user, profile, loading: authLoading } = useAuth()
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
            const [m, d, r, leagueResponse] = await Promise.all([
              fetchTeamMembers(row.id),
              fetchTeamDocuments(row.id),
              fetchTeamPublishedResult(row.id).catch(() => null),
              backend.from('leagues').select('*').eq('id', row.league_id).maybeSingle(),
            ])
            setMembers(m)
            setMemberEdits(m)
            setDocs(d)
            setResult(r)
            setLeague((leagueResponse.data as League | null) ?? null)
          }
        } else {
          setTeams(await fetchCaptainTeams(user.id))
          setTeam(null)
          setResult(null)
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
    const editLocked = profile?.role !== 'super_admin' && Boolean(league?.team_edit_deadline && new Date(league.team_edit_deadline).getTime() < Date.now())
    const saveMemberEdits = async () => {
      setSaving(true)
      setError(null)
      try {
        for (const member of memberEdits) {
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
            residence: member.residence,
            nationality: member.nationality,
            education_level: member.education_level,
            field_of_study: member.field_of_study,
          }).eq('id', member.id)
          if (updateError) throw new Error(updateError.message)
          if (photoFiles[member.id]) await uploadMemberPhoto(team.id, member.id, photoFiles[member.id]!)
          if (idFiles[member.id] && user) await uploadMemberNationalId({ userId: user.id, teamId: team.id, memberId: member.id, file: idFiles[member.id]! })
        }
        const refreshed = await fetchTeamMembers(team.id)
        setMembers(refreshed)
        setMemberEdits(refreshed)
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
              status={team.status}
              label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
            />
            <Link to={`/payments/teams/${team.id}`}>
              <Button type="button" variant={team.status === 'draft' ? 'primary' : 'secondary'}>
                {team.status === 'draft' ? t('payment.payCta') : t('payment.viewInvoice')}
              </Button>
            </Link>
          </div>
        }
      >
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <nav className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500" aria-label="موقعیت فعلی"><Link to="/company/teams" className="text-sky-700">تیم‌های ما</Link><span>←</span><strong className="text-slate-800">پرونده تیم {team.name}</strong></nav>

        <PanelCard title={t('liveResults.teamResult')}>
          {result ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <PodiumCup rank={result.rank} size={32} />
              <div>
                <p className="font-mono text-rc-muted">
                  {t('liveResults.rank')}: {result.rank ?? '—'} · {t('judging.score')}:{' '}
                  <span dir="ltr">{result.score ?? '—'}</span>
                </p>
                <p className="mt-1 text-rc-muted">{result.season_year}</p>
              </div>
              <Link to="/live" className="ms-auto text-rc-blue hover:underline">
                {t('nav.liveResults')}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-rc-muted">{t('liveResults.noTeamResult')}</p>
          )}
        </PanelCard>

        <PanelCard title={t('team.membersTitle')} actions={<Button type="button" variant="secondary" disabled={editLocked} onClick={() => setEditing((value) => !value)}>{editLocked ? 'مهلت ویرایش پایان یافته' : editing ? 'انصراف' : 'ویرایش اطلاعات'}</Button>}>
          {league?.team_edit_deadline ? <p className="mb-3 text-xs text-rc-muted">مهلت ویرایش: {formatAppDate(league.team_edit_deadline, i18n.language, { withTime: true })}</p> : null}
          {editing ? <div className="space-y-4">
            {memberEdits.map((member, index) => <div key={member.id} className="grid gap-3 rounded-2xl border border-rc-line p-4 md:grid-cols-2">
              <Input label="نام فارسی" value={member.first_name_fa ?? member.first_name ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, first_name_fa: event.target.value, first_name: event.target.value } : row))} />
              <Input label="نام خانوادگی فارسی" value={member.last_name_fa ?? member.last_name ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, last_name_fa: event.target.value, last_name: event.target.value } : row))} />
              <Input label="نام انگلیسی" value={member.first_name_en ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, first_name_en: event.target.value } : row))} dir="ltr" />
              <Input label="نام خانوادگی انگلیسی" value={member.last_name_en ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, last_name_en: event.target.value } : row))} dir="ltr" />
              <Input label="کد ملی" value={member.national_id ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, national_id: event.target.value } : row))} dir="ltr" />
              <BirthDateField label="تاریخ تولد" value={member.birth_date} onChange={(date) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, birth_date: date } : row))} />
              <Select label="سمت در تیم" value={member.role ?? 'member'} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, role: event.target.value } : row))}><option value="captain">سرپرست</option><option value="coach">مربی</option><option value="member">عضو تیم</option></Select>
              <Input label="شماره تماس" value={member.phone ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, phone: event.target.value } : row))} dir="ltr" />
              <Input label="محل سکونت" value={member.residence ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, residence: event.target.value } : row))} />
              <Input label="رشته تحصیلی" value={member.field_of_study ?? ''} onChange={(event) => setMemberEdits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, field_of_study: event.target.value } : row))} />
              <EditableMemberAsset label="تصویر پرسنلی" file={photoFiles[member.id]} stored={member.photo_url} busy={saving} onChange={(file) => setPhotoFiles((current) => ({ ...current, [member.id]: file }))} />
              <EditableMemberAsset label="کارت ملی / مدرک هویت" file={idFiles[member.id]} stored={member.national_id_doc_path} privateFile busy={saving} onChange={(file) => setIdFiles((current) => ({ ...current, [member.id]: file }))} />
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
                  <article key={m.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><div className="size-16 shrink-0 overflow-hidden rounded-xl bg-sky-50">{m.photo_url ? <button type="button" onClick={() => setViewerUrl(m.photo_url!)}><img src={m.photo_url} alt={displayName} className="size-16 object-cover" /></button> : <span className="grid size-full place-items-center text-xl font-black text-sky-700">{displayName.slice(0, 1)}</span>}</div><div className="min-w-0"><h3 className="truncate font-black text-slate-900">{displayName}</h3><span className="mt-1 inline-flex rounded-md bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">{m.role === 'captain' ? 'سرپرست' : m.role === 'coach' ? 'مربی' : 'عضو تیم'}</span></div><span className={`ms-auto rounded-md px-2 py-1 text-[10px] font-bold ${m.review_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : m.review_status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{m.review_status === 'approved' ? 'تأییدشده' : m.review_status === 'rejected' ? 'ردشده' : 'در انتظار بررسی'}</span></div><dl className="grid grid-cols-2 gap-3 p-4 text-xs"><div><dt className="text-slate-400">سن</dt><dd className="mt-1 font-bold text-slate-700">{age != null ? `${age.toLocaleString('fa-IR')} سال` : '—'}</dd></div><div><dt className="text-slate-400">تاریخ تولد</dt><dd className="mt-1 font-bold text-slate-700">{formatAppDate(m.birth_date, i18n.language)}</dd></div><div><dt className="text-slate-400">کد ملی</dt><dd className="mt-1 font-mono text-slate-700">{m.national_id ?? '—'}</dd></div><div><dt className="text-slate-400">تحصیلات</dt><dd className="mt-1 font-bold text-slate-700">{m.field_of_study || m.education || '—'}</dd></div></dl><div className="border-t border-slate-100 p-3"><span className="mb-2 block text-[10px] font-bold text-slate-400">تصویر کارت ملی / هویت</span><TeamAsset path={m.national_id_doc_path} alt={`مدرک ${displayName}`} onOpen={setViewerUrl} /></div></article>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-rc-muted">{t('team.noMembers')}</p>
          )}
        </PanelCard>

        <PanelCard title={t('team.docsTitle')}>
          {docs.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((d) => (
                <article key={d.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><TeamAsset path={d.file_path} alt={d.doc_type} onOpen={setViewerUrl} /><div className="p-4"><strong className="block text-sm text-slate-800">{d.team_member_id ? 'مدرک هویتی عضو' : d.doc_type === 'team_logo' ? 'لوگوی تیم' : d.doc_type}</strong><span className="mt-1 block truncate font-mono text-[10px] text-slate-400" dir="ltr">{d.file_path.split('/').pop()}</span></div></article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-rc-muted">{t('team.noDocs')}</p>
          )}
        </PanelCard>

        <PanelCard title="پشتیبانی این تیم" description="تیکت‌ها در بخش مستقل پشتیبانی نگهداری می‌شوند تا با پرونده و مدارک تیم مخلوط نشوند."><Link to="/account/tickets" className="inline-flex min-h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">مشاهده و ارسال تیکت</Link></PanelCard>

        {viewerUrl ? <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerUrl('') }}><div className="relative max-h-[90dvh] max-w-4xl overflow-hidden rounded-2xl bg-white p-2"><button type="button" className="absolute end-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-slate-950/70 text-xl text-white" onClick={() => setViewerUrl('')}>×</button><img src={viewerUrl} alt="نمایش بزرگ تصویر" className="max-h-[86dvh] max-w-full rounded-xl object-contain" /></div></div> : null}

        <Link to="/team" className="inline-block text-sm text-rc-blue hover:underline">
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
