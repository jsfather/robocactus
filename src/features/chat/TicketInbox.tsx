import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { markTicketRead, useUnreadTicketCount } from '@/hooks/useUnreadTickets'
import {
  closeTicket,
  createTicket,
  fetchTicketMessages,
  fetchTickets,
  referTicket,
  replyTicket,
  fetchLeagueAdminsForLeague,
  uploadTicketAttachment,
} from '@/features/judging/api'
import {
  fetchTicketDepartments,
  setTicketDepartment,
} from '@/features/tickets/api'
import { fetchActiveLeagues } from '@/features/companies/api'
import { backend } from '@/lib/backend'
import { formatAppDateTime } from '@/lib/dates'
import type { League, Profile, Ticket, TicketDepartment, TicketMessage } from '@/types/database'

type Mode = 'team' | 'staff' | 'league'

function UnreadDot({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      className="ms-1 inline-block size-2 rounded-full bg-rc-accent"
      aria-hidden
    />
  )
}

export function TicketInbox({
  mode,
  teamId,
  leagueIds,
  departmentId,
}: {
  mode: Mode
  teamId?: string
  leagueIds?: string[]
  departmentId?: string
}) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { unreadIds, refresh: refreshUnread } = useUnreadTicketCount()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [leagues, setLeagues] = useState<League[]>([])
  const [referLeagueId, setReferLeagueId] = useState('')
  const [referAdminId, setReferAdminId] = useState('')
  const [admins, setAdmins] = useState<Array<{ user_id: string }>>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<TicketDepartment[]>([])
  const [assignDeptId, setAssignDeptId] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [liveHint, setLiveHint] = useState(false)
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  selectedIdRef.current = selectedId

  const reload = useCallback(async () => {
    setError(null)
    try {
      const list = await fetchTickets({
        teamId,
        generalOnly: mode === 'staff',
        leagueIds: mode === 'league' ? leagueIds : undefined,
        departmentId: departmentId || undefined,
      })
      setTickets(list)
      setSelectedId((prev) => {
        if (prev && !list.some((x) => x.id === prev)) return null
        return prev
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }, [teamId, mode, leagueIds, departmentId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (mode !== 'staff') return
    void fetchActiveLeagues().then(setLeagues).catch(() => undefined)
    void backend
      .from('profiles')
      .select('*')
      .then(({ data }) => setProfiles((data ?? []) as Profile[]))
    void fetchTicketDepartments(true).then(setDepartments).catch(() => undefined)
  }, [mode])

  // Load history + mark read when selecting a ticket
  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }

    let cancelled = false
    void fetchTicketMessages(selectedId)
      .then((msgs) => {
        if (!cancelled) setMessages(msgs)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    void markTicketRead(selectedId)
      .then(() => refreshUnread())
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [selectedId, refreshUnread])

  // Realtime: new messages on selected ticket + ticket list changes
  useEffect(() => {
    if (!user) return

    const channel = backend
      .channel(`tickets-inbox:${mode}:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_messages' },
        (payload) => {
          const msg = payload.new as TicketMessage
          const current = selectedIdRef.current

          if (current && msg.ticket_id === current) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })
            setLiveHint(true)
            if (msg.sender_id !== user.id) {
              void markTicketRead(current).then(() => refreshUnread())
            }
          } else if (msg.sender_id !== user.id) {
            void refreshUnread()
          }

          void reload()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => {
          void reload()
          void refreshUnread()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLiveHint(true)
      })

    return () => {
      void backend.removeChannel(channel)
    }
  }, [user, mode, reload, refreshUnread])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (!referLeagueId) {
      setAdmins([])
      return
    }
    void fetchLeagueAdminsForLeague(referLeagueId)
      .then(setAdmins)
      .catch(() => setAdmins([]))
  }, [referLeagueId])

  const selected = tickets.find((x) => x.id === selectedId) ?? null

  useEffect(() => {
    setAssignDeptId(selected?.department_id ?? '')
  }, [selected?.id, selected?.department_id])

  const onReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedId || (!reply.trim() && !attachFile)) return
    setBusy(true)
    setError(null)
    try {
      let attachment:
        | { url: string; name: string; mime: string; size: number }
        | undefined
      if (attachFile && user) {
        attachment = await uploadTicketAttachment(user.id, attachFile)
      }
      const msg = await replyTicket({
        ticketId: selectedId,
        body: reply.trim() || (attachment ? '📎' : ''),
        markAnswered: mode !== 'team',
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
        attachmentMime: attachment?.mime,
        attachmentSize: attachment?.size,
      })
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setReply('')
      setAttachFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await markTicketRead(selectedId)
      await refreshUnread()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!teamId || !newSubject.trim() || !newBody.trim()) return
    setBusy(true)
    setError(null)
    try {
      const ticket = await createTicket({
        teamId,
        subject: newSubject.trim(),
        body: newBody.trim(),
        leagueId: null,
      })
      setNewSubject('')
      setNewBody('')
      setSelectedId(ticket.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onRefer = async () => {
    if (!selectedId || !referLeagueId) return
    setBusy(true)
    setError(null)
    try {
      await referTicket({
        ticketId: selectedId,
        leagueId: referLeagueId,
        assignedTo: referAdminId || null,
      })
      setSelectedId(null)
      setReferLeagueId('')
      setReferAdminId('')
      await reload()
      await refreshUnread()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <PanelCard
        title={t('tickets.inbox')}
        description={liveHint ? t('tickets.realtimeOn') : t('tickets.realtimeConnecting')}
      >
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {tickets.length === 0 ? (
            <li className="text-sm text-rc-muted">{t('tickets.empty')}</li>
          ) : (
            tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full rounded-md px-3 py-2 text-start text-sm transition ${
                    selectedId === ticket.id
                      ? 'bg-rc-blue/15 text-rc-blue'
                      : 'text-rc-text hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center font-medium">
                    <span className="line-clamp-1">{ticket.subject}</span>
                    <UnreadDot show={unreadIds.includes(ticket.id)} />
                  </span>
                  <span className="font-mono text-xs text-rc-muted">{ticket.status}</span>
                  {ticket.league_id ? (
                    <span className="ms-2 font-mono text-xs text-rc-orange">
                      {t('tickets.specialized')}
                    </span>
                  ) : (
                    <span className="ms-2 font-mono text-xs text-rc-muted">
                      {t('tickets.general')}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </PanelCard>

      <div className="space-y-4">
        {mode === 'team' && teamId ? (
          <PanelCard title={t('tickets.newTitle')}>
            <form className="space-y-3" onSubmit={(e) => void onCreate(e)}>
              <Input
                label={t('tickets.subject')}
                required
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
              />
              <Textarea
                label={t('tickets.body')}
                required
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
              />
              <p className="text-xs text-rc-muted">{t('tickets.generalHint')}</p>
              <Button type="submit" disabled={busy}>
                {t('tickets.create')}
              </Button>
            </form>
          </PanelCard>
        ) : null}

        {selected ? (
          <PanelCard
            title={selected.subject}
            description={`${t('tickets.status')}: ${selected.status}`}
            actions={
              mode !== 'team' && selected.status !== 'closed' ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    void closeTicket(selected.id)
                      .then(reload)
                      .catch((err: Error) => setError(err.message))
                  }
                >
                  {t('tickets.close')}
                </Button>
              ) : null
            }
          >
            {mode === 'staff' ? (
              <div className="mb-4 flex flex-wrap items-end gap-2 border-b border-rc-line pb-4">
                <div className="min-w-48 flex-1">
                  <Select
                    label={t('tickets.department')}
                    value={assignDeptId}
                    onChange={(e) => setAssignDeptId(e.target.value)}
                  >
                    <option value="">{t('tickets.noDepartment')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void setTicketDepartment(selected.id, assignDeptId || null)
                      .then(reload)
                      .catch((err: Error) => setError(err.message))
                  }
                >
                  {t('tickets.assignDepartment')}
                </Button>
              </div>
            ) : null}

            <div className="mb-3 flex max-h-[28rem] flex-col gap-2 overflow-y-auto border border-rc-line bg-rc-bg/40 p-3">
              {messages.map((msg) => {
                const mine = msg.sender_id === user?.id
                return (
                  <div
                    key={msg.id}
                    className={`max-w-[85%] px-3 py-2 text-sm ${
                      mine ? 'ms-auto bg-rc-blue/20' : 'me-auto bg-rc-surface'
                    }`}
                  >
                    {msg.body && msg.body !== '📎' ? (
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                    ) : null}
                    {msg.attachment_url ? (
                      <a
                        href={msg.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 border border-rc-line bg-rc-navy/60 px-2.5 py-1.5 text-xs text-rc-blue hover:underline"
                      >
                        📎 {msg.attachment_name ?? t('tickets.attachment')}
                      </a>
                    ) : null}
                    <p className="mt-1 font-mono text-[10px] text-rc-muted">
                      {formatAppDateTime(msg.created_at, i18n.language)}
                    </p>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <form className="flex flex-col gap-2" onSubmit={(e) => void onReply(e)}>
              <Textarea
                label={t('tickets.reply')}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp,application/pdf"
                  className="text-xs text-rc-muted file:me-2 file:border file:border-rc-line file:bg-rc-surface file:px-2 file:py-1"
                  onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
                />
                {attachFile ? (
                  <span className="font-mono text-[10px] text-rc-blue">{attachFile.name}</span>
                ) : (
                  <span className="text-xs text-rc-muted">{t('tickets.attachHint')}</span>
                )}
              </div>
              <Button type="submit" disabled={busy || (!reply.trim() && !attachFile)}>
                {t('tickets.send')}
              </Button>
            </form>

            {mode === 'staff' && !selected.league_id ? (
              <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <Select
                  label={t('tickets.referLeague')}
                  value={referLeagueId}
                  onChange={(e) => {
                    setReferLeagueId(e.target.value)
                    setReferAdminId('')
                  }}
                >
                  <option value="">{t('team.selectLeague')}</option>
                  {leagues.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label={t('tickets.referAdmin')}
                  value={referAdminId}
                  onChange={(e) => setReferAdminId(e.target.value)}
                >
                  <option value="">{t('tickets.anyAdmin')}</option>
                  {admins.map((a) => {
                    const p = profiles.find((x) => x.id === a.user_id)
                    return (
                      <option key={a.user_id} value={a.user_id}>
                        {p ? `${p.full_name} (${p.phone})` : a.user_id.slice(0, 8)}
                      </option>
                    )
                  })}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onRefer()}
                  disabled={busy}
                >
                  {t('tickets.refer')}
                </Button>
              </div>
            ) : null}
          </PanelCard>
        ) : (
          <p className="text-sm text-rc-muted">{t('tickets.selectHint')}</p>
        )}

        <FieldError message={error ?? undefined} />
      </div>
    </div>
  )
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ms-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rc-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rc-bg">
      {count > 99 ? '99+' : count}
    </span>
  )
}
