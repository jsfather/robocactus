import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  FieldError,
  Input,
  Select,
  StatusBadge,
} from '@/components/ui/FormControls'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { useAuth } from '@/hooks/useAuth'
import { fetchActiveLeagues } from '@/features/companies/api'
import { ageFromBirthDate, toDateOnly } from '@/lib/dates'
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
import type { DocumentRow, League, Team } from '@/types/database'

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

  const ensureTeamRecord = async (): Promise<string> => {
    if (!user) throw new Error('not authenticated')
    // `captain_id` remains the owning account for authorization. The actual
    // captain is stored as a dependent team_member and never gets an Account.
    const captainId = user.id

    const memberCount = draft.members.filter((m) => (m.first_name || m.full_name).trim()).length

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
        persistedTeamId = await ensureTeamRecord()
      }
      const nextStep = Math.min(step + 1, EDITABLE_STEPS - 1)
      const teamId = persistedTeamId
      const nextDraft = { ...draft, teamId: teamId ?? draft.teamId, step: nextStep }
      patchDraft({ teamId: teamId ?? draft.teamId, step: nextStep })
      if (teamId) await persistRegistrationDraft(teamId, nextDraft, { ...registrationLifecycleForStep(nextStep), lastCompletedStep: step })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
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

    const form = event.currentTarget
    const formData = new FormData(form)
    const file = formData.get('file') as File | null
    const docType = String(formData.get('docType') || 'other')

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
      form.reset()
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
          <Input
            label={t('team.nameFa')}
            required
            value={draft.name}
            onChange={(e) => patchDraft({ name: e.target.value })}
          />
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
              <div
                key={index}
                className="space-y-3 rounded-lg border border-white/10 p-3"
              >
                <div className="grid gap-3 md:grid-cols-2">
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
                  <Select label="کشور" required value={member.country_code} onChange={(e) => patchMember(index, { country_code: e.target.value, is_foreign: e.target.value !== 'IR' })}><option value="IR">ایران</option><option value="AF">افغانستان</option><option value="IQ">عراق</option><option value="OTHER">سایر</option></Select>
                  <Input label="تابعیت" required value={member.nationality} onChange={(e) => patchMember(index, { nationality: e.target.value })} />
                  {member.is_foreign ? <Input label="شماره گذرنامه" required value={member.passport_number} onChange={(e) => patchMember(index, { passport_number: e.target.value })} dir="ltr" /> : <Input label={t('team.memberNationalId')} required value={member.national_id} onChange={(e) => patchMember(index, { national_id: e.target.value })} dir="ltr" />}
                  <Input label="استان" value={member.province} onChange={(e) => patchMember(index, { province: e.target.value })} /><Input label="شهر" value={member.city} onChange={(e) => patchMember(index, { city: e.target.value })} />
                  <Input label="محل سکونت" required value={member.residence} onChange={(e) => patchMember(index, { residence: e.target.value })} />
                  <DateTimeField
                    label={t('team.memberBirthDate')}
                    withTime={false}
                    value={
                      member.birth_date
                        ? member.birth_date.length === 10
                          ? `${member.birth_date}T12:00:00.000Z`
                          : member.birth_date
                        : null
                    }
                    onChange={(iso) =>
                      patchMember(index, { birth_date: toDateOnly(iso) ?? '' })
                    }
                  />
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
                  <Select label={age != null && age < 18 ? 'مقطع تحصیلی' : 'آخرین مدرک تحصیلی'} required value={member.education_level} onChange={(e) => patchMember(index, { education_level: e.target.value })}><option value="">انتخاب کنید</option><option value="primary">ابتدایی</option><option value="middle_school">متوسطه اول</option><option value="high_school">دیپلم</option><option value="associate">کاردانی</option><option value="bachelor">کارشناسی</option><option value="master">کارشناسی ارشد</option><option value="doctorate">دکتری</option></Select>
                  <Input label="رشته تحصیلی" value={member.field_of_study} onChange={(e) => patchMember(index, { field_of_study: e.target.value })} />
                  <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-600">تصویر چهره <b className="text-rose-500">*</b></span><input type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(e) => setPhotoFiles((prev) => ({ ...prev, [index]: e.target.files?.[0] ?? null }))} />{(photoFiles[index] || member.photo_url) ? <span className="text-xs font-bold text-emerald-600">آماده بارگذاری</span> : null}</label>
                  <label className="block space-y-1.5">
                    <span className="text-sm text-rc-muted">{t('team.memberNationalIdCard')}</span>
                    <input
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      className="block w-full text-sm text-rc-muted file:me-3 file:rounded-md file:border-0 file:bg-rc-blue/15 file:px-3 file:py-2 file:text-rc-blue"
                      onChange={(e) =>
                        setIdFiles((prev) => ({
                          ...prev,
                          [index]: e.target.files?.[0] ?? null,
                        }))
                      }
                    />
                    {(idFiles[index] || member.national_id_doc_path) && (
                      <span className="font-mono text-[10px] text-emerald-400">
                        {idFiles[index]?.name ?? t('team.docUploaded')}
                      </span>
                    )}
                  </label>
                </div>
              </div>
            )
          })}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                patchDraft({
                  members: [...draft.members, emptyMemberDraft('member')],
                })
              }
            >
              {t('team.addMember')}
            </Button>
            {draft.members.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => patchDraft({ members: draft.members.slice(0, -1) })}
              >
                {t('team.removeMember')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={(e) => void onUpload(e)}>
            <Select label={t('team.docType')} name="docType" defaultValue="team_photo">
              <option value="team_photo">{t('team.docTypes.team_photo')}</option>
              <option value="commitment">{t('team.docTypes.commitment')}</option>
              <option value="id_card">{t('team.docTypes.id_card')}</option>
              <option value="other">{t('team.docTypes.other')}</option>
            </Select>
            <label className="block space-y-1.5">
              <span className="text-sm text-rc-muted">{t('team.docFile')}</span>
              <input
                type="file"
                name="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="block w-full text-sm text-rc-muted file:me-3 file:rounded-md file:border-0 file:bg-rc-blue/15 file:px-3 file:py-2 file:text-rc-blue"
              />
            </label>
            <Button type="submit" variant="secondary" disabled={fileBusy || !draft.teamId}>
              {fileBusy ? t('app.loading') : t('team.upload')}
            </Button>
          </form>
          <p className="text-xs text-rc-muted">{t('team.docHint')}</p>
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2 text-sm"
              >
                <span>{t(`team.docTypes.${doc.doc_type}`, { defaultValue: doc.doc_type })}</span>
                <span className="font-mono text-xs text-rc-muted">{doc.file_path.split('/').pop()}</span>
              </li>
            ))}
            {!docs.length ? <li className="text-sm text-rc-muted">{t('team.noDocs')}</li> : null}
          </ul>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-rc-muted">{t('team.status')}:</span>
            <StatusBadge status="draft" label={t('team.statuses.draft')} />
          </div>
          <p>
            <span className="text-rc-muted">{t('team.name')}: </span>
            {draft.name} / {draft.nameEn}
          </p>
          <p>
            <span className="text-rc-muted">{t('team.league')}: </span>
            {selectedLeague?.name ?? '—'}
          </p>
          <p>
            <span className="text-rc-muted">{t('team.membersCount')}: </span>
            {draft.members.filter((m) => (m.first_name || m.full_name).trim()).length}
          </p>
          <p>
            <span className="text-rc-muted">{t('team.docsCount')}: </span>
            {docs.length}
          </p>
          <div className="rounded-xl border border-rc-blue/20 bg-rc-blue/5 p-4">
            <p className="font-bold">{t('team.costEstimate')}</p>
            <div className="mt-2 grid gap-1 text-xs text-rc-muted">
              <span>{t('team.entryFee')}: {Number(selectedLeague?.registration_fee ?? 0).toLocaleString('fa-IR')} {t('payment.rial', { defaultValue: 'ریال' })}</span>
              <span>{t('team.captainFee')}: {Number(selectedLeague?.captain_fee ?? 0).toLocaleString('fa-IR')} {t('payment.rial', { defaultValue: 'ریال' })}</span>
              <span>هزینه مربی: {draft.members.filter((m) => m.role === 'coach').length} × {Number(selectedLeague?.coach_fee ?? 0).toLocaleString('fa-IR')} ریال</span>
              <span>{t('team.memberFees')}: {draft.members.filter((m) => m.role === 'member').length} × {Number(selectedLeague?.member_fee ?? 0).toLocaleString('fa-IR')} {t('payment.rial', { defaultValue: 'ریال' })}</span>
              <strong className="mt-2 text-sm text-rc-text">{t('team.finalAmount')}: {(Number(selectedLeague?.registration_fee ?? 0) + Number(selectedLeague?.captain_fee ?? 0) + draft.members.filter((m) => m.role === 'coach').length * Number(selectedLeague?.coach_fee ?? 0) + draft.members.filter((m) => m.role === 'member').length * Number(selectedLeague?.member_fee ?? 0)).toLocaleString('fa-IR')} ریال</strong>
            </div>
          </div>
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
            {t('team.paymentLater')}
          </p>
          <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold leading-7 text-emerald-800">{t('team.invoiceAfterConfirm')}</p>
        </div>
      ) : null}

      <FieldError message={error ?? undefined} />

      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white/95 p-3 shadow-lg backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={goBack} disabled={busy}>
            {t('team.back')}
          </Button>
        ) : null}
        {step < EDITABLE_STEPS - 1 ? (
          <Button type="button" onClick={() => void goNext()} disabled={busy}>
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
