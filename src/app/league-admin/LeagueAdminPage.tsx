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
  fetchTeamsForReview,
  getDocumentSignedUrl,
  reviewTeam,
  upsertTeamResult,
} from '@/features/judging/api'
import {
  fetchTeamMembers,
  reviewTeamMember,
} from '@/features/registration/api'
import { setLeagueResultsStatus } from '@/features/live-results/api'
import { ageFromBirthDate, formatAppDate } from '@/lib/dates'
import { dispatchPendingSms } from '@/features/notifications/api'
import type { DocumentRow, League, RegistrationStatus, Team, TeamMember } from '@/types/database'

export function LeagueAdminPage({ section = 'review' }: { section?: 'review' | 'tickets' }) {
  const { t, i18n } = useTranslation()
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
  const [notes, setNotes] = useState('')
  const [seasonYear, setSeasonYear] = useState(String(new Date().getFullYear()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const tab = section

  const selected = useMemo(
    () => teams.find((x) => x.id === selectedId) ?? null,
    [teams, selectedId],
  )

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
      return
    }
    void fetchTeamDocuments(selectedId)
      .then(setDocs)
      .catch((err: Error) => setError(err.message))
    void fetchTeamMembers(selectedId)
      .then(setMembers)
      .catch(() => setMembers([]))

    const year = Number(seasonYear) || new Date().getFullYear()
    void fetchTeamResult(selectedId, year)
      .then((row) => {
        setRank(row?.rank != null ? String(row.rank) : '')
        setScore(row?.score != null ? String(row.score) : '')
        setNotes(row?.notes ?? '')
      })
      .catch(() => undefined)
  }, [selectedId, seasonYear])

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
      await upsertTeamResult({
        teamId: selected.id,
        seasonYear: Number(seasonYear),
        rank: rank ? Number(rank) : null,
        score: score ? Number(score) : null,
        notes: notes || null,
        publish,
      })
      if (publish) void dispatchPendingSms()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
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
                                {t(`team.roles.${m.role === 'captain' ? 'captain' : 'member'}`)}
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
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    label={t('judging.season')}
                    type="number"
                    value={seasonYear}
                    onChange={(e) => setSeasonYear(e.target.value)}
                    dir="ltr"
                  />
                  <Input
                    label={t('judging.rank')}
                    type="number"
                    value={rank}
                    onChange={(e) => setRank(e.target.value)}
                    dir="ltr"
                  />
                  <Input
                    label={t('judging.score')}
                    type="number"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="mt-3">
                  <Textarea
                    label={t('judging.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void onSaveResult(false)}>
                    {t('common.save')}
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void onSaveResult(true)}>
                    {t('judging.publish')}
                  </Button>
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
