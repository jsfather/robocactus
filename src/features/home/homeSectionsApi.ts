import { backend } from '@/lib/backend'

export type HomeSponsor = {
  id: string
  name: string
  logo_url: string
  link_url: string | null
  sort_order: number
  is_active: boolean
}

export type HomeEvent = {
  id: string
  title_fa: string
  title_en: string
  description_fa: string | null
  description_en: string | null
  event_date: string
  end_date: string | null
  location_fa: string | null
  location_en: string | null
  sort_order: number
  is_active: boolean
}

export type HomePartner = {
  id: string
  name_fa: string
  name_en: string
  logo_url: string | null
  link_url: string | null
  kind: 'university' | 'scientific' | 'organization'
  sort_order: number
  is_active: boolean
}

export type HomeWhyCard = {
  id: string
  title_fa: string
  title_en: string
  body_fa: string | null
  body_en: string | null
  icon_key: string
  sort_order: number
  is_active: boolean
}

export type HomeFaq = {
  id: string
  question_fa: string
  question_en: string
  answer_fa: string
  answer_en: string
  sort_order: number
  is_active: boolean
}

export type HomeStatCard = {
  id: string
  label_fa: string
  label_en: string
  value_num: number
  suffix: string | null
  sort_order: number
  is_active: boolean
}

async function fetchActive<T>(table: string): Promise<T[]> {
  const { data, error } = await backend
    .from(table)
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

async function fetchAll<T>(table: string): Promise<T[]> {
  const { data, error } = await backend.from(table).select('*').order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

async function upsertRow<T extends { id?: string }>(
  table: string,
  row: Record<string, unknown> & { id?: string },
): Promise<T> {
  if (row.id) {
    const { id, ...rest } = row
    const { data, error } = await backend.from(table).update(rest).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    return data as T
  }
  const { id: _id, ...rest } = row
  const { data, error } = await backend.from(table).insert(rest).select('*').single()
  if (error) throw new Error(error.message)
  return data as T
}

async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await backend.from(table).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export const fetchActiveSponsors = () => fetchActive<HomeSponsor>('home_sponsors')
export const fetchAllSponsors = () => fetchAll<HomeSponsor>('home_sponsors')
export const upsertSponsor = (row: Partial<HomeSponsor> & { name: string; logo_url: string }) =>
  upsertRow<HomeSponsor>('home_sponsors', row)
export const deleteSponsor = (id: string) => deleteRow('home_sponsors', id)

export const fetchActiveEvents = () => fetchActive<HomeEvent>('home_events')
export const fetchAllEvents = () => fetchAll<HomeEvent>('home_events')
export const upsertEvent = (
  row: Partial<HomeEvent> & { title_fa: string; title_en: string; event_date: string },
) => upsertRow<HomeEvent>('home_events', row)
export const deleteEvent = (id: string) => deleteRow('home_events', id)

export const fetchActivePartners = () => fetchActive<HomePartner>('home_partners')
export const fetchAllPartners = () => fetchAll<HomePartner>('home_partners')
export const upsertPartner = (
  row: Partial<HomePartner> & { name_fa: string; name_en: string },
) => upsertRow<HomePartner>('home_partners', row)
export const deletePartner = (id: string) => deleteRow('home_partners', id)

export const fetchActiveWhyCards = () => fetchActive<HomeWhyCard>('home_why_cards')
export const fetchAllWhyCards = () => fetchAll<HomeWhyCard>('home_why_cards')
export const upsertWhyCard = (
  row: Partial<HomeWhyCard> & { title_fa: string; title_en: string },
) => upsertRow<HomeWhyCard>('home_why_cards', row)
export const deleteWhyCard = (id: string) => deleteRow('home_why_cards', id)

export const fetchActiveFaqs = () => fetchActive<HomeFaq>('home_faqs')
export const fetchAllFaqs = () => fetchAll<HomeFaq>('home_faqs')
export const upsertFaq = (
  row: Partial<HomeFaq> & {
    question_fa: string
    question_en: string
    answer_fa: string
    answer_en: string
  },
) => upsertRow<HomeFaq>('home_faqs', row)
export const deleteFaq = (id: string) => deleteRow('home_faqs', id)

export const fetchActiveStatCards = () => fetchActive<HomeStatCard>('home_stat_cards')
export const fetchAllStatCards = () => fetchAll<HomeStatCard>('home_stat_cards')
export const upsertStatCard = (
  row: Partial<HomeStatCard> & { label_fa: string; label_en: string; value_num: number },
) => upsertRow<HomeStatCard>('home_stat_cards', row)
export const deleteStatCard = (id: string) => deleteRow('home_stat_cards', id)
