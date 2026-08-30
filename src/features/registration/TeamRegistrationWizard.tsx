import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  FieldError,
  Input,
  Select,
  StatusBadge,
} from '@/components/ui/FormControls'
import { BirthDateField } from '@/components/ui/BirthDateField'
import { DocumentUploadField, validateIdentityImage } from '@/components/ui/DocumentUploadField'
import { useAuth } from '@/hooks/useAuth'
import { fetchActiveLeagues } from '@/features/companies/api'
import { ageFromBirthDate } from '@/lib/dates'
import { backend } from '@/lib/backend'
import {
  clearTeamDraft,
  createDraftTeam,
  emptyMemberDraft,
  emptyTeamDraft,
  fetchTeamDocuments,
  fetchTeamMembers,
  loadTeamDraft,
  loadRegistrationDraft,
  persistRegistrationDraft,
  replaceTeamMembers,
  saveTeamDraft,
  updateDraftTeam,
  uploadMemberNationalId,
  uploadMemberPhoto,
  uploadTeamDocument,
  type TeamMemberDraft,
  type TeamWizardDraft,
} from '@/features/registration/api'
import { registrationLifecycleForStep } from '@/features/registration/lifecycle'
import { fetchTeamRegistrationDocTypes, type RegistrationDocType } from '@/features/notifications/api'
import type { DocumentRow, League, Team } from '@/types/database'

