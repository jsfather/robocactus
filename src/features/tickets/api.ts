import { supabase } from '@/lib/supabase'
import { slugify } from '@/lib/validation'
import type { TicketDepartment } from '@/types/database'

export type TicketStatusCounts = {
  open: number
  answered: number
  closed: number
  total: number
}

export async function fetchTicketStatusCounts(): Promise<TicketStatusCounts> {
  const { data, error } = await supabase.rpc('ticket_status_counts')
  if (error) {
    // Fallback if RPC not yet migrated
    const { data: rows, error: e2 } = await supabase.from('tickets').select('status')
    if (e2) throw new Error(error.message)
    const list = (rows ?? []) as Array<{ status: string }>
    return {
      open: list.filter((x) => x.status === 'open').length,
      answered: list.filter((x) => x.status === 'answered').length,
      closed: list.filter((x) => x.status === 'closed').length,
      total: list.length,
    }
  }
  const d = data as TicketStatusCounts
  return {
    open: Number(d.open ?? 0),
    answered: Number(d.answered ?? 0),
    closed: Number(d.closed ?? 0),
    total: Number(d.total ?? 0),
  }
}

export async function fetchTicketDepartments(activeOnly = false): Promise<TicketDepartment[]> {
  let query = supabase.from('ticket_departments').select('*').order('sort_order')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as TicketDepartment[]
}

export async function upsertTicketDepartment(input: {
  id?: string
  name: string
  slug?: string
  description?: string | null
  is_active?: boolean
  sort_order?: number
}): Promise<TicketDepartment> {
  const payload = {
    name: input.name.trim(),
    slug: slugify(input.slug || input.name),
    description: input.description ?? null,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('ticket_departments')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as TicketDepartment
  }
  const { data, error } = await supabase.from('ticket_departments').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as TicketDepartment
}

export async function deleteTicketDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('ticket_departments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setTicketDepartment(ticketId: string, departmentId: string | null): Promise<void> {
  const { error } = await supabase
    .from('tickets')
    .update({ department_id: departmentId })
    .eq('id', ticketId)
  if (error) throw new Error(error.message)
}
