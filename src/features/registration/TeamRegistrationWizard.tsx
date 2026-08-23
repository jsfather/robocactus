import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
  createCaptainInvite,
  createDraftTeam,
  emptyMemberDraft,
  emptyTeamDraft,
  fetchTeamDocuments,
  fetchTeamMembers,
  loadTeamDraft,
  replaceTeamMembers,
  resolveCaptainId,
  saveTeamDraft,
  updateDraftTeam,
  uploadMemberNationalId,
  uploadTeamDocument,
  type TeamMemberDraft,
  type TeamWizardDraft,
} from '@/features/registration/api'
import type { DocumentRow, League, Team } from '@/types/database'

const STEPS = ['info', 'members', 'documents', 'review'] as const

interface TeamRegistrationWizardProps {
  companyId: string
  initialLeagueId?: string
  onCompleted: (team: Team) => void
  onCancel: () => void
}

export function TeamRegistrationWizard({
  companyId,
  initialLeagueId,
  onCompleted,
  onCancel,
}: TeamRegistrationWizardProps) {
  const { t } = useTranslation()
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

  useEffect(() => {
    void fetchActiveLeagues().then(setLeagues).catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    saveTeamDraft(draft)
  }, [draft])

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
    const { captainId, alreadyRegistered } = await resolveCaptainId(
      companyId,
      draft.captainPhone,
      draft.captainNameHint,
    )

    const memberCount = draft.members.filter((m) => (m.first_name || m.full_name).trim()).length

    if (draft.teamId) {
      await updateDraftTeam(draft.teamId, {
        name: draft.name.trim(),
        province: draft.province.trim(),
        city: draft.city.trim(),
        league_id: draft.leagueId,
        captain_id: captainId,
        member_count: memberCount,
      })
      if (!alreadyRegistered) {
        await createCaptainInvite({
          companyId,
          teamId: draft.teamId,
          phone: draft.captainPhone,
          fullNameHint: draft.captainNameHint,
          invitedBy: user.id,
        })
      }
      return draft.teamId
    }

    const team = await createDraftTeam({
      companyId,
      leagueId: draft.leagueId,
      name: draft.name.trim(),
      province: draft.province.trim(),
      city: draft.city.trim(),
      captainId,
      memberCount,
    })

    if (!alreadyRegistered) {
      await createCaptainInvite({
        companyId,
        teamId: team.id,
        phone: draft.captainPhone,
        fullNameHint: draft.captainNameHint,
        invitedBy: user.id,
      })
    }

    patchDraft({ teamId: team.id })
    return team.id
  }

  const saveMembersWithIdCards = async (teamId: string) => {
    if (!user) throw new Error('not authenticated')
    const saved = await replaceTeamMembers(teamId, draft.members)
    const nextMembers = [...draft.members]

    for (let i = 0; i < saved.length; i++) {
      const file = idFiles[i]
      if (!file) continue
      const updated = await uploadMemberNationalId({
        userId: user.id,
        teamId,
        memberId: saved[i].id,
        file,
      })
      if (nextMembers[i]) {
        nextMembers[i] = {
          ...nextMembers[i],
          national_id_doc_path: updated.national_id_doc_path ?? undefined,
        }
      }
    }

    patchDraft({ members: nextMembers })
    setIdFiles({})
    return fetchTeamMembers(teamId)
  }

  const goNext = async () => {
    setError(null)
    setBusy(true)
    try {
      if (step === 0) {
        if (!draft.name.trim() || !draft.leagueId || !draft.captainPhone.trim()) {
          throw new Error(t('auth.required'))
        }
        await ensureTeamRecord()
      }
      if (step === 1) {
        const incomplete = draft.members.some(
          (m) =>
            (m.first_name || m.last_name || m.full_name).trim() &&
            (!m.first_name.trim() || !m.last_name.trim() || !m.birth_date || !m.role),
        )
        if (incomplete) throw new Error(t('auth.required'))
        const teamId = await ensureTeamRecord()
        await saveMembersWithIdCards(teamId)
      }
      if (step === 2) {
        await ensureTeamRecord()
      }
      patchDraft({ step: Math.min(step + 1, STEPS.length - 1) })
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
    <div className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('team.wizardTitle')}</h2>
          <p className="text-sm text-rc-muted">{t('team.wizardHint')}</p>
        </div>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((key, index) => (
          <li
            key={key}
            className={`rounded-md border px-3 py-1 font-mono text-xs ${
              index === step
                ? 'border-rc-blue/50 bg-rc-blue/15 text-rc-blue'
                : index < step
                  ? 'border-emerald-500/30 text-emerald-300'
                  : 'border-white/10 text-rc-muted'
            }`}
          >
            {index + 1}. {t(`team.steps.${key}`)}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={t('team.name')}
            required
            value={draft.name}
            onChange={(e) => patchDraft({ name: e.target.value })}
          />
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
          <Input
            label={t('team.captainPhone')}
            required
            value={draft.captainPhone}
            onChange={(e) => patchDraft({ captainPhone: e.target.value })}
            dir="ltr"
            placeholder="09xxxxxxxxx"
          />
          <Input
            label={t('team.captainName')}
            value={draft.captainNameHint}
            onChange={(e) => patchDraft({ captainNameHint: e.target.value })}
          />
          <p className="md:col-span-2 text-xs text-rc-muted">{t('team.captainInviteHint')}</p>
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
                    label={t('team.memberFirstName')}
                    required
                    value={member.first_name}
                    onChange={(e) => patchMember(index, { first_name: e.target.value })}
                  />
                  <Input
                    label={t('team.memberLastName')}
                    required
                    value={member.last_name}
                    onChange={(e) => patchMember(index, { last_name: e.target.value })}
                  />
                  <Select
                    label={t('team.memberRole')}
                    value={member.role === 'captain' ? 'captain' : 'member'}
                    onChange={(e) => patchMember(index, { role: e.target.value })}
                  >
                    <option value="captain">{t('team.roles.captain')}</option>
                    <option value="member">{t('team.roles.member')}</option>
                  </Select>
                  <Input
                    label={t('team.memberNationalId')}
                    value={member.national_id}
                    onChange={(e) => patchMember(index, { national_id: e.target.value })}
                    dir="ltr"
                  />
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
                  <Input
                    label={t('team.memberEducation')}
                    value={member.education}
                    onChange={(e) => patchMember(index, { education: e.target.value })}
                  />
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
            {draft.name}
          </p>
          <p>
            <span className="text-rc-muted">{t('team.league')}: </span>
            {selectedLeague?.name ?? '—'}
          </p>
          <p>
            <span className="text-rc-muted">{t('team.captainPhone')}: </span>
            <span className="font-mono" dir="ltr">
              {draft.captainPhone}
            </span>
          </p>
          <p>
            <span className="text-rc-muted">{t('team.membersCount')}: </span>
            {draft.members.filter((m) => (m.first_name || m.full_name).trim()).length}
          </p>
          <p>
            <span className="text-rc-muted">{t('team.docsCount')}: </span>
            {docs.length}
          </p>
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
            {t('team.paymentLater')}
          </p>
          {draft.teamId ? (
            <Link
              to={`/payments/teams/${draft.teamId}`}
              className="inline-flex rounded-md bg-rc-accent px-4 py-2 text-sm font-medium text-rc-bg hover:brightness-110"
            >
              {t('payment.payCta')}
            </Link>
          ) : null}
        </div>
      ) : null}

      <FieldError message={error ?? undefined} />

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={goBack} disabled={busy}>
            {t('team.back')}
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => void goNext()} disabled={busy}>
            {busy ? t('app.loading') : t('team.next')}
          </Button>
        ) : (
          <Button type="button" onClick={() => void finish()} disabled={busy}>
            {busy ? t('app.loading') : t('team.finish')}
          </Button>
        )}
      </div>
    </div>
  )
}
