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
  adminDeleteTeam,
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
import { fetchAttendance, reviewTechnical, technicalSignedUrl, type AttendanceClearance, type TechnicalFile } from '@/features/attendance/api'
import { backend } from '@/lib/backend'

function ReviewThumbnail({ path, label, onOpen }: { path: string; label: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => { void getDocumentSignedUrl(path).then(setUrl).catch(() => setUrl('')) }, [path])
  if (/\.pdf(?:$|\?)/i.test(path)) return <button type="button" onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')} className="grid h-16 w-24 place-items-center rounded-xl bg-red-50 text-xs font-black text-red-700">PDF · مشاهده</button>
  return <button type="button" disabled={!url} onClick={() => url && onOpen(url)} className="group relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">{url ? <img src={url} alt={label} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10px] text-slate-400">در حال بارگذاری</span>}<span className="absolute inset-x-0 bottom-0 bg-slate-950/65 py-0.5 text-[9px] text-white">مشاهده</span></button>
}

export function LeagueAdminPage({ section = 'review' }: { section?: 'review' | 'tickets' | 'scores' | 'live' }) {
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
  const [queueLeague, setQueueLeague] = useState('all')
  const [queueStatus, setQueueStatus] = useState('all')
  const [viewerUrl, setViewerUrl] = useState('')
  const [attendance, setAttendance] = useState<AttendanceClearance | null>(null)
  const [technicalFiles, setTechnicalFiles] = useState<TechnicalFile[]>([])
  const [technicalRejectReason, setTechnicalRejectReason] = useState('')
  const [clearedTeamIds, setClearedTeamIds] = useState<Set<string>>(new Set())
  const tab = section

  const selected = useMemo(
    () => teams.find((x) => x.id === selectedId) ?? null,
    [teams, selectedId],
  )
  const selectedLeague = useMemo(() => leagues.find((league) => league.id === selected?.league_id) ?? null, [leagues, selected?.league_id])
  const scoringCriteria = selectedLeague?.scoring_rows?.length ? selectedLeague.scoring_rows : [{ label: 'امتیاز کل', points: '100' }]
  const visibleTeams = useMemo(() => teams.filter((team) => {
    if (tab === 'scores') {
      return Boolean(queueLeague && queueLeague !== 'all' && team.league_id === queueLeague && clearedTeamIds.has(team.id))
    }
    return (queueLeague === 'all' || team.league_id === queueLeague) && (queueStatus === 'all' || team.status === queueStatus)
  }), [clearedTeamIds, queueLeague, queueStatus, tab, teams])
  const completedCriteria = scoringCriteria.filter((_, index) => Number.isFinite(criterionScores[String(index)]) && criterionScores[String(index)] >= 0).length
  const scoringPercent = scoringCriteria.length ? Math.round((completedCriteria / scoringCriteria.length) * 100) : 0
  const enteredTotal = Object.values(criterionScores).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const maximumTotal = scoringCriteria.reduce((sum, criterion) => sum + (Number(criterion.points) || 0), 0)

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
        const { data: cleared, error: clearanceError } = await backend
          .from('team_attendance_clearances')
          .select('team_id')
          .eq('stage', 'confirmed')
        if (clearanceError) throw new Error(clearanceError.message)
        setClearedTeamIds(new Set((cleared ?? []).map((row: { team_id: string }) => row.team_id)))
      } else {
        setTeams([])
        setClearedTeamIds(new Set())
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
      setAttendance(null)
      setTechnicalFiles([])
      return
    }
    void fetchTeamDocuments(selectedId)
      .then(setDocs)
      .catch((err: Error) => setError(err.message))
    void fetchTeamMembers(selectedId)
      .then(setMembers)
      .catch(() => setMembers([]))
    const selectedTeam = teams.find((team) => team.id === selectedId)
    if (selectedTeam) void fetchAttendance(selectedId, selectedTeam.league_id).then((data) => { setAttendance(data.flow); setTechnicalFiles(data.files) }).catch(() => { setAttendance(null); setTechnicalFiles([]) })

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
  }, [selectedId, seasonYear, user, teams])

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
      if (selected) { const data = await fetchAttendance(selected.id, selected.league_id); setAttendance(data.flow); setTechnicalFiles(data.files) }
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
      const data = await fetchAttendance(updated.id, updated.league_id); setAttendance(data.flow); setTechnicalFiles(data.files)
      void dispatchPendingSms()
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message.includes('team_members_not_approved') ? 'برای تأیید نهایی تیم، ابتدا باید تمام اعضای تیم تأیید شده باشند.' : message)
    } finally {
      setBusy(false)
    }
  }

  const onTechnicalReview = async (approved: boolean) => {
    if (!selected) return
    if (!approved && !technicalRejectReason.trim()) { setError('دلیل عدم تأیید مقاله یا فیلم را وارد کنید.'); return }
    setBusy(true); setError(null)
    try { const updated = await reviewTechnical(selected.id, approved, technicalRejectReason); setAttendance(updated); setTechnicalRejectReason(''); toast.success(approved ? 'مدارک فنی تأیید شد.' : 'مدارک برای اصلاح به شرکت‌کننده بازگردانده شد.') }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')) }
    finally { setBusy(false) }
  }

  const onDeleteTeam = async () => {
    if (!selected || profile?.role !== 'super_admin') return
    if (!window.confirm(`تیم «${selected.name}» حذف شود؟ این عملیات قابل بازگشت نیست.`)) return
    setBusy(true)
    setError(null)
    try {
      await adminDeleteTeam(selected.id)
      setTeams((current) => current.filter((team) => team.id !== selected.id))
      setSelectedId(null)
      toast.success('تیم با موفقیت حذف شد.')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message.includes('team_has_paid_invoice') ? 'این تیم پرداخت قطعی دارد و برای حفظ سوابق مالی قابل حذف نیست.' : message)
    } finally {
      setBusy(false)
    }
  }

  const onSaveResult = async (publish: boolean) => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      if (!publish) {
        const draft = await saveJudgeScore({ teamId: selected.id, seasonYear: Number(seasonYear), scores: criterionScores, notes, submit: false })
        setJudgeStatus('draft')
        setResultUpdatedAt(draft.updated_at ?? new Date().toISOString())
        toast.success(t('judging.resultDraftSuccess'))
        return
      }
      const updated = await publishOfficialTeamResult(selected.id, Number(seasonYear))
      setResultPublishedAt(updated.published_at ?? null)
      setResultUpdatedAt(updated.published_at ?? new Date().toISOString())
      setShowResultPreview(false)
      toast.success(t('judging.resultPublishedSuccess'))
      void dispatchPendingSms()
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
    <PanelPage index={tab === 'tickets' ? 'OPS.03' : tab === 'scores' ? 'JDG.02' : tab === 'live' ? 'RES.01' : 'OPS.02'} title={tab === 'tickets' ? t('judging.tabTickets') : tab === 'scores' ? 'امتیازات داوران' : tab === 'live' ? 'مدیریت نتایج زنده' : t('judging.tabReview')} description={tab === 'scores' ? 'ثبت و نهایی‌سازی امتیازها در فضای مستقل داوری' : tab === 'live' ? 'کنترل نمایش عمومی نتایج؛ فقط برای مدیریت سامانه' : t('judging.subtitle')}>

      <FieldError message={error ?? undefined} />

      {tab === 'review' && profile?.role === 'super_admin' ? (
        <section className="overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_18px_55px_rgb(18_76_98/0.08)]">
          <div className="bg-gradient-to-l from-[#063d59] via-[#0873a0] to-[#087b61] p-6 text-white sm:p-7"><p className="text-xs font-black tracking-widest text-emerald-200">{i18n.language.startsWith('en') ? 'MANAGEMENT WORKFLOW' : 'مسیر مدیریتی پرونده تا انتشار'}</p><h2 className="mt-2 text-xl font-black">{t('judging.guideTitle')}</h2><p className="mt-2 max-w-3xl text-sm leading-7 text-sky-50/85">{i18n.language.startsWith('en') ? 'This overview and public-board control are administrative tools. Judges only see the focused review and scoring workspace.' : 'این راهنما و کنترل تابلوی عمومی ابزار مدیریتی هستند؛ داور فقط میز متمرکز بررسی و امتیازدهی مربوط به خود را می‌بیند.'}</p></div>
          <div className="grid gap-3 p-5 md:grid-cols-3 sm:p-7">
            {[
              [i18n.language.startsWith('en') ? '1. Initial triage' : '۱. بررسی اولیه', i18n.language.startsWith('en') ? 'Staff checks submission completeness; no scoring happens here.' : 'کارشناس کامل‌بودن اطلاعات و مدارک را کنترل می‌کند؛ امتیازدهی انجام نمی‌شود.'],
              [i18n.language.startsWith('en') ? '2. Team review' : '۲. بررسی تیم‌ها', i18n.language.startsWith('en') ? 'Eligibility, documents, members and judging criteria are reviewed.' : 'صلاحیت، مدارک، اعضا و معیارهای داوری به‌صورت تخصصی بررسی می‌شوند.'],
              [i18n.language.startsWith('en') ? '3. Public results' : '۳. انتشار عمومی', i18n.language.startsWith('en') ? 'Management chooses when verified results appear on the public board.' : 'مدیریت زمان نمایش نتایج تأییدشده در تابلوی عمومی را تعیین می‌کند.'],
            ].map(([title, body], index) => <article key={title} className="relative rounded-2xl border border-slate-100 bg-slate-50/70 p-5"><span className={`absolute start-0 top-5 h-10 w-1 rounded-e-full ${index === 2 ? 'bg-emerald-500' : 'bg-sky-500'}`} /><h3 className="font-black text-slate-900">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-600">{body}</p></article>)}
          </div>
        </section>
      ) : null}

      {tab === 'live' && profile?.role === 'super_admin' && !loading && leagues.length > 0 ? (
        <PanelCard title={t('liveResults.boardMode')} description={i18n.language.startsWith('en') ? 'Administrative control for what visitors see on the public results page. Changes take effect immediately.' : 'کنترل مدیریتی محتوایی که بازدیدکنندگان در صفحه نتایج عمومی می‌بینند؛ تغییر حالت بلافاصله اعمال می‌شود.'}>
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">{i18n.language.startsWith('en') ? 'Auto follows the competition state; Live shows in-progress results; Final locks the final presentation; Hidden removes the league from the public board.' : '«خودکار» از وضعیت مسابقه پیروی می‌کند؛ «زنده» نتایج در جریان، «نهایی» نتیجه قطعی و «پنهان» عدم نمایش لیگ در تابلوی عمومی است.'}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {leagues
              .filter((l) => profile?.role === 'super_admin' || leagueIds.includes(l.id))
              .map((league) => (
                <div key={league.id} className="rounded-2xl border border-sky-100 bg-gradient-to-l from-white to-sky-50/60 p-4 shadow-sm"><Select label={league.name} value={(league.results_status as string) || 'auto'} disabled={busy} onChange={(e) => void onBoardMode(league.id, e.target.value)}>
                  <option value="auto">{t('liveResults.modeAuto')}</option>
                  <option value="live">{t('liveResults.modeLive')}</option>
                  <option value="final">{t('liveResults.modeFinal')}</option>
                  <option value="hidden">{t('liveResults.modeHidden')}</option>
                </Select><p className="mt-2 text-[11px] text-slate-500">{i18n.language.startsWith('en') ? 'Public visibility for this league' : 'وضعیت نمایش عمومی این لیگ'}</p></div>
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
        <div className={`space-y-4 ${tab === 'live' ? 'hidden' : ''}`}>
          <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#073b55] via-[#087eb8] to-[#0b8b66] p-5 text-white shadow-[0_20px_60px_rgb(8_126_184/0.18)] sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-5"><div><p className="text-xs font-black text-cyan-200">میز داوری مسابقه</p><h2 className="mt-2 text-2xl font-black">بررسی سریع، ثبت دقیق، انتشار مطمئن</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-white/80">ابتدا لیگ و تیم را انتخاب کنید؛ پرونده و مدارک را بررسی کنید، سپس برای هر معیار امتیاز بدهید. پیش‌نویس قابل ویرایش است اما ثبت نهایی قفل می‌شود.</p></div><div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur"><strong className="block text-2xl">{visibleTeams.length.toLocaleString('fa-IR')}</strong><span className="text-xs text-white/70">تیم در صف</span></div><div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur"><strong className="block text-2xl">{teams.filter((team) => team.status === 'under_review').length.toLocaleString('fa-IR')}</strong><span className="text-xs text-white/70">در حال بررسی</span></div></div></div>
          </section>
          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <PanelCard title={t('judging.queue')} description="فیلتر کنید و تیم بعدی را بدون خروج از صفحه انتخاب کنید.">
            <div className={`mb-4 grid gap-2 ${tab === 'scores' ? '' : 'grid-cols-2'}`}><Select label={tab === 'scores' ? 'ابتدا لیگ را انتخاب کنید' : 'لیگ'} value={queueLeague} onChange={(event) => { setQueueLeague(event.target.value); setSelectedId(null) }}><option value={tab === 'scores' ? '' : 'all'}>{tab === 'scores' ? 'انتخاب لیگ…' : 'همه لیگ‌ها'}</option>{leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}</Select>{tab !== 'scores' ? <Select label="وضعیت" value={queueStatus} onChange={(event) => setQueueStatus(event.target.value)}><option value="all">همه</option><option value="submitted">جدید</option><option value="under_review">در حال بررسی</option><option value="approved">تأییدشده</option><option value="rejected">ردشده</option></Select> : null}</div>
            <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
              {visibleTeams.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-xl shadow-sm">✓</span><p className="mt-3 text-sm font-black text-slate-700">{tab === 'scores' && !queueLeague ? 'یک لیگ را انتخاب کنید' : 'تیمی در این فیلتر باقی نمانده است'}</p><p className="mt-1 text-xs leading-5 text-slate-400">{tab === 'scores' ? 'فقط تیم‌هایی نمایش داده می‌شوند که مجوز حضور آن‌ها صادر شده باشد.' : 'فیلتر وضعیت یا لیگ را تغییر دهید.'}</p></li>
              ) : (
                visibleTeams.map((team, teamIndex) => (
                  <li key={team.id}>
                    <button
                      type="button"
                      className={`w-full rounded-2xl border px-4 py-3 text-start text-sm transition ${
                        selectedId === team.id ? 'border-sky-300 bg-sky-50 text-sky-900 shadow-sm' : 'border-transparent bg-slate-50/70 hover:border-slate-200 hover:bg-white'
                      }`}
                      onClick={() => setSelectedId(team.id)}
                    >
                      <span className="flex items-center gap-2"><b className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-[11px] text-slate-400 shadow-sm">{String(teamIndex + 1).padStart(2, '0')}</b><span className="block min-w-0"><strong className="block truncate font-black">{team.name}</strong><small className="mt-0.5 block truncate text-xs text-slate-500">{leagueName(team.league_id)}</small></span></span>
                      <div className="mt-2 ps-9">
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
              <nav aria-label="موقعیت فعلی" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">
                <span>بررسی تیم‌ها</span><span aria-hidden="true">←</span><span>{selectedLeague?.name ?? leagueName(selected.league_id)}</span><span aria-hidden="true">←</span><strong className="text-sky-700">پرونده تیم {selected.name}</strong>
              </nav>
              <section className="rounded-[1.75rem] border border-sky-100 bg-gradient-to-l from-sky-50 via-white to-emerald-50 p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black text-sky-600">لیگ فعال</p><h2 className="mt-1 text-xl font-black text-slate-900">{selectedLeague?.name}</h2><p className="mt-1 text-sm text-slate-500">تیم در حال بررسی: <strong className="text-slate-800">{selected.name}</strong> · فصل {seasonYear}</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={judgeStatus ?? 'draft'} label={judgeStatus === 'submitted' ? 'امتیاز نهایی‌شده' : judgeStatus === 'draft' ? 'پیش‌نویس ذخیره‌شده' : 'امتیازدهی شروع نشده'} /><span className={`rounded-full px-3 py-1.5 text-xs font-black ${resultPublishedAt ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 shadow-sm'}`}>{resultPublishedAt ? 'نتیجه منتشرشده' : 'منتشرنشده'}</span></div></div></section>
              <div className={tab === 'review' ? '' : 'hidden'}><PanelCard title={`پرونده تیم · ${selected.name}`} description={`${leagueName(selected.league_id)} — مدارک، اعضا و وضعیت پذیرش را پیش از امتیازدهی کنترل کنید.`}>
                <div className="mb-3 flex flex-wrap gap-2">
                  <StatusBadge
                    status={selected.status}
                    label={t(`team.statuses.${selected.status}`, { defaultValue: selected.status })}
                  />
                  {profile?.role === 'super_admin' ? <><Link to={`/team/${selected.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800">ویرایش کامل در صفحه جدید</Link><Button type="button" variant="danger" disabled={busy} onClick={() => void onDeleteTeam()}>حذف تیم</Button></> : null}
                </div>

                <p className="mb-5 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-6 text-sky-900">اکنون در پرونده همین تیم هستید. مدارک و اعضا در ادامه بررسی می‌شوند؛ تیکت‌ها بخش مستقلی در منوی پنل دارند و با انتخاب تیم به‌صورت ناخواسته باز نمی‌شوند.</p>

                <h3 className="mb-2 text-sm font-medium">{t('team.docsTitle')}</h3>
                <ul className="mb-4 space-y-2 text-sm">
                  {docs.length === 0 ? (
                    <li className="text-rc-muted">{t('team.noDocs')}</li>
                  ) : (
                    docs.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-2">
                        <span className="min-w-0 truncate">{doc.doc_type}</span>
                        <ReviewThumbnail path={doc.file_path} label={doc.doc_type} onOpen={setViewerUrl} />
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
                              <p className={`mt-1 text-[10px] font-black ${m.review_status === 'approved' ? 'text-emerald-700' : m.review_status === 'rejected' ? 'text-rose-700' : 'text-amber-700'}`}>
                                {m.review_status === 'approved' ? 'تأییدشده' : m.review_status === 'rejected' ? 'نیازمند اصلاح' : 'در انتظار بررسی'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {m.national_id_doc_path ? (
                                <ReviewThumbnail path={m.national_id_doc_path} label={t('team.memberNationalIdCard')} onOpen={setViewerUrl} />
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

                {attendance ? <AttendanceFlowStatus attendance={attendance} /> : <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-black text-amber-950">مسیر ثبت‌نام هنوز آغاز نشده است</h3><p className="mt-1 text-xs leading-6 text-amber-800">شرکت‌کننده هنوز اطلاعات تیم و اعضا را برای بررسی ارسال نکرده است.</p></section>}

                {attendance ? <section className="mb-5 rounded-2xl border border-sky-200 bg-sky-50/40 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-slate-900">مقاله و فیلم ربات</h3><p className="mt-1 text-xs leading-6 text-slate-500">پس از تأیید کامل اعضا و تیم، فایل‌های ارسالی شرکت‌کننده در این بخش بررسی می‌شوند.</p></div><StatusBadge status={attendance.technical_status} label={attendance.technical_status==='approved'?'تأییدشده':attendance.technical_status==='rejected'?'نیازمند اصلاح':attendance.technical_status==='pending'?'در انتظار بررسی':'هنوز ارسال نشده'} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{technicalFiles.map(file=><TechnicalReviewFile key={file.id} file={file} />)}{technicalFiles.length===0?<p className="text-sm text-slate-500">هنوز فایل فنی ارسال نشده است.</p>:null}</div>{attendance.technical_status==='pending'?<div className="mt-4 space-y-3"><Input label="دلیل عدم تأیید (برای رد الزامی)" value={technicalRejectReason} onChange={e=>setTechnicalRejectReason(e.target.value)} /><div className="flex gap-2"><Button type="button" disabled={busy} onClick={()=>void onTechnicalReview(true)}>تأیید مقاله و فیلم</Button><Button type="button" variant="danger" disabled={busy||!technicalRejectReason.trim()} onClick={()=>void onTechnicalReview(false)}>رد و درخواست اصلاح</Button></div></div>:null}</section>:null}

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
              </PanelCard></div>

              <div className={tab === 'scores' ? '' : 'hidden'}><PanelCard title={t('judging.resultsTitle')} description={t('judging.resultsHint')}>
                <div className="mb-5 grid gap-2 sm:grid-cols-3">
                  <ResultStep index="۱" title={t('judging.workflowScore')} active={!rank && !score} done={Boolean(rank || score)} />
                  <ResultStep index="۲" title={t('judging.workflowPreview')} active={showResultPreview} done={Boolean(resultPublishedAt)} />
                  <ResultStep index="۳" title={t('judging.workflowPublish')} active={Boolean(resultPublishedAt)} done={Boolean(resultPublishedAt)} />
                </div>
                <div className="mb-5 rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50 to-white p-4 text-sm leading-7 text-sky-900"><strong className="block">راهنمای ثبت نتیجه</strong>امتیاز هر معیار را در بازه نمایش‌داده‌شده وارد و ابتدا «ذخیره پیش‌نویس» را بزنید. ثبت نهایی برگشت‌پذیر نیست. نتیجه رسمی پس از تکمیل امتیاز همه داوران الزامی، توسط سرداور منتشر می‌شود.</div>
                <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-400">معیارهای تکمیل‌شده</p><strong className="mt-1 block text-xl text-slate-800">{completedCriteria} از {scoringCriteria.length}</strong></div><div className="rounded-2xl bg-sky-50 p-4"><p className="text-xs font-bold text-sky-500">مجموع امتیاز شما</p><strong className="mt-1 block text-xl text-sky-800">{enteredTotal.toLocaleString('fa-IR')} / {maximumTotal.toLocaleString('fa-IR')}</strong></div><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-600">وضعیت ذخیره</p><strong className="mt-1 block text-base text-emerald-800">{judgeStatus === 'submitted' ? 'نهایی و قفل‌شده' : resultUpdatedAt ? 'پیش‌نویس ذخیره شده' : 'هنوز ذخیره نشده'}</strong></div></div>
                <div className="mb-5"><div className="mb-2 flex items-center justify-between text-xs font-black text-slate-500"><span>پیشرفت امتیازدهی</span><span>{scoringPercent.toLocaleString('fa-IR')}٪</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gradient-to-l from-sky-500 to-emerald-500 transition-all duration-500" style={{ width: `${scoringPercent}%` }} /></div></div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label={t('judging.season')}
                    type="number"
                    value={seasonYear}
                    onChange={(e) => setSeasonYear(e.target.value)}
                    dir="ltr"
                  />
                  {scoringCriteria.map((criterion, index) => <div key={`${criterion.label}-${index}`} className={`rounded-2xl border p-4 transition ${criterionScores[String(index)] != null ? 'border-sky-200 bg-sky-50/50' : 'border-slate-200 bg-white'}`}><div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-black text-slate-800">{criterion.label}</p><p className="mt-1 text-xs text-slate-400">امتیاز مجاز: صفر تا {criterion.points || '—'}</p></div><span className={`grid size-8 place-items-center rounded-xl text-xs font-black ${criterionScores[String(index)] != null ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{criterionScores[String(index)] != null ? '✓' : index + 1}</span></div><Input label="امتیاز داور" type="number" min={0} max={Number(criterion.points) || undefined} value={criterionScores[String(index)] ?? ''} disabled={judgeStatus === 'submitted'} onChange={(e) => { const raw = e.target.value; setCriterionScores((current) => { if (raw === '') { const next = { ...current }; delete next[String(index)]; return next } return { ...current, [String(index)]: Math.max(0, Math.min(Number(criterion.points) || Number.MAX_SAFE_INTEGER, Number(raw))) } }) }} dir="ltr" /></div>)}
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
                  <Button type="button" disabled={busy || judgeStatus === 'submitted' || completedCriteria < scoringCriteria.length} onClick={() => void onSubmitJudging()}>ثبت نهایی امتیاز من</Button>
                  <Button type="button" disabled={busy || !judgeProgress || judgeProgress.submitted_count < judgeProgress.required_count} onClick={() => setShowResultPreview(true)}>{t('judging.previewAndPublish')}</Button>
                  {resultPublishedAt ? <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-700">{t('judging.publishedState')}</span> : <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">{t('judging.draftState')}</span>}
                  {resultUpdatedAt ? <span className="inline-flex items-center px-2 text-xs font-bold text-slate-400">{t('judging.lastUpdated')}: {formatAppDateTime(resultUpdatedAt, i18n.language)}</span> : null}
                </div>
              </PanelCard></div>
            </div>
          ) : (
            <div className="grid min-h-80 place-items-center rounded-[1.75rem] border-2 border-dashed border-slate-200 bg-white/70 p-8 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-sky-50 text-2xl text-sky-600">⌁</span><h2 className="mt-4 text-lg font-black text-slate-800">یک تیم را برای بررسی انتخاب کنید</h2><p className="mt-2 max-w-sm text-sm leading-7 text-slate-500">با انتخاب تیم از صف، پرونده، معیارهای امتیازدهی و وضعیت ذخیره در همین بخش نمایش داده می‌شود.</p></div></div>
          )}
          </div>
        </div>
      )}
      {viewerUrl ? <div className="fixed inset-0 z-[190] grid place-items-center bg-slate-950/85 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerUrl('') }}><div className="relative max-h-[90dvh] max-w-4xl overflow-hidden rounded-2xl bg-white p-2"><button type="button" onClick={() => setViewerUrl('')} className="absolute end-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-slate-950/75 text-xl text-white" aria-label="بستن">×</button><img src={viewerUrl} alt="نمایش مدرک" className="max-h-[86dvh] max-w-full rounded-xl object-contain" /></div></div> : null}
    </PanelPage>
  )
}

function ResultStep({ index, title, active, done }: { index: string; title: string; active: boolean; done: boolean }) {
  return <div className={`flex items-center gap-3 rounded-2xl border p-3 transition ${active ? 'border-sky-300 bg-sky-50' : done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}><span className={`grid size-9 place-items-center rounded-xl font-black ${done ? 'bg-emerald-600 text-white' : active ? 'bg-sky-600 text-white' : 'bg-white text-slate-400'}`}>{done ? '✓' : index}</span><span className="text-xs font-black text-slate-700">{title}</span></div>
}

function AttendanceFlowStatus({ attendance }: { attendance: AttendanceClearance }) {
  const stages = [
    { key: 'members', title: 'تأیید تیم و اعضا', done: attendance.stage !== 'members', active: attendance.stage === 'members' },
    { key: 'technical', title: 'تأیید مقاله و فیلم ربات', done: ['rules','payment','confirmed'].includes(attendance.stage), active: attendance.stage === 'technical' },
    { key: 'rules', title: 'پذیرش قوانین', done: ['payment','confirmed'].includes(attendance.stage), active: attendance.stage === 'rules' },
    { key: 'payment', title: 'پرداخت و صدور مجوز', done: attendance.stage === 'confirmed', active: attendance.stage === 'payment' },
  ]
  return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-slate-900">وضعیت مجوز حضور در مسابقات</h3><p className="mt-1 text-xs leading-6 text-slate-500">صدور مجوز خودکار است؛ پس از تأیید اعضا، مدارک فنی و پذیرش قوانین توسط شرکت‌کننده نهایی می‌شود.</p></div><StatusBadge status={attendance.stage} label={attendance.stage === 'confirmed' ? 'مجوز صادر شده' : 'در جریان بررسی'} /></div><ol className="mt-4 grid gap-2 md:grid-cols-3">{stages.map((stage, index) => <li key={stage.key} className={`flex items-center gap-3 rounded-xl border p-3 ${stage.done ? 'border-emerald-200 bg-emerald-50' : stage.active ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-black ${stage.done ? 'bg-emerald-600 text-white' : stage.active ? 'bg-amber-400 text-amber-950' : 'bg-slate-200 text-slate-500'}`}>{stage.done ? '✓' : index + 1}</span><div><p className="text-xs font-black text-slate-800">{stage.title}</p><p className="mt-0.5 text-[10px] text-slate-500">{stage.done ? 'تکمیل شده' : stage.active ? 'مرحله فعلی' : 'در انتظار'}</p></div></li>)}</ol>{attendance.stage === 'confirmed' ? <p className="mt-3 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">مجوز حضور این تیم صادر شده و تیم آماده ورود به مرحله داوری است.</p> : null}</section>
}

function TechnicalReviewFile({file}:{file:TechnicalFile}){
  const [url,setUrl]=useState('')
  useEffect(()=>{void technicalSignedUrl(file.file_path).then(setUrl).catch(()=>setUrl(''))},[file.file_path])
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className={`grid size-11 shrink-0 place-items-center rounded-lg text-xs font-black ${file.kind==='article'?'bg-rose-50 text-rose-700':'bg-violet-50 text-violet-700'}`}>{file.kind==='article'?'DOC':'VIDEO'}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{file.original_name}</strong><span className="text-xs text-slate-400">{(file.size_bytes/1048576).toLocaleString('fa-IR',{maximumFractionDigits:1})} مگابایت</span></div>{url?<a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-sky-700 px-3 py-2 text-xs font-black text-white">مشاهده</a>:null}</article>
}
