import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Textarea, FieldError, PanelCard } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { createCompany, updateCompany, uploadCompanyLogo } from '@/features/companies/api'
import { slugify } from '@/lib/validation'
import type { Company } from '@/types/database'

interface CompanyFormProps {
  company?: Company | null
  onSaved: (company: Company) => void
}

export function CompanyForm({ company, onSaved }: CompanyFormProps) {
  const { t } = useTranslation()
  const { user, refreshProfile } = useAuth()
  const isEdit = Boolean(company)

  const [name, setName] = useState(company?.name ?? '')
  const [slug, setSlug] = useState(company?.slug ?? '')
  const [bio, setBio] = useState(company?.bio ?? '')
  const [tagline, setTagline] = useState(company?.tagline ?? '')
  const [website, setWebsite] = useState(company?.website ?? '')
  const [foundedYear, setFoundedYear] = useState(
    company?.founded_year ? String(company.founded_year) : '',
  )
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!company) return
    setName(company.name)
    setSlug(company.slug)
    setBio(company.bio ?? '')
    setTagline(company.tagline ?? '')
    setWebsite(company.website ?? '')
    setFoundedYear(company.founded_year ? String(company.founded_year) : '')
  }, [company])

  const onNameChange = (value: string) => {
    setName(value)
    if (!isEdit || slug === slugify(company?.name ?? '')) {
      setSlug(slugify(value))
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setError(null)
    setSaving(true)

    try {
      let logoUrl = company?.logo_url ?? null
      let coverUrl = company?.cover_image_url ?? null
      if (logoFile) {
        logoUrl = await uploadCompanyLogo(user.id, logoFile)
      }
      if (coverFile) {
        coverUrl = await uploadCompanyLogo(user.id, coverFile)
      }

      const payload = {
        name: name.trim(),
        slug: slugify(slug || name),
        bio: bio.trim() || undefined,
        tagline: tagline.trim() || undefined,
        website: website.trim() || undefined,
        founded_year: foundedYear ? Number(foundedYear) : null,
        logo_url: logoUrl,
        cover_image_url: coverUrl,
      }

      const saved =
        isEdit && company
          ? await updateCompany(company.id, payload)
          : await createCompany({
              name: payload.name,
              slug: payload.slug,
              bio: payload.bio,
              website: payload.website,
              founded_year: payload.founded_year,
              logo_url: payload.logo_url,
            }).then(async (created) => {
              if (payload.cover_image_url || payload.tagline) {
                return updateCompany(created.id, {
                  cover_image_url: payload.cover_image_url,
                  tagline: payload.tagline,
                })
              }
              return created
            })

      await refreshProfile()
      onSaved(saved)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error'
      if (message === 'invalid_type' || message === 'too_large') {
        setError(t(`company.logoErrors.${message}`))
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <PanelCard
      title={isEdit ? t('company.editTitle') : t('company.createTitle')}
      description={t('company.formHint')}
    >
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
        <Input
          label={t('company.name')}
          name="name"
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <Input
          label={t('company.slug')}
          name="slug"
          required
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          dir="ltr"
        />
        <Input
          label={t('company.website')}
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          dir="ltr"
          placeholder="https://"
        />
        <Input
          label={t('company.foundedYear')}
          name="foundedYear"
          type="number"
          min={1900}
          max={2100}
          value={foundedYear}
          onChange={(e) => setFoundedYear(e.target.value)}
          dir="ltr"
        />
        <div className="md:col-span-2">
          <Input
            label={t('company.tagline')}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Textarea
            label={t('company.bio')}
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block space-y-1.5">
            <span className="text-sm text-rc-muted">{t('company.logo')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-rc-muted file:me-3 file:rounded-md file:border-0 file:bg-rc-blue/15 file:px-3 file:py-2 file:text-rc-blue"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt=""
                className="mt-2 size-16 rounded-md border border-white/10 object-cover"
              />
            ) : null}
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="block space-y-1.5">
            <span className="text-sm text-rc-muted">{t('company.cover')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-rc-muted file:me-3 file:rounded-md file:border-0 file:bg-rc-blue/15 file:px-3 file:py-2 file:text-rc-blue"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            />
            {company?.cover_image_url ? (
              <img
                src={company.cover_image_url}
                alt=""
                className="mt-2 h-28 w-full rounded-md border border-white/10 object-cover"
              />
            ) : null}
          </label>
        </div>
        <div className="md:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? t('app.loading') : t('common.save')}
          </Button>
          <FieldError message={error ?? undefined} />
        </div>
      </form>
    </PanelCard>
  )
}