function MemberIdentityUpload({ label, file, storedUrl, busy, onChange }: { label: string; file?: File | null; storedUrl?: string | null; busy: boolean; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState(storedUrl ?? '')
  useEffect(() => {
    if (!file) { if (storedUrl && !/^https?:/i.test(storedUrl)) { void backend.storage.from('team-documents').createSignedUrl(storedUrl, 600).then(({ data }) => setPreview(data.signedUrl)); return }; setPreview(storedUrl ?? ''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, storedUrl])
  return <DocumentUploadField label={label} required value={preview} busy={busy} onSelect={(next) => { const error = validateIdentityImage(next); if (!error) onChange(next) }} onRemove={() => onChange(null)} />
}

function PrivateImage({ path, alt, onOpen }: { path?: string | null; alt: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => { if (!path) { setUrl(''); return }; if (/^https?:/i.test(path)) { setUrl(path); return }; void backend.storage.from('team-documents').createSignedUrl(path, 600).then(({ data }) => setUrl(data.signedUrl)) }, [path])
  if (!url) return <span className="grid aspect-[4/3] place-items-center bg-slate-100 text-xs font-bold text-slate-400">بدون تصویر</span>
  if (/\.pdf(?:$|\?)/i.test(path ?? '')) return <button type="button" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="grid aspect-[4/3] w-full place-items-center bg-slate-50 text-sm font-black text-sky-700"><span><span className="mx-auto mb-2 grid size-10 place-items-center rounded-lg bg-red-50 text-red-600">PDF</span>بازکردن فایل</span></button>
  return <button type="button" onClick={() => onOpen(url)} className="block w-full overflow-hidden bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500"><img src={url} alt={alt} className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.03]" /></button>
}

const STEPS = ['info', 'members', 'documents', 'review', 'invoice', 'payment'] as const
const EDITABLE_STEPS = 4

interface TeamRegistrationWizardProps {
  companyId: string
  initialLeagueId?: string
  initialTeamId?: string
  onCompleted: (team: Team) => void
  onCancel: () => void
}

export function TeamRegistrationWizard({
  companyId,
  initialLeagueId,
  initialTeamId,
  onCompleted,
  onCancel,
}: TeamRegistrationWizardProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [draft, setDraft] = useState<TeamWizardDraft>(() => {
    const loaded = loadTeamDraft(companyId) ?? emptyTeamDraft(companyId, initialLeagueId ?? '')
    if (initialLeagueId && !loaded.leagueId) loaded.leagueId = initialLeagueId
    if (initialLeagueId && loaded.leagueId !== initialLeagueId && !loaded.teamId) {
      loaded.leagueId = initialLeagueId
    }
    return loaded
  })
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [idFiles, setIdFiles] = useState<Record<number, File | null>>({})
  const [photoFiles, setPhotoFiles] = useState<Record<number, File | null>>({})
  const [draftHydrated, setDraftHydrated] = useState(!initialTeamId)
  const [nameAvailability, setNameAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle')
  const [teamDocTypes, setTeamDocTypes] = useState<RegistrationDocType[]>([])
  const [teamDocType, setTeamDocType] = useState('')
  const [teamFile, setTeamFile] = useState<File | null>(null)
  const [teamFilePreview, setTeamFilePreview] = useState('')
  const [viewerUrl, setViewerUrl] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [openMemberIndex, setOpenMemberIndex] = useState<number | null>(0)

  useEffect(() => {
    if (!initialTeamId) return
    void loadRegistrationDraft(initialTeamId)
      .then((saved) => { if (saved) setDraft({ ...saved, step: Math.min(saved.step, EDITABLE_STEPS - 1) }) })
      .catch((err: Error) => setError(err.message))
      .finally(() => setDraftHydrated(true))
  }, [initialTeamId])

  useEffect(() => {
    void fetchActiveLeagues()
      .then((rows) => setLeagues(rows.filter((league) => (league.registration_cycle_status ?? 'open') === 'open')))
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => { void fetchTeamRegistrationDocTypes().then((rows) => { setTeamDocTypes(rows); setTeamDocType((current) => current || rows[0]?.code || '') }).catch(() => setTeamDocTypes([])); void backend.from('companies').select('name').eq('id', companyId).maybeSingle().then(({ data }) => setCompanyName(data?.name ?? 'مجموعه شما')) }, [companyId])
  useEffect(() => { if (!teamFile || !teamFile.type.startsWith('image/')) { setTeamFilePreview(''); return }; const url = URL.createObjectURL(teamFile); setTeamFilePreview(url); return () => URL.revokeObjectURL(url) }, [teamFile])

  useEffect(() => {
    saveTeamDraft(draft)
  }, [draft])

  useEffect(() => {
    if (!draftHydrated || !draft.teamId) return
    const lifecycle = registrationLifecycleForStep(draft.step)
    const timer = window.setTimeout(() => {
      void persistRegistrationDraft(draft.teamId!, draft, lifecycle).catch(() => undefined)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draft, draftHydrated])

  useEffect(() => {
    if (!draft.teamId) return
    void fetchTeamDocuments(draft.teamId).then(setDocs).catch(() => undefined)
  }, [draft.teamId])

  const step = draft.step
  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === draft.leagueId) ?? null,
    [leagues, draft.leagueId],
  )

  useEffect(() => {
    const name = draft.name.trim()
    if (!name || !draft.leagueId || !selectedLeague) { setNameAvailability('idle'); return }
    setNameAvailability('checking')
    const timer = window.setTimeout(() => {
      void backend.rpc('team_name_available', {
        p_league_id: draft.leagueId,
        p_season_year: selectedLeague.current_season_year ?? new Date().getFullYear(),
        p_name: name,
        p_exclude_team_id: draft.teamId ?? null,
      }).then(({ data, error: availabilityError }) => {
        if (availabilityError) { setNameAvailability('error'); return }
        setNameAvailability(data === true ? 'available' : 'taken')
      })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [draft.name, draft.leagueId, draft.teamId, selectedLeague])

  const patchDraft = useCallback((partial: Partial<TeamWizardDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }))
  }, [])

  const patchMember = (index: number, partial: Partial<TeamMemberDraft>) => {
    const members = [...draft.members]
    const current = members[index]
    const next = { ...current, ...partial }
    if (partial.first_name != null || partial.last_name != null) {
      next.full_name = `${next.first_name} ${next.last_name}`.trim()
    }
    members[index] = next
    patchDraft({ members })
  }

  const removeMemberAt = (index: number) => {
    patchDraft({ members: draft.members.filter((_, memberIndex) => memberIndex !== index) })
    const reindex = (files: Record<number, File | null>) => Object.fromEntries(Object.entries(files).filter(([key]) => Number(key) !== index).map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value]))
    setIdFiles(reindex)
    setPhotoFiles(reindex)
    setOpenMemberIndex(null)
  }

  const ensureTeamRecord = async (): Promise<string> => {
    if (!user) throw new Error('not authenticated')
    // `captain_id` remains the owning account for authorization. The actual
    // captain is stored as a dependent team_member and never gets an Account.
    const captainId = user.id

    const memberCount = draft.members.filter((m) => (m.first_name || m.full_name).trim()).length
    const { data: available, error: availabilityError } = await backend.rpc('team_name_available', {
      p_league_id: draft.leagueId,
      p_season_year: selectedLeague?.current_season_year ?? new Date().getFullYear(),
      p_name: draft.name.trim(),
      p_exclude_team_id: draft.teamId ?? null,
    })
    if (availabilityError) throw new Error(availabilityError.message)
    if (!available) throw new Error('تیم دیگری با این نام در این لیگ وجود دارد.')

    if (draft.teamId) {
      await updateDraftTeam(draft.teamId, {
        name: draft.name.trim(),
        name_en: draft.nameEn.trim() || null,
        motto_fa: draft.mottoFa.trim() || null,
        motto_en: draft.mottoEn.trim() || null,
        province: draft.province.trim(),
        city: draft.city.trim(),
        league_id: draft.leagueId,
        captain_id: captainId,
        member_count: memberCount,
        season_year: selectedLeague?.current_season_year ?? new Date().getFullYear(),
      })
      return draft.teamId
    }

    const team = await createDraftTeam({
      companyId,
      leagueId: draft.leagueId,
      name: draft.name.trim(),
      nameEn: draft.nameEn.trim(),
      mottoFa: draft.mottoFa.trim(),
      mottoEn: draft.mottoEn.trim(),
      province: draft.province.trim(),
      city: draft.city.trim(),
      captainId,
      memberCount,
      seasonYear: selectedLeague?.current_season_year ?? new Date().getFullYear(),
    })

    patchDraft({ teamId: team.id })
    return team.id
  }

  const saveMembersWithIdCards = async (teamId: string) => {
    if (!user) throw new Error('not authenticated')
    const saved = await replaceTeamMembers(teamId, draft.members)
    const nextMembers = [...draft.members]

    for (let i = 0; i < saved.length; i++) {
      const file = idFiles[i]
      if (file) {
        const updated = await uploadMemberNationalId({ userId: user.id, teamId, memberId: saved[i].id, file })
        if (nextMembers[i]) nextMembers[i] = { ...nextMembers[i], national_id_doc_path: updated.national_id_doc_path ?? undefined }
      }
      const photo = photoFiles[i]
      if (photo) {
        const updated = await uploadMemberPhoto(teamId, saved[i].id, photo)
        if (nextMembers[i]) nextMembers[i] = { ...nextMembers[i], photo_url: updated.photo_url ?? undefined }
      }
    }

    patchDraft({ members: nextMembers })
    setIdFiles({})
    setPhotoFiles({})
    return fetchTeamMembers(teamId)
  }

  const goNext = async () => {
    setError(null)
    setBusy(true)
    try {
      let persistedTeamId = draft.teamId
      if (step === 0) {
        if (!draft.name.trim() || !draft.nameEn.trim() || !draft.leagueId) {
          throw new Error(t('auth.required'))
        }
        persistedTeamId = await ensureTeamRecord()
      }
      if (step === 1) {
        const participantCount = draft.members.filter((member) => (member.first_name || member.last_name || member.full_name).trim()).length
        if (selectedLeague?.team_size_min != null && participantCount < selectedLeague.team_size_min) {
          throw new Error(`حداقل تعداد سرپرست و اعضای تیم ${selectedLeague.team_size_min} نفر است.`)
        }
        if (selectedLeague?.team_size_max != null && participantCount > selectedLeague.team_size_max) {
          throw new Error(`حداکثر تعداد سرپرست و اعضای تیم ${selectedLeague.team_size_max} نفر است.`)
        }
        const incomplete = draft.members.some(
          (m) =>
            (m.first_name || m.last_name || m.full_name).trim() &&
            (!m.first_name.trim() || !m.last_name.trim() || !m.first_name_en.trim() || !m.last_name_en.trim() || !m.father_name_fa.trim() || !m.father_name_en.trim() || !m.birth_date || !(m.is_foreign ? m.passport_number.trim() : m.national_id.trim()) || !m.role || !m.residence.trim() || !m.country_code || !m.nationality.trim() || !m.education_level || (['captain', 'coach'].includes(m.role) && !m.phone.trim())),
        )
        if (incomplete) throw new Error(t('auth.required'))
        const invalidAge = draft.members.some((member) => {
          const age = ageFromBirthDate(member.birth_date)
          if (age == null) return true
          if (selectedLeague?.min_age != null && age < selectedLeague.min_age) return true
          if (selectedLeague?.max_age != null && age > selectedLeague.max_age) return true
          return false
        })
        if (invalidAge) throw new Error('سن یک یا چند عضو با محدودیت سنی لیگ سازگار نیست.')
        const missingCards = draft.members.some((member, index) => !member.national_id_doc_path && !idFiles[index])
        const missingPhotos = draft.members.some((member, index) => !member.photo_url && !photoFiles[index])
        if (missingPhotos) throw new Error('بارگذاری تصویر چهره سرپرست، مربی و همه اعضای تیم الزامی است.')
        if (missingCards) throw new Error('آپلود کارت ملی سرپرست و تمام اعضای تیم الزامی است.')
        const teamId = await ensureTeamRecord()
        persistedTeamId = teamId
        await saveMembersWithIdCards(teamId)
      }
      if (step === 2) {
        if (requiredTeamDocsMissing.length) throw new Error(`مدارک الزامی بارگذاری نشده‌اند: ${requiredTeamDocsMissing.map((item) => i18n.language.startsWith('en') ? item.label_en : item.label_fa).join('، ')}`)
        persistedTeamId = await ensureTeamRecord()
      }
      const nextStep = Math.min(step + 1, EDITABLE_STEPS - 1)
      const teamId = persistedTeamId
      const nextDraft = { ...draft, teamId: teamId ?? draft.teamId, step: nextStep }
      patchDraft({ teamId: teamId ?? draft.teamId, step: nextStep })
      if (teamId) await persistRegistrationDraft(teamId, nextDraft, { ...registrationLifecycleForStep(nextStep), lastCompletedStep: step })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message.includes('team_name_already_exists') ? 'تیم دیگری با این نام در این لیگ وجود دارد.' : message)
    } finally {
      setBusy(false)
    }
  }

  const goBack = () => {
    setError(null)
    patchDraft({ step: Math.max(step - 1, 0) })
  }

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user || !draft.teamId) {
      setError(t('team.needTeamFirst'))
      return
    }

    const file = teamFile
    const docType = teamDocType

    if (!file || !file.size) {
      setError(t('auth.required'))
      return
    }

    setFileBusy(true)
    setError(null)
    try {
      const row = await uploadTeamDocument({
        userId: user.id,
        teamId: draft.teamId,
        file,
        docType,
      })
      setDocs((prev) => [row, ...prev])
      setTeamFile(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error'
      if (message === 'invalid_type' || message === 'too_large') {
        setError(t(`team.docErrors.${message}`))
      } else {
        setError(message)
      }
    } finally {
      setFileBusy(false)
    }
  }

  const teamOnlyDocs = docs.filter((doc) => !doc.team_member_id)
  const roleLabel = (role?: string | null) => role === 'captain' ? 'سرپرست' : role === 'coach' ? 'مربی' : 'عضو تیم'
  const requiredTeamDocsMissing = teamDocTypes.filter((type) => type.is_required && !teamOnlyDocs.some((doc) => doc.doc_type === type.code))

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      const teamId = await ensureTeamRecord()
      await saveMembersWithIdCards(teamId)
      await persistRegistrationDraft(teamId, { ...draft, teamId, step: 3 }, { stage: 'invoice', progress: 82, lastCompletedStep: 3, lifecycleStatus: 'awaiting_payment' })
      const { error: invoiceError } = await backend.rpc('create_invoice_for_team', { p_team_id: teamId })
      if (invoiceError) throw new Error(invoiceError.message)
      const { data, error: fetchError } = await backend
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single()

      if (fetchError) throw new Error(fetchError.message)
      clearTeamDraft(companyId)
      onCompleted(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_24px_70px_rgb(18_76_98/0.12)]">
      <div className="space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('team.wizardTitle')}</h2>
          <p className="text-sm text-rc-muted">{t('team.wizardHint')}</p>
        </div>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50 to-emerald-50 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-black text-sky-700">{t('team.currentStep', { current: Math.min(step + 1, EDITABLE_STEPS), total: STEPS.length })}</p><p className="mt-1 font-black text-slate-800">{t(`team.steps.${STEPS[step]}`)}</p></div><span className="text-2xl font-black text-emerald-700">{[10, 35, 60, 75][Math.min(step, 3)]}{i18n.language.startsWith('fa') ? '٪' : '%'}</span></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-l from-sky-500 to-emerald-500 transition-all duration-500" style={{ width: `${[10, 35, 60, 75][Math.min(step, 3)]}%` }} /></div></div>
      <ol className="hidden grid-cols-6 gap-2 lg:grid">
        {STEPS.map((key, index) => (
          <li
            key={key}
            className={`relative rounded-2xl border px-3 py-3 text-center text-xs font-bold transition ${
              index === step
                ? 'border-rc-blue/50 bg-rc-blue/15 text-rc-blue'
                : index < step
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-100 bg-slate-50 text-slate-400'
            }`}
          >
            <span className={`mx-auto mb-2 grid size-8 place-items-center rounded-full ${index < step ? 'bg-emerald-500 text-white' : index === step ? 'bg-sky-600 text-white' : 'bg-white text-slate-400'}`}>{index < step ? '✓' : index + 1}</span>{t(`team.steps.${key}`, { defaultValue: key === 'invoice' ? 'صدور صورتحساب' : key === 'payment' ? 'پرداخت و ثبت نهایی' : key })}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div><Input label={t('team.nameFa')} required value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} error={nameAvailability === 'taken' ? 'تیم دیگری با این نام در این لیگ وجود دارد.' : nameAvailability === 'error' ? 'بررسی نام تیم انجام نشد؛ دوباره تلاش کنید.' : undefined} />{nameAvailability === 'checking' ? <p className="mt-1.5 text-xs text-slate-500">در حال بررسی نام تیم…</p> : nameAvailability === 'available' ? <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-emerald-600"><span aria-hidden>✓</span> این نام قابل استفاده است.</p> : null}</div>
          <Input label={t('team.nameEn')} required value={draft.nameEn} onChange={(e) => patchDraft({ nameEn: e.target.value })} dir="ltr" />
          <Input label={t('team.mottoFa')} value={draft.mottoFa} onChange={(e) => patchDraft({ mottoFa: e.target.value })} />
          <Input label={t('team.mottoEn')} value={draft.mottoEn} onChange={(e) => patchDraft({ mottoEn: e.target.value })} dir="ltr" />
          <Select
            label={t('team.league')}
            required
            value={draft.leagueId}
            onChange={(e) => patchDraft({ leagueId: e.target.value })}
            disabled={Boolean(initialLeagueId)}
          >
            <option value="">{t('team.selectLeague')}</option>
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </Select>
          <Input
            label={t('team.province')}
            value={draft.province}
            onChange={(e) => patchDraft({ province: e.target.value })}
          />
          <Input
            label={t('team.city')}
            value={draft.city}
            onChange={(e) => patchDraft({ city: e.target.value })}
          />
          <p className="md:col-span-2 rounded-2xl bg-sky-50 p-4 text-sm leading-7 text-sky-800">اطلاعات سرپرست، مربی و اعضا در مرحله بعد به‌عنوان اشخاص وابسته به همین تیم ثبت می‌شود؛ برای آن‌ها حساب کاربری ساخته نمی‌شود.</p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          {draft.members.map((member, index) => {
            const age = ageFromBirthDate(member.birth_date)
            return (
              <article
                key={index}
                className={`overflow-hidden rounded-2xl border bg-white transition ${openMemberIndex === index ? 'border-sky-300 shadow-sm ring-4 ring-sky-50' : 'border-slate-200'}`}
              >
                <div className="flex items-center gap-3 border-b border-slate-100 p-4"><button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setOpenMemberIndex((current) => current === index ? null : index)} aria-expanded={openMemberIndex === index}><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-sky-50 font-black text-sky-700">{member.photo_url ? <img src={member.photo_url} alt="" className="size-full object-cover" /> : index + 1}</span><span className="min-w-0"><strong className="block truncate text-slate-900">{member.first_name || member.last_name ? `${member.first_name} ${member.last_name}` : `فرد ${index + 1}`}</strong><small className="mt-1 block text-slate-500">{roleLabel(member.role)}{age != null ? ` · ${age.toLocaleString('fa-IR')} سال` : ' · سن وارد نشده'}</small></span><span className="ms-auto text-slate-400" aria-hidden="true">{openMemberIndex === index ? '▲' : '▼'}</span></button>{draft.members.length > 1 ? <button type="button" onClick={() => removeMemberAt(index)} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">حذف</button> : null}</div>
                {openMemberIndex === index ? <div className="grid gap-3 p-4 md:grid-cols-2">
                  <Input
                    label={t('team.memberFirstNameFa')}
                    required
                    value={member.first_name}
                    onChange={(e) => patchMember(index, { first_name: e.target.value })}
                  />
                  <Input
                    label={t('team.memberLastNameFa')}
                    required
                    value={member.last_name}
                    onChange={(e) => patchMember(index, { last_name: e.target.value })}
                  />
                  <Input label={t('team.memberFirstNameEn')} required value={member.first_name_en} onChange={(e) => patchMember(index, { first_name_en: e.target.value })} dir="ltr" />
                  <Input label={t('team.memberLastNameEn')} required value={member.last_name_en} onChange={(e) => patchMember(index, { last_name_en: e.target.value })} dir="ltr" />
                  <Select
                    label={t('team.memberRole')}
                    value={member.role}
                    onChange={(e) => patchMember(index, { role: e.target.value })}
                  >
                    <option value="captain">{t('team.roles.captain')}</option>
                    <option value="coach">مربی</option>
                    <option value="member">{t('team.roles.member')}</option>
                  </Select>
                  <Input label="نام پدر فارسی" required value={member.father_name_fa} onChange={(e) => patchMember(index, { father_name_fa: e.target.value })} />
                  <Input label="نام پدر انگلیسی" required value={member.father_name_en} onChange={(e) => patchMember(index, { father_name_en: e.target.value })} dir="ltr" />
                  {['captain', 'coach'].includes(member.role) ? <Input label="شماره موبایل" required value={member.phone} onChange={(e) => patchMember(index, { phone: e.target.value })} dir="ltr" /> : null}
                  <Select label="کشور" required value={member.country_code} onChange={(e) => patchMember(index, { country_code: e.target.value, is_foreign: e.target.value !== 'IR', nationality: e.target.value === 'IR' ? 'ایرانی' : 'اتباع' })}><option value="IR">ایران</option><option value="AF">افغانستان</option><option value="IQ">عراق</option><option value="OTHER">سایر</option></Select>
                  {member.country_code === 'IR' ? <Select label="تابعیت" required value={member.nationality || 'ایرانی'} onChange={(e) => patchMember(index, { nationality: e.target.value })}><option value="ایرانی">ایرانی</option><option value="اتباع">اتباع</option></Select> : null}
                  {member.is_foreign ? <Input label="شماره گذرنامه" required value={member.passport_number} onChange={(e) => patchMember(index, { passport_number: e.target.value })} dir="ltr" /> : <Input label={t('team.memberNationalId')} required value={member.national_id} onChange={(e) => patchMember(index, { national_id: e.target.value })} dir="ltr" />}
                  <Input label="استان" value={member.province} onChange={(e) => patchMember(index, { province: e.target.value })} /><Input label="شهر" value={member.city} onChange={(e) => patchMember(index, { city: e.target.value })} />
                  <Input label="محل سکونت" required value={member.residence} onChange={(e) => patchMember(index, { residence: e.target.value })} />
                  <BirthDateField label={t('team.memberBirthDate')} value={member.birth_date} onChange={(date) => patchMember(index, { birth_date: date ?? '' })} minAge={selectedLeague?.min_age ?? 3} maxAge={selectedLeague?.max_age ?? 100} />
                  <Input
                    label={t('team.memberAge')}
                    value={age == null ? '' : String(age)}
                    readOnly
                    dir="ltr"
                  />
                  {(selectedLeague?.min_age != null || selectedLeague?.max_age != null) ? (
                    <p className="self-end rounded-xl border border-rc-blue/20 bg-rc-blue/5 px-3 py-2 text-xs text-rc-muted">
                      {t('team.allowedAge', { min: selectedLeague.min_age ?? '—', max: selectedLeague.max_age ?? '—' })}
                    </p>
                  ) : null}
                  <Select label={age != null && age < 18 ? 'مقطع تحصیلی فعلی' : 'آخرین مدرک تحصیلی'} required value={member.education_level} onChange={(e) => patchMember(index, { education_level: e.target.value })}><option value="">انتخاب کنید</option>{age != null && age < 18 ? <><option value="primary">ابتدایی</option><option value="middle_school">متوسطه اول</option><option value="high_school">متوسطه دوم</option></> : <><option value="high_school">دیپلم</option><option value="associate">کاردانی</option><option value="bachelor">کارشناسی</option><option value="master">کارشناسی ارشد</option><option value="doctorate">دکتری</option></>}</Select>
                  <Input label="رشته تحصیلی" value={member.field_of_study} onChange={(e) => patchMember(index, { field_of_study: e.target.value })} />
                  <MemberIdentityUpload label="تصویر چهره" file={photoFiles[index]} storedUrl={member.photo_url} busy={busy} onChange={(file) => setPhotoFiles((prev) => ({ ...prev, [index]: file }))} />
                  <MemberIdentityUpload label={t('team.memberNationalIdCard')} file={idFiles[index]} storedUrl={member.national_id_doc_path} busy={busy} onChange={(file) => setIdFiles((prev) => ({ ...prev, [index]: file }))} />
                </div> : null}
              </article>
            )
          })}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                { const nextIndex = draft.members.length; patchDraft({ members: [...draft.members, emptyMemberDraft('member')] }); setOpenMemberIndex(nextIndex) }
              }
            >
              {t('team.addMember')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpenMemberIndex(null)}>جمع‌کردن همه</Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-sky-100 bg-sky-50/40 p-5"><div className="mb-4"><h3 className="font-black text-slate-900">مدارک مربوط به تیم</h3><p className="mt-1 text-xs leading-6 text-slate-600">فقط مدارکی که مدیریت برای ثبت‌نام تیم فعال کرده است نمایش داده می‌شوند. لوگوی تیم می‌تواند اختیاری باشد یا از پنل کاملاً غیرفعال شود.</p></div>
            {teamDocTypes.length ? <form className="grid gap-4 lg:grid-cols-[minmax(12rem,.65fr)_minmax(0,1fr)_auto] lg:items-end" onSubmit={(e) => void onUpload(e)}><Select label="نوع مدرک تیم" value={teamDocType} onChange={(e) => setTeamDocType(e.target.value)}>{teamDocTypes.map((type) => <option key={type.id} value={type.code}>{i18n.language.startsWith('en') ? type.label_en : type.label_fa}{type.is_required ? ' *' : ' (اختیاری)'}</option>)}</Select><DocumentUploadField label={teamDocTypes.find((type) => type.code === teamDocType)?.label_fa ?? 'فایل تیم'} required={teamDocTypes.find((type) => type.code === teamDocType)?.is_required} value={teamFilePreview} busy={fileBusy} onSelect={setTeamFile} onRemove={() => setTeamFile(null)} /><Button type="submit" disabled={fileBusy || !draft.teamId || !teamFile}>{fileBusy ? t('app.loading') : 'بارگذاری مدرک'}</Button></form> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">برای این لیگ مدرک اضافه‌ای از تیم درخواست نشده است؛ می‌توانید به مرحله بعد بروید.</div>}
            {teamOnlyDocs.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{teamOnlyDocs.map((doc) => <article key={doc.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><PrivateImage path={doc.file_path} alt={doc.doc_type} onOpen={setViewerUrl} /><div className="p-3"><strong className="block text-sm text-slate-800">{teamDocTypes.find((type) => type.code === doc.doc_type)?.label_fa ?? doc.doc_type}</strong><span className="mt-1 block truncate font-mono text-[10px] text-slate-400" dir="ltr">{doc.file_path.split('/').pop()}</span></div></article>)}</div> : null}
          </section>
          <section><div className="mb-4"><h3 className="font-black text-slate-900">مدارک هویتی افراد تیم</h3><p className="mt-1 text-xs leading-6 text-slate-500">اطلاعاتی که در مرحله اعضا ثبت کردید اینجا برای کنترل نهایی نمایش داده می‌شود. برای بزرگ‌نمایی روی هر تصویر بزنید.</p></div><div className="grid gap-4 md:grid-cols-2">{draft.members.map((member, index) => <article key={`${member.full_name}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><div className="size-14 overflow-hidden rounded-xl bg-slate-100">{member.photo_url ? <button type="button" onClick={() => setViewerUrl(member.photo_url!)}><img src={member.photo_url} alt={member.full_name} className="size-14 object-cover" /></button> : <span className="grid size-full place-items-center text-lg font-black text-slate-400">{(member.first_name || member.full_name).slice(0, 1)}</span>}</div><div className="min-w-0"><strong className="block truncate text-slate-900">{member.first_name} {member.last_name}</strong><span className="mt-1 inline-flex rounded-md bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">{roleLabel(member.role)}</span></div></div><div className="grid grid-cols-2 gap-px bg-slate-100"><div className="bg-white p-3"><span className="mb-2 block text-[10px] font-bold text-slate-400">تصویر پرسنلی</span>{member.photo_url ? <button type="button" onClick={() => setViewerUrl(member.photo_url!)} className="w-full"><img src={member.photo_url} alt="تصویر پرسنلی" className="aspect-[4/3] w-full rounded-lg object-cover" /></button> : <span className="grid aspect-[4/3] place-items-center rounded-lg bg-slate-50 text-xs text-slate-400">ثبت نشده</span>}</div><div className="bg-white p-3"><span className="mb-2 block text-[10px] font-bold text-slate-400">کارت ملی / مدرک هویت</span><PrivateImage path={member.national_id_doc_path} alt="مدرک هویت" onOpen={setViewerUrl} /></div></div></article>)}</div></section>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-5 text-sm">
          <header className="rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50 to-emerald-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black text-sky-700">بازبینی پیش از صدور صورتحساب</p><h3 className="mt-1 text-xl font-black text-slate-900">اطلاعات تیم را یک‌بار کنترل کنید</h3><p className="mt-2 text-xs leading-6 text-slate-600">پس از تأیید، صورتحساب بر اساس تعداد و نقش افراد ساخته می‌شود.</p></div><StatusBadge status="under_review" label="در انتظار اقدام شما" /></div></header>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><span className="text-xs font-bold text-slate-400">مجموعه</span><h4 className="mt-1 text-lg font-black text-slate-900">{companyName}</h4></div><div className="p-5"><div className="flex items-center justify-between gap-3"><div><span className="text-xs font-bold text-sky-700">تیم ۱</span><h4 className="mt-1 font-black text-slate-900">{draft.name} <span className="font-medium text-slate-400" dir="ltr">/ {draft.nameEn}</span></h4><p className="mt-1 text-xs text-slate-500">{selectedLeague?.name ?? '—'}</p></div><span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{draft.members.length.toLocaleString('fa-IR')} نفر</span></div><div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">{draft.members.map((member, index) => <div key={index} className="flex items-center gap-3 p-3"><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-sky-50 font-black text-sky-700">{member.photo_url ? <img src={member.photo_url} alt="" className="size-full object-cover" /> : (member.first_name || member.full_name).slice(0, 1)}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{member.first_name} {member.last_name}</strong><small className="text-slate-500">{roleLabel(member.role)}</small></span><span className="text-xs font-bold text-emerald-600">اطلاعات کامل ✓</span></div>)}</div></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><p className="font-black text-slate-900">برآورد مبلغ ورودی لیگ</p><p className="mt-1 text-xs text-slate-500">مبلغ نهایی بر اساس نقش افراد محاسبه شده است.</p></div><span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">وضعیت پرداخت: صورتحساب صادر نشده</span></div><div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
              <span>{t('team.entryFee')}: {Number(selectedLeague?.registration_fee ?? 0).toLocaleString('fa-IR')} {t('payment.rial', { defaultValue: 'ریال' })}</span>
              <span>{t('team.captainFee')}: {Number(selectedLeague?.captain_fee ?? 0).toLocaleString('fa-IR')} {t('payment.rial', { defaultValue: 'ریال' })}</span>
              <span>هزینه مربی: {draft.members.filter((m) => m.role === 'coach').length} × {Number(selectedLeague?.coach_fee ?? 0).toLocaleString('fa-IR')} ریال</span>
              <span>{t('team.memberFees')}: {draft.members.filter((m) => m.role === 'member').length} × {Number(selectedLeague?.member_fee ?? 0).toLocaleString('fa-IR')} {t('payment.rial', { defaultValue: 'ریال' })}</span>
              <strong className="mt-2 border-t border-slate-200 pt-3 text-base text-slate-900">مبلغ قابل پرداخت: {(Number(selectedLeague?.registration_fee ?? 0) + Number(selectedLeague?.captain_fee ?? 0) + draft.members.filter((m) => m.role === 'coach').length * Number(selectedLeague?.coach_fee ?? 0) + draft.members.filter((m) => m.role === 'member').length * Number(selectedLeague?.member_fee ?? 0)).toLocaleString('fa-IR')} ریال</strong></div></section>
          <aside className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-400 font-black text-white" aria-hidden="true">!</span><div><strong className="block">ثبت‌نام هنوز قطعی نشده است</strong><p className="mt-1 text-xs leading-6 text-amber-900">با تأیید این مرحله فقط صورتحساب صادر می‌شود. ثبت‌نام تیم زمانی کامل و قطعی خواهد شد که مبلغ ورودی لیگ پرداخت و پرداخت شما تأیید شود.</p></div></aside>
        </div>
      ) : null}

      {viewerUrl ? <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerUrl('') }}><div className="relative max-h-[90dvh] max-w-4xl overflow-hidden rounded-2xl bg-white p-2 shadow-2xl"><button type="button" onClick={() => setViewerUrl('')} className="absolute end-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-slate-950/70 text-xl text-white">×</button><img src={viewerUrl} alt="نمایش بزرگ مدرک" className="max-h-[86dvh] max-w-full rounded-xl object-contain" /></div></div> : null}

      <FieldError message={error ?? undefined} />

      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white/95 p-3 shadow-lg backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={goBack} disabled={busy}>
            {t('team.back')}
          </Button>
        ) : null}
        {step < EDITABLE_STEPS - 1 ? (
          <Button type="button" onClick={() => void goNext()} disabled={busy || (step === 0 && nameAvailability !== 'available')}>
            {busy ? t('app.loading') : t('team.next')}
          </Button>
        ) : (
          <Button type="button" onClick={() => void finish()} disabled={busy}>
            {busy ? t('app.loading') : t('team.issueInvoice')}
          </Button>
        )}
      </div></div>
    </div>
  )
}
