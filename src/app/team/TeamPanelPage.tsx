import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input, PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { BirthDateField } from '@/components/ui/BirthDateField'
import { PanelPage } from '@/components/layout/PanelShell'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchCaptainTeams,
  fetchTeamById,
  fetchTeamDocuments,
  fetchTeamMembers,
} from '@/features/registration/api'
import { fetchTeamPublishedResult } from '@/features/live-results/api'
import { PodiumCup } from '@/components/live-results/PodiumCup'
import { TicketInbox } from '@/features/chat/TicketInbox'
import { ageFromBirthDate, formatAppDate } from '@/lib/dates'
import type { DocumentRow, ResultRow, Team, TeamMember } from '@/types/database'
import type { League } from '@/types/database'
import { backend } from '@/lib/backend'

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
          }).eq('id', member.id)
          if (updateError) throw new Error(updateError.message)
        }
        setMembers(memberEdits)
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
            </div>)}
            <Button type="button" onClick={() => void saveMemberEdits()} disabled={saving}>{saving ? 'در حال ذخیره…' : 'ذخیره تغییرات اعضا'}</Button>
          </div> : members.length ? (
            <ul className="space-y-3 text-sm">
              {members.map((m) => {
                const displayName =
                  m.first_name || m.last_name
                    ? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()
                    : m.full_name
                const age = ageFromBirthDate(m.birth_date)
                return (
                  <li key={m.id} className="border-b border-rc-line/60 py-2.5 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{displayName}</p>
                      <span className="font-mono text-[10px] text-rc-muted uppercase">
                        {t(`team.roles.${m.role === 'captain' ? 'captain' : 'member'}`)}
                        {' · '}
                        {m.review_status ?? 'pending'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-rc-muted">
                      {m.education ? `${m.education} · ` : ''}
                      {age != null ? `${t('team.memberAge')}: ${age} · ` : ''}
                      {formatAppDate(m.birth_date, i18n.language)}
                    </p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-rc-muted">{t('team.noMembers')}</p>
          )}
        </PanelCard>

        <PanelCard title={t('team.docsTitle')}>
          {docs.length ? (
            <ul className="space-y-2 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex justify-between font-mono text-xs text-rc-muted">
                  <span>{d.doc_type}</span>
                  <span>{d.file_path.split('/').pop()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-rc-muted">{t('team.noDocs')}</p>
          )}
        </PanelCard>

        <TicketInbox mode="team" teamId={team.id} />

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

      <div className="role-welcome relative overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#0a4964] to-[#087eb8] p-6 text-white shadow-[0_22px_60px_rgb(8_126_184/0.18)] sm:p-8"><p className="text-sm font-black text-sky-200">پنل سرپرست تیم</p><h2 className="mt-2 text-2xl font-black text-white">{profile?.full_name ?? 'سرپرست'}، وضعیت تیم‌ها در دسترس شماست</h2><p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-100">اعضا، مدارک، وضعیت بررسی و پرداخت هر تیم را از این بخش دنبال کنید.</p><div className="mt-5 inline-flex rounded-xl bg-[#ffffff16] px-4 py-2 text-xs font-bold text-white">{teams.length} تیم در حساب شما</div></div>

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
                <Link to={`/team/${row.id}`} className="text-sm text-rc-blue hover:underline">
                  {t('team.view')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </PanelPage>
  )
}
