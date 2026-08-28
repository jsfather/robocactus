import { useEffect, useMemo, useState } from 'react'
import { PanelPage } from '@/components/layout/PanelShell'
import { PanelCard, Select } from '@/components/ui/FormControls'
import { StatCard } from '@/components/panel/HudKit'
import { TicketInbox } from '@/features/chat/TicketInbox'
import { fetchCompanyTeams, fetchMyCompanies } from '@/features/companies/api'
import { backend } from '@/lib/backend'
import { useAuth } from '@/hooks/useAuth'
import type { Team, Ticket } from '@/types/database'

export function ParticipantTicketsPage() {
  const { user } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { void (async () => {
    try {
      if (!user) return
      const companies = await fetchMyCompanies(user.id)
      const rows = (await Promise.all(companies.map((company) => fetchCompanyTeams(company.id)))).flat()
      setTeams(rows); setTeamId((current) => current || rows[0]?.id || '')
      if (rows.length) {
        const result = await backend.from('tickets').select('*').in('team_id', rows.map((team) => team.id)).order('created_at', { ascending: false })
        setTickets((result.data ?? []) as Ticket[])
      }
    } finally { setLoading(false) }
  })() }, [user])
  const counts = useMemo(() => ({ open: tickets.filter((ticket) => ticket.status === 'open').length, answered: tickets.filter((ticket) => ticket.status === 'answered').length, closed: tickets.filter((ticket) => ticket.status === 'closed').length }), [tickets])
  return <PanelPage index="SUP.01" title="پشتیبانی و تیکت‌ها" description="درخواست جدید ثبت کنید و پاسخ دبیرخانه را برای هر تیم پیگیری کنید.">
    <div className="grid gap-4 sm:grid-cols-3"><StatCard index="01" label="در حال بررسی" value={counts.open} accent="orange" /><StatCard index="02" label="پاسخ داده‌شده" value={counts.answered} accent="blue" /><StatCard index="03" label="بسته‌شده" value={counts.closed} accent="green" /></div>
    <PanelCard title="تیکت‌های مجموعه" description="برای ارسال درخواست، ابتدا تیم مرتبط را انتخاب کنید.">
      {loading ? <p className="py-8 text-center text-sm text-slate-500">در حال بارگذاری…</p> : teams.length ? <><div className="mb-5 max-w-md"><Select label="تیم مرتبط" value={teamId} onChange={(event) => setTeamId(event.target.value)}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></div><TicketInbox key={teamId} mode="team" teamId={teamId} /></> : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><p className="font-black text-slate-700">هنوز تیمی ثبت نشده است</p><p className="mt-2 text-sm text-slate-500">پس از ایجاد اولین تیم، امکان ارسال تیکت فعال می‌شود.</p></div>}
    </PanelCard>
  </PanelPage>
}
