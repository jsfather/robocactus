import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  FieldError,
  Input,
  PanelCard,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { PanelPage } from '@/components/layout/PanelShell'
import { fetchActiveLeagues } from '@/features/companies/api'
import { TicketInbox } from '@/features/chat/TicketInbox'
import {
  fetchMyLeagueIds,
  fetchTeamDocuments,
  fetchTeamResult,
  fetchMyJudgeScore,
  fetchJudgeProgress,
  saveJudgeScore,
  publishOfficialTeamResult,
  fetchTeamsForReview,
  getDocumentSignedUrl,
  reviewTeam,
} from '@/features/judging/api'
import {
  fetchTeamMembers,
  reviewTeamMember,
} from '@/features/registration/api'
import { setLeagueResultsStatus } from '@/features/live-results/api'
import { ageFromBirthDate, formatAppDate, formatAppDateTime } from '@/lib/dates'
import { useToast } from '@/components/ui/Toast'
import { dispatchPendingSms } from '@/features/notifications/api'
import type { DocumentRow, JudgeSubmissionProgress, League, RegistrationStatus, Team, TeamMember } from '@/types/database'

export function LeagueAdminPage({ section = 'review' }: { section?: 'review' | 'tickets' }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { user, profile } = useAuth()
  const [leagueIds, setLeagueIds] = useState<string[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [rejectReason, setRejectReason] = useState('')
  const [memberRejectReason, setMemberRejectReason] = useState('')
  const [rank, setRank] = useState('')
  const [score, setScore] = useState('')
  const [criterionScores, setCriterionScores] = useState<Record<string, number>>({})
  const [judgeStatus, setJudgeStatus] = useState<'draft' | 'submitted' | null>(null)
  const [judgeProgress, setJudgeProgress] = useState<JudgeSubmissionProgress | null>(null)
  const [notes, setNotes] = useState('')
  const [seasonYear, setSeasonYear] = useState(String(new Date().getFullYear()))
  const [resultPublishedAt, setResultPublishedAt] = useState<string | null>(null)
  const [showResultPreview, setShowResultPreview] = useState(false)
  const [resultUpdatedAt, setResultUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const tab = section

  const selected = useMemo(
    () => teams.find((x) => x.id === selectedId) ?? null,
    [teams, selectedId],
  )
  const selectedLeague = useMemo(() => leagues.find((league) => league.id === selected?.league_id) ?? null, [leagues, selected?.league_id])
  const scoringCriteria = selectedLeague?.scoring_rows?.length ? selectedLeague.scoring_rows : [{ label: 'امتیاز کل', points: '100' }]

  const reload = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const ids =
        profile?.role === 'super_admin'
          ? (await fetchActiveLeagues()).map((l) => l.id)
          : await fetchMyLeagueIds(user.id)
      setLeagueIds(ids)
      const allLeagues = await fetchActiveLeagues()
      setLeagues(allLeagues.filter((l) => ids.includes(l.id) || profile?.role === 'super_admin'))
      if (ids.length || profile?.role === 'super_admin') {
        const list = await fetchTeamsForReview({
          leagueIds: profile?.role === 'super_admin' ? undefined : ids,
        })
        setTeams(list)
      } else {
        setTeams([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role])

  useEffect(() => {
    if (!selectedId) {
      setDocs([])
      setMembers([])
      setResultPublishedAt(null)
      setShowResultPreview(false)
      setResultUpdatedAt(null)
      return
    }
    void fetchTeamDocuments(selectedId)
      .then(setDocs)
      .catch((err: Error) => setError(err.message))
    void fetchTeamMembers(selectedId)
      .then(setMembers)
      .catch(() => setMembers([]))

    const year = Number(seasonYear) || new Date().getFullYear()
    void Promise.all([fetchTeamResult(selectedId, year), user ? fetchMyJudgeScore(selectedId, year, user.id) : Promise.resolve(null), fetchJudgeProgress(selectedId, year)])
      .then(([row, ownScore, progress]) => {
        setRank(row?.rank != null ? String(row.rank) : '')
        setScore(row?.score != null ? String(row.score) : '')
        setNotes(ownScore?.notes ?? '')
        setCriterionScores(Object.fromEntries(Object.entries(ownScore?.score_payload ?? {}).map(([key, value]) => [key, Number(value) || 0])))
        setJudgeStatus(ownScore?.status ?? null)
        setJudgeProgress(progress)
        setResultPublishedAt(row?.published_at ?? null)
        setResultUpdatedAt(row?.published_at ?? null)
        setShowResultPreview(false)
      })
      .catch(() => undefined)
  }, [selectedId, seasonYear, user])

  const leagueName = (id: string) => leagues.find((l) => l.id === id)?.name ?? id.slice(0, 8)

  const onMemberReview = async (
    memberId: string,
    status: 'approved' | 'rejected' | 'pending',
  ) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await reviewTeamMember(
        memberId,
        status,
        status === 'rejected' ? memberRejectReason : undefined,
      )
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }
  const onReview = async (status: Extract<RegistrationStatus, 'approved' | 'rejected' | 'waitlisted' | 'under_review'>) => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const updated = await reviewTeam({
        teamId: selected.id,
        status,
        rejectionReason: status === 'rejected' ? rejectReason : undefined,
      })
      setTeams((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      void dispatchPendingSms()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onSaveResult = async (publish: boolean) => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const updated = publish
        ? await publishOfficialTeamResult(selected.id, Number(seasonYear))
        : await saveJudgeScore({ teamId: selected.id, seasonYear: Number(seasonYear), scores: criterionScores, notes, submit: false }).then(() => fetchTeamResult(selected.id, Number(seasonYear)))
      if (!updated) throw new Error('نتیجه رسمی هنوز آماده نیست.')
      setResultPublishedAt(updated.published_at ?? null)
      setResultUpdatedAt(new Date().toISOString())
      setShowResultPreview(false)
      toast.success(t(publish ? 'judging.resultPublishedSuccess' : 'judging.resultDraftSuccess'))
      if (publish) void dispatchPendingSms()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onSubmitJudging = async () => {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      await saveJudgeScore({ teamId: selected.id, seasonYear: Number(seasonYear), scores: criterionScores, notes, submit: true })
      setJudgeStatus('submitted')
      setJudgeProgress(await fetchJudgeProgress(selected.id, Number(seasonYear)))
      const official = await fetchTeamResult(selected.id, Number(seasonYear)); setRank(official?.rank != null ? String(official.rank) : ''); setScore(official?.score != null ? String(official.score) : '')
      toast.success('امتیاز مستقل شما نهایی شد.')
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')) } finally { setBusy(false) }
  }

  const onBoardMode = async (leagueId: string, status: string) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await setLeagueResultsStatus(
        leagueId,
        status as 'auto' | 'hidden' | 'live' | 'final',
      )
      setLeagues((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelPage index={tab === 'tickets' ? 'OPS.03' : 'OPS.02'} title={tab === 'tickets' ? t('judging.tabTickets') : t('judging.tabReview')} description={t('judging.subtitle')}>

      <FieldError message={error ?? undefined} />

      {tab === 'review' ? (
        <PanelCard title={t('judging.guideTitle')}>
          <p className="text-sm leading-relaxed text-rc-muted">{t('judging.guideBody')}</p>
        </PanelCard>
      ) : null}

      {tab === 'review' && !loading && leagues.length > 0 ? (
        <PanelCard title={t('liveResults.boardMode')} description={t('liveResults.subtitle')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {leagues
              .filter((l) => profile?.role === 'super_admin' || leagueIds.includes(l.id))
              .map((league) => (
                <Select
                  key={league.id}
                  label={league.name}
                  value={(league.results_status as string) || 'auto'}
                  disabled={busy}
                  onChange={(e) => void onBoardMode(league.id, e.target.value)}
                >
                  <option value="auto">{t('liveResults.modeAuto')}</option>
                  <option value="live">{t('liveResults.modeLive')}</option>
                  <option value="final">{t('liveResults.modeFinal')}</option>
                  <option value="hidden">{t('liveResults.modeHidden')}</option>
                </Select>
              ))}
          </div>
          <p className="mt-2 text-xs text-rc-muted">
            <Link to="/live" className="text-rc-blue hover:underline">
              /live
            </Link>
          </p>
        </PanelCard>
      ) : null}
      {tab === 'tickets' ? (
        leagueIds.length || profile?.role === 'super_admin' ? (
          <TicketInbox
            mode="league"
            leagueIds={profile?.role === 'super_admin' ? undefined : leagueIds}
          />
        ) : (
          <p className="text-sm text-rc-muted">{t('judging.noLeague')}</p>
        )
      ) : loading ? (
        <p className="text-rc-muted">{t('app.loading')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <PanelCard title={t('judging.queue')}>
            <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
              {teams.length === 0 ? (
                <li className="text-sm text-rc-muted">{t('judging.emptyQueue')}</li>
              ) : (
                teams.map((team) => (
                  <li key={team.id}>
                    <button
                      type="button"
                      className={`w-full rounded-md px-3 py-2 text-start text-sm ${
                        selectedId === team.id ? 'bg-rc-blue/15 text-rc-blue' : 'hover:bg-white/5'
                      }`}
                      onClick={() => setSelectedId(team.id)}
                    >
                      <span className="block font-medium">{team.name}</span>
                      <span className="text-xs text-rc-muted">{leagueName(team.league_id)}</span>
                      <div className="mt-1">
                        <StatusBadge
                          status={team.status}
                          label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
                        />
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </PanelCard>

          {selected ? (
            <div className="space-y-4">
              <PanelCard title={selected.name} description={leagueName(selected.league_id)}>
                <div className="mb-3 flex flex-wrap gap-2">
                  <StatusBadge
                    status={selected.status}
                    label={t(`team.statuses.${selected.status}`, { defaultValue: selected.status })}
                  />
                  <Link to={`/team/${selected.id}`} className="text-sm text-rc-blue hover:underline">
                    {t('team.view')}
                  </Link>
                </div>

                <h3 className="mb-2 text-sm font-medium">{t('team.docsTitle')}</h3>
                <ul className="mb-4 space-y-2 text-sm">
                  {docs.length === 0 ? (
                    <li className="text-rc-muted">{t('team.noDocs')}</li>
                  ) : (
                    docs.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-2">
                        <span>{doc.doc_type}</span>
                        <button
                          type="button"
                          className="text-rc-blue hover:underline"
                          onClick={() =>
                            void getDocumentSignedUrl(doc.file_path).then((url) =>
                              window.open(url, '_blank'),
                            )
                          }
                        >
                          {t('judging.openDoc')}
                        </button>
                      </li>
                    ))
                  )}
                </ul>

                <h3 className="mb-2 text-sm font-medium">{t('team.membersTitle')}</h3>
                <div className="mb-3">
                  <Input
                    label={t('team.memberRejectReason')}
                    value={memberRejectReason}
                    onChange={(e) => setMemberRejectReason(e.target.value)}
                  />
                </div>
                <ul className="mb-4 space-y-3">
                  {members.length === 0 ? (
                    <li className="text-sm text-rc-muted">{t('team.noMembers')}</li>
                  ) : (
                    members.map((m) => {
                      const age = ageFromBirthDate(m.birth_date)
                      return (
                        <li
                          key={m.id}
                          className="rounded-lg border border-rc-line/70 bg-rc-surface/40 p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {m.first_name || m.last_name
                                  ? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()
                                  : m.full_name}
                              </p>
                              <p className="mt-1 text-xs text-rc-muted">
                                {m.role === 'coach' ? 'مربی' : t(`team.roles.${m.role === 'captain' ? 'captain' : 'member'}`)}
                                {m.education ? ` · ${m.education}` : ''}
                                {age != null ? ` · ${t('team.memberAge')}: ${age}` : ''}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-rc-muted" dir="ltr">
                                {m.national_id ?? '—'} ·{' '}
                                {formatAppDate(m.birth_date, i18n.language)}
                              </p>
                              <p className="mt-1 font-mono text-[10px] uppercase text-rc-blue">
                                {m.review_status ?? 'pending'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {m.national_id_doc_path ? (
                                <button
                                  type="button"
                                  className="text-xs text-rc-blue hover:underline"
                                  onClick={() =>
                                    void getDocumentSignedUrl(m.national_id_doc_path!).then((url) =>
                                      window.open(url, '_blank'),
                                    )
                                  }
                                >
                                  {t('team.memberNationalIdCard')}
                                </button>
                              ) : null}
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void onMemberReview(m.id, 'approved')}
                              >
                                {t('judging.approve')}
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                disabled={busy}
                                onClick={() => void onMemberReview(m.id, 'rejected')}
                              >
                                {t('judging.reject')}
                              </Button>
                            </div>
                          </div>
                        </li>
                      )
                    })
                  )}
                </ul>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onReview('under_review')}
                  >
                    {t('judging.underReview')}
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void onReview('approved')}>
                    {t('judging.approve')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onReview('waitlisted')}
                  >
                    {t('judging.waitlist')}
                  </Button>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                  <Input
                    label={t('judging.rejectReason')}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    className="self-end"
                    disabled={busy}
                    onClick={() => void onReview('rejected')}
                  >
                    {t('judging.reject')}
                  </Button>
                </div>
              </PanelCard>

              <PanelCard title={t('judging.resultsTitle')} description={t('judging.resultsHint')}>
                <div className="mb-5 grid gap-2 sm:grid-cols-3">
                  <ResultStep index="۱" title={t('judging.workflowScore')} active={!rank && !score} done={Boolean(rank || score)} />
                  <ResultStep index="۲" title={t('judging.workflowPreview')} active={showResultPreview} done={Boolean(resultPublishedAt)} />
                  <ResultStep index="۳" title={t('judging.workflowPublish')} active={Boolean(resultPublishedAt)} done={Boolean(resultPublishedAt)} />
                </div>
                <div className="mb-5 rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50 to-white p-4 text-sm leading-7 text-sky-900">
                  امتیاز شما مستقل از سایر داوران ذخیره می‌شود. پس از نهایی‌کردن، نتیجه رسمی فقط وقتی محاسبه می‌شود که همه داوران الزامی امتیاز خود را ثبت کرده باشند.
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label={t('judging.season')}
                    type="number"
                    value={seasonYear}
                    onChange={(e) => setSeasonYear(e.target.value)}
                    dir="ltr"
                  />
                  {scoringCriteria.map((criterion, index) => <Input key={`${criterion.label}-${index}`} label={`${criterion.label} (حداکثر ${criterion.points || '—'})`} type="number" min={0} max={Number(criterion.points) || undefined} value={criterionScores[String(index)] ?? ''} disabled={judgeStatus === 'submitted'} onChange={(e) => setCriterionScores((current) => ({ ...current, [String(index)]: Number(e.target.value) }))} dir="ltr" />)}
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><p className="font-black text-slate-800">پیشرفت داوری</p><span className="rounded-full bg-white px-3 py-1 text-sm font-black text-sky-700">{judgeProgress?.submitted_count ?? 0} از {judgeProgress?.required_count ?? 0}</span></div>{judgeProgress?.missing_judges?.length ? <p className="mt-2 text-xs leading-6 text-amber-700">در انتظار: {judgeProgress.missing_judges.join('، ')}</p> : <p className="mt-2 text-xs text-emerald-700">همه داوری‌های الزامی تکمیل شده‌اند.</p>}</div>
                <div className="mt-3">
                  <Textarea
                    label={t('judging.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                {showResultPreview ? <div className="mt-5 overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-[#083f58] to-[#087052] p-6 text-white shadow-xl">
                  <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[.18em] text-emerald-200">{t('judging.publicPreview')}</p><h3 className="mt-2 text-2xl font-black">{selected.name}</h3><p className="mt-1 text-sm text-white/70">{leagueName(selected.league_id)} · {t('judging.season')} {seasonYear}</p></div><div className="rounded-2xl bg-white/10 px-5 py-3 text-center"><p className="text-xs text-white/60">{t('judging.rank')}</p><p className="text-3xl font-black">{rank || '—'}</p></div></div>
                  <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-black/10 p-4"><p className="text-xs text-white/60">{t('judging.score')}</p><p className="mt-1 text-xl font-black">{score || '—'}</p></div><div className="rounded-2xl bg-black/10 p-4"><p className="text-xs text-white/60">{t('team.status')}</p><p className="mt-1 font-black">{t('judging.readyToPublish')}</p></div></div>
                  {notes ? <p className="mt-4 rounded-2xl bg-white/10 p-4 text-sm leading-7">{notes}</p> : null}<div className="mt-5 flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void onSaveResult(true)}>{t('judging.confirmPublish')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setShowResultPreview(false)}>{t('judging.backToEdit')}</Button></div>
                </div> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={busy || judgeStatus === 'submitted'} onClick={() => void onSaveResult(false)}>
                    {t('judging.saveDraft')}
                  </Button>
                  <Button type="button" disabled={busy || judgeStatus === 'submitted' || !Object.keys(criterionScores).length} onClick={() => void onSubmitJudging()}>نهایی‌کردن امتیاز من</Button>
                  <Button type="button" disabled={busy || !judgeProgress || judgeProgress.submitted_count < judgeProgress.required_count} onClick={() => setShowResultPreview(true)}>{t('judging.previewAndPublish')}</Button>
                  {resultPublishedAt ? <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-700">{t('judging.publishedState')}</span> : <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">{t('judging.draftState')}</span>}
                  {resultUpdatedAt ? <span className="inline-flex items-center px-2 text-xs font-bold text-slate-400">{t('judging.lastUpdated')}: {formatAppDateTime(resultUpdatedAt, i18n.language)}</span> : null}
                </div>
              </PanelCard>
            </div>
          ) : (
            <p className="text-sm text-rc-muted">{t('judging.selectTeam')}</p>
          )}
        </div>
      )}
    </PanelPage>
  )
}

function ResultStep({ index, title, active, done }: { index: string; title: string; active: boolean; done: boolean }) {
  return <div className={`flex items-center gap-3 rounded-2xl border p-3 transition ${active ? 'border-sky-300 bg-sky-50' : done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}><span className={`grid size-9 place-items-center rounded-xl font-black ${done ? 'bg-emerald-600 text-white' : active ? 'bg-sky-600 text-white' : 'bg-white text-slate-400'}`}>{done ? '✓' : index}</span><span className="text-xs font-black text-slate-700">{title}</span></div>
}
