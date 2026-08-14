import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

type UnreadCtx = {
  count: number
  unreadIds: string[]
  refresh: () => Promise<void>
}

const UnreadTicketsContext = createContext<UnreadCtx | null>(null)

/** Single realtime subscription for the whole app (avoids double-subscribe crash). */
export function UnreadTicketsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [count, setCount] = useState(0)
  const [unreadIds, setUnreadIds] = useState<string[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0)
      setUnreadIds([])
      return
    }
    const [{ data: total, error: countError }, { data: ids, error: idsError }] = await Promise.all([
      supabase.rpc('count_unread_tickets'),
      supabase.rpc('list_unread_ticket_ids'),
    ])
    if (!countError) setCount(Number(total ?? 0))
    if (!idsError) setUnreadIds(((ids as string[] | null) ?? []).map(String))
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh, profile?.role])

  useEffect(() => {
    if (!user) {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      return
    }

    // Tear down any previous channel before creating a new one
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase.channel(`unread-tickets:${user.id}`)
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_messages' },
        () => {
          void refresh()
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        void refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_reads' }, () => {
        void refresh()
      })

    channel.subscribe()
    channelRef.current = channel

    return () => {
      if (channelRef.current === channel) {
        void supabase.removeChannel(channel)
        channelRef.current = null
      }
    }
  }, [user?.id, refresh])

  const value = useMemo(() => ({ count, unreadIds, refresh }), [count, unreadIds, refresh])

  return (
    <UnreadTicketsContext.Provider value={value}>{children}</UnreadTicketsContext.Provider>
  )
}

export function useUnreadTicketCount() {
  const ctx = useContext(UnreadTicketsContext)
  // Fallback when used outside provider (should be rare)
  const { user, profile } = useAuth()
  const [count, setCount] = useState(0)
  const [unreadIds, setUnreadIds] = useState<string[]>([])

  const refreshFallback = useCallback(async () => {
    if (!user) {
      setCount(0)
      setUnreadIds([])
      return
    }
    const [{ data: total }, { data: ids }] = await Promise.all([
      supabase.rpc('count_unread_tickets'),
      supabase.rpc('list_unread_ticket_ids'),
    ])
    setCount(Number(total ?? 0))
    setUnreadIds(((ids as string[] | null) ?? []).map(String))
  }, [user])

  useEffect(() => {
    if (ctx) return
    void refreshFallback()
    // Poll only — no realtime outside provider
    const id = window.setInterval(() => void refreshFallback(), 60_000)
    return () => window.clearInterval(id)
  }, [ctx, refreshFallback, profile?.role])

  if (ctx) return ctx
  return { count, unreadIds, refresh: refreshFallback }
}

export async function markTicketRead(ticketId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_ticket_read', { p_ticket_id: ticketId })
  if (error) throw new Error(error.message)
}
