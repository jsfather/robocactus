import { backend } from '@/lib/backend'
import type { Company, CompanyMember, League, Team } from '@/types/database'
import { validateLogoFile } from '@/lib/validation'

export async function fetchMyCompanies(userId: string): Promise<Company[]> {
  const { data: memberships, error: memberError } = await backend
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)

  if (memberError) throw new Error(memberError.message)
  if (!memberships?.length) return []

  const ids = memberships.map((m: { company_id: string }) => m.company_id)
  const { data, error } = await backend.from('companies').select('*').in('id', ids)

  if (error) throw new Error(error.message)
  return (data ?? []) as Company[]
}

export async function fetchCompanyMembership(
  companyId: string,
  userId: string,
): Promise<CompanyMember | null> {
  const { data, error } = await backend
    .from('company_members')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as CompanyMember | null
}

export async function createCompany(input: {
  name: string
  slug: string
  bio?: string
  founded_year?: number | null
  website?: string
  logo_url?: string | null
}): Promise<Company> {
  const { data, error } = await backend.rpc('create_company', {
    p_name: input.name,
    p_slug: input.slug,
    p_bio: input.bio ?? null,
    p_founded_year: input.founded_year ?? null,
    p_website: input.website ?? null,
    p_logo_url: input.logo_url ?? null,
  })

  if (error) throw new Error(error.message)
  return data as Company
}

export async function updateCompany(
  companyId: string,
  patch: Partial<
    Pick<Company, 'name' | 'slug' | 'bio' | 'founded_year' | 'website' | 'logo_url' | 'cover_image_url' | 'tagline' | 'entity_type'>
  >,
): Promise<Company> {
  const { data, error } = await backend
    .from('companies')
    .update(patch)
    .eq('id', companyId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as Company
}

export async function uploadCompanyLogo(userId: string, file: File): Promise<string> {
  const validation = validateLogoFile(file)
  if (validation) throw new Error(validation)

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${userId}/logo-${Date.now()}.${ext}`

  const { error } = await backend.storage.from('company-logos').upload(path, file, {
    upsert: true,
    contentType: file.type,
  })

  if (error) throw new Error(error.message)

  const { data } = backend.storage.from('company-logos').getPublicUrl(path)
  return data.publicUrl
}

export async function fetchActiveLeagues(): Promise<League[]> {
  const { data, error } = await backend
    .from('leagues')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as League[]
}

export async function fetchCompanyTeams(companyId: string): Promise<Team[]> {
  const { data, error } = await backend
    .from('teams')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Team[]
}
