import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Textarea, FieldError, PanelCard, Select } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { createCompany, updateCompany, uploadCompanyLogo } from '@/features/companies/api'
import { slugify } from '@/lib/validation'
import type { Company } from '@/types/database'

interface CompanyFormProps {
  company?: Company | null
  onSaved: (company: Company) => void
}

const toLatinDigits = (value: string) => value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))

function displayFoundedYear(value: number | null | undefined, isFa: boolean): string {
  if (!value) return ''
  return String(isFa ? (value > 1700 ? value - 621 : value) : (value < 1700 ? value + 621 : value))
}

export function CompanyForm({ company, onSaved }: CompanyFormProps) {
  const { t, i18n } = useTranslation()
  const { user, profile } = useAuth()
  const isEdit = Boolean(company)
  const isFa = i18n.language.toLowerCase().startsWith('fa')
  const currentGregorianYear = new Date().getFullYear()
  const currentPersianYear = Number(toLatinDigits(new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date())).replace(/\D/g, ''))

  const [name, setName] = useState(company?.name ?? (profile?.account_type === 'individual' ? profile.full_name : profile?.company_name) ?? '')
  const [entityType, setEntityType] = useState<NonNullable<Company['entity_type']>>(company?.entity_type ?? (profile?.account_type === 'individual' ? 'individual' : 'company'))
  const [bio, setBio] = useState(company?.bio ?? '')
  const [tagline, setTagline] = useState(company?.tagline ?? '')
  const [website, setWebsite] = useState(company?.website ?? '')
  const [foundedYear, setFoundedYear] = useState(
    displayFoundedYear(company?.founded_year, isFa),
  )
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!company) return
    setName(company.name)
    setEntityType(company.entity_type ?? (profile?.account_type === 'individual' ? 'individual' : 'company'))
    setBio(company.bio ?? '')
    setTagline(company.tagline ?? '')
    setWebsite(company.website ?? '')
    setFoundedYear(displayFoundedYear(company.founded_year, isFa))
  }, [company, isFa, profile?.account_type])

  const onNameChange = (value: string) => {
    setName(value)
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setError(null)
    setSaving(true)

    try {
      const enteredYear = foundedYear ? Number(toLatinDigits(foundedYear)) : null
      const maximumYear = isFa ? currentPersianYear : currentGregorianYear
      if (enteredYear != null && (!Number.isInteger(enteredYear) || enteredYear <= 0 || enteredYear > maximumYear)) {
        throw new Error(isFa ? `سال تأسیس باید حداکثر ${maximumYear.toLocaleString('fa-IR')} باشد.` : `Founded year cannot be later than ${maximumYear}.`)
      }
      const storedFoundedYear = enteredYear == null ? null : isFa && enteredYear < 1700 ? enteredYear + 621 : enteredYear
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
        slug: company?.slug ?? `${slugify(name) || 'organization'}-${crypto.randomUUID().slice(0, 8)}`,
        entity_type: entityType,
        bio: bio.trim() || undefined,
        tagline: tagline.trim() || undefined,
        website: website.trim() || undefined,
        founded_year: storedFoundedYear,
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
                  entity_type: payload.entity_type,
                })
              }
              return updateCompany(created.id, { entity_type: payload.entity_type })
            })

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
        <Select label="نوع مجموعه" value={entityType} onChange={(event) => setEntityType(event.target.value as NonNullable<Company['entity_type']>)}><option value="individual">شخص حقیقی</option><option value="company">شرکت</option><option value="institute">مؤسسه</option><option value="school">مدرسه</option><option value="university">دانشگاه</option><option value="academy">آموزشگاه</option><option value="club">باشگاه</option><option value="other">سایر</option></Select>
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
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={foundedYear}
          onChange={(e) => setFoundedYear(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 4))}
          dir="ltr"
          placeholder={String(isFa ? currentPersianYear : currentGregorianYear)}
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
