import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, Textarea } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, SectionLabel } from '@/components/panel/HudKit'
import { ImageUploadField } from '@/components/ui/ImageUploadField'
import {
  applySiteBrandColors,
  fetchSiteSettings,
  updateSiteSettings,
} from '@/features/settings/api'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { useToast } from '@/components/ui/Toast'
import type { SiteNavItem, SiteSettings } from '@/types/database'

const emptyNav = (): SiteNavItem => ({
  id: `nav-${Date.now()}`,
  href: '/',
  label_fa: '',
  label_en: '',
  enabled: true,
  order: 1,
})

export function SuperAdminSettingsPage() {
  const { t } = useTranslation()
  const { refresh } = useSiteSettings()
  const toast = useToast()
  const [form, setForm] = useState<SiteSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchSiteSettings()
      .then((s) => setForm(s))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const patch = (p: Partial<SiteSettings>) => {
    setForm((prev) => (prev ? { ...prev, ...p } : prev))
  }

  const onSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      const { id: _id, updated_at: _u, ...rest } = form
      const saved = await updateSiteSettings(rest)
      setForm(saved)
      applySiteBrandColors(saved)
      await refresh()
      toast.success('عنوان و توضیحات سایت با موفقیت ذخیره شد.')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <PanelPage index="SYS.09" title={t('settings.title')}>
        <p className="text-rc-muted">{t('app.loading')}</p>
      </PanelPage>
    )
  }

  if (!form) {
    return (
      <PanelPage index="SYS.09" title={t('settings.title')}>
        <FieldError message={error ?? t('common.error')} />
      </PanelPage>
    )
  }

  const nav = Array.isArray(form.nav_items) ? form.nav_items : []

  return (
    <PanelPage index="SYS.09" title={t('settings.title')} description={t('settings.subtitle')}>
      <FieldError message={error ?? undefined} />
      <form className="space-y-6" onSubmit={(e) => void onSave(e)}>
        <HudFrame className="space-y-3 p-4">
          <SectionLabel index="BR.01" title={t('settings.brand')} />
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label={t('settings.siteNameFa')}
              value={form.site_name_fa}
              onChange={(e) => patch({ site_name_fa: e.target.value })}
            />
            <Input
              label={t('settings.siteNameEn')}
              value={form.site_name_en}
              onChange={(e) => patch({ site_name_en: e.target.value })}
            />
            <Input
              label={t('settings.taglineFa')}
              value={form.tagline_fa ?? ''}
              onChange={(e) => patch({ tagline_fa: e.target.value })}
            />
            <Input
              label={t('settings.taglineEn')}
              value={form.tagline_en ?? ''}
              onChange={(e) => patch({ tagline_en: e.target.value })}
            />
          </div>
          <ImageUploadField
            label={t('settings.logo')}
            value={form.logo_url}
            onChange={(url) => patch({ logo_url: url })}
          />
          <ImageUploadField
            label={t('settings.favicon')}
            value={form.favicon_url}
            onChange={(url) => patch({ favicon_url: url })}
          />
        </HudFrame>

        <HudFrame className="space-y-4 p-4">
          <SectionLabel index="AUTH.02" title="ظاهر صفحه ورود" hint="لوگو، تصویر و پیام خوش‌آمدگویی بدون نیاز به تغییر کد از همین‌جا مدیریت می‌شوند." />
          <div className="grid gap-4 md:grid-cols-2">
            <ImageUploadField label="لوگوی صفحه ورود" value={form.login_logo_url ?? null} onChange={(url) => patch({ login_logo_url: url })} />
            <ImageUploadField label="تصویر پس‌زمینه صفحه ورود" value={form.login_cover_url ?? null} onChange={(url) => patch({ login_cover_url: url })} />
            <Input label="عنوان خوش‌آمدگویی (فارسی)" value={form.login_welcome_title_fa ?? ''} onChange={(e) => patch({ login_welcome_title_fa: e.target.value })} />
            <Input label="Welcome title (English)" value={form.login_welcome_title_en ?? ''} onChange={(e) => patch({ login_welcome_title_en: e.target.value })} dir="ltr" />
            <Textarea label="متن خوش‌آمدگویی (فارسی)" value={form.login_welcome_text_fa ?? ''} onChange={(e) => patch({ login_welcome_text_fa: e.target.value })} className="min-h-24" />
            <Textarea label="Welcome text (English)" value={form.login_welcome_text_en ?? ''} onChange={(e) => patch({ login_welcome_text_en: e.target.value })} className="min-h-24" dir="ltr" />
          </div>
        </HudFrame>

        <HudFrame className="space-y-3 p-4">
          <SectionLabel index="CL.02" title={t('settings.colors')} hint={t('settings.colorsHint')} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm text-rc-muted">{t('settings.colorPrimary')}</span>
              <input
                type="color"
                value={form.color_primary ?? '#3b82f6'}
                onChange={(e) => patch({ color_primary: e.target.value })}
                className="h-10 w-full cursor-pointer border border-rc-line bg-rc-surface"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-rc-muted">{t('settings.colorAccent')}</span>
              <input
                type="color"
                value={form.color_accent ?? '#fb923c'}
                onChange={(e) => patch({ color_accent: e.target.value })}
                className="h-10 w-full cursor-pointer border border-rc-line bg-rc-surface"
              />
            </label>
          </div>
        </HudFrame>

        <HudFrame className="space-y-4 p-4">
          <SectionLabel index="SEO.03" title={t('settings.seo')} hint="عنوان و توضیحی که در گوگل، مرورگر و هنگام اشتراک‌گذاری سایت نمایش داده می‌شود را از این بخش مدیریت کنید." />
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label={t('settings.seoTitleFa')}
              value={form.seo_title_fa ?? ''}
              onChange={(e) => patch({ seo_title_fa: e.target.value })}
              maxLength={70}
            />
            <Input
              label={t('settings.seoTitleEn')}
              value={form.seo_title_en ?? ''}
              onChange={(e) => patch({ seo_title_en: e.target.value })}
              maxLength={70}
              dir="ltr"
            />
            <Textarea
              label={t('settings.seoDescFa')}
              className="min-h-20"
              value={form.seo_description_fa ?? ''}
              onChange={(e) => patch({ seo_description_fa: e.target.value })}
              maxLength={180}
            />
            <Textarea
              label={t('settings.seoDescEn')}
              className="min-h-20"
              value={form.seo_description_en ?? ''}
              onChange={(e) => patch({ seo_description_en: e.target.value })}
              maxLength={180}
              dir="ltr"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
              <span>پیش‌نمایش نتیجه جست‌وجو</span>
              <span>{(form.seo_title_fa ?? '').length}/۷۰ · {(form.seo_description_fa ?? '').length}/۱۸۰</span>
            </div>
            <p className="truncate text-lg font-bold text-blue-700">{form.seo_title_fa?.trim() || form.site_name_fa}</p>
            <p className="mt-1 text-xs text-emerald-700" dir="ltr">robo.ecactus.co</p>
            <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-600">{form.seo_description_fa?.trim() || form.tagline_fa || 'توضیحات فارسی سایت در این قسمت نمایش داده می‌شود.'}</p>
          </div>
          <ImageUploadField
            label={t('settings.ogDefault')}
            value={form.og_image_default}
            onChange={(url) => patch({ og_image_default: url })}
          />
        </HudFrame>

        <HudFrame className="space-y-3 p-4">
          <SectionLabel index="NAV.04" title={t('settings.nav')} hint={t('settings.navHint')} />
          <ul className="space-y-3">
            {nav.map((item, idx) => (
              <li key={item.id} className="grid gap-2 border border-rc-line p-3 md:grid-cols-5">
                <Input
                  label="FA"
                  value={item.label_fa}
                  onChange={(e) => {
                    const next = [...nav]
                    next[idx] = { ...item, label_fa: e.target.value }
                    patch({ nav_items: next })
                  }}
                />
                <Input
                  label="EN"
                  value={item.label_en}
                  onChange={(e) => {
                    const next = [...nav]
                    next[idx] = { ...item, label_en: e.target.value }
                    patch({ nav_items: next })
                  }}
                />
                <Input
                  label="href"
                  value={item.href}
                  dir="ltr"
                  onChange={(e) => {
                    const next = [...nav]
                    next[idx] = { ...item, href: e.target.value }
                    patch({ nav_items: next })
                  }}
                />
                <Input
                  label="#"
                  type="number"
                  value={String(item.order)}
                  onChange={(e) => {
                    const next = [...nav]
                    next[idx] = { ...item, order: Number(e.target.value) || 0 }
                    patch({ nav_items: next })
                  }}
                />
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm text-rc-muted">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) => {
                        const next = [...nav]
                        next[idx] = { ...item, enabled: e.target.checked }
                        patch({ nav_items: next })
                      }}
                    />
                    {t('settings.enabled')}
                  </label>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => patch({ nav_items: nav.filter((_, i) => i !== idx) })}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" onClick={() => patch({ nav_items: [...nav, emptyNav()] })}>
            {t('settings.addNav')}
          </Button>
        </HudFrame>

        <HudFrame className="space-y-3 p-4">
          <SectionLabel index="TXT.05" title={t('settings.texts')} hint={t('settings.footerHint')} />
          <div className="grid gap-3 md:grid-cols-2">
            <Textarea
              label={t('settings.footerFa')}
              className="min-h-20"
              value={form.footer_fa ?? ''}
              onChange={(e) => patch({ footer_fa: e.target.value })}
            />
            <Textarea
              label={t('settings.footerEn')}
              className="min-h-20"
              value={form.footer_en ?? ''}
              onChange={(e) => patch({ footer_en: e.target.value })}
            />
            <Textarea
              label={t('settings.contactFa')}
              className="min-h-20"
              value={form.contact_blurb_fa ?? ''}
              onChange={(e) => patch({ contact_blurb_fa: e.target.value })}
            />
            <Textarea
              label={t('settings.contactEn')}
              className="min-h-20"
              value={form.contact_blurb_en ?? ''}
              onChange={(e) => patch({ contact_blurb_en: e.target.value })}
            />
            <Input
              label={t('settings.copyrightFa')}
              value={form.copyright_fa ?? ''}
              onChange={(e) => patch({ copyright_fa: e.target.value })}
            />
            <Input
              label={t('settings.copyrightEn')}
              value={form.copyright_en ?? ''}
              onChange={(e) => patch({ copyright_en: e.target.value })}
            />
            <Input
              label={t('settings.developerCreditFa')}
              value={form.developer_credit_fa ?? ''}
              onChange={(e) => patch({ developer_credit_fa: e.target.value })}
            />
            <Input
              label={t('settings.developerCreditEn')}
              value={form.developer_credit_en ?? ''}
              onChange={(e) => patch({ developer_credit_en: e.target.value })}
            />
            <Input
              label={t('settings.developerName')}
              value={form.developer_name ?? ''}
              onChange={(e) => patch({ developer_name: e.target.value })}
            />
            <Input
              label={t('settings.developerUrl')}
              value={form.developer_url ?? ''}
              onChange={(e) => patch({ developer_url: e.target.value })}
              dir="ltr"
            />
            <Input
              label={t('settings.contactEmail')}
              value={form.contact_email ?? ''}
              onChange={(e) => patch({ contact_email: e.target.value })}
              dir="ltr"
            />
            <Input
              label={t('settings.supportPhone')}
              value={form.support_phone ?? ''}
              onChange={(e) => patch({ support_phone: e.target.value })}
              dir="ltr"
            />
            <Textarea
              label={t('settings.addressFa')}
              className="min-h-16"
              value={form.contact_address_fa ?? ''}
              onChange={(e) => patch({ contact_address_fa: e.target.value })}
            />
            <Textarea
              label={t('settings.addressEn')}
              className="min-h-16"
              value={form.contact_address_en ?? ''}
              onChange={(e) => patch({ contact_address_en: e.target.value })}
            />
            <Input label={t('settings.contactMap')} value={form.contact_map_embed_url ?? ''} onChange={(e) => patch({ contact_map_embed_url: e.target.value })} dir="ltr" placeholder="https://www.google.com/maps/embed?..." />
            <Input label="Instagram" value={form.instagram_url ?? ''} onChange={(e) => patch({ instagram_url: e.target.value })} dir="ltr" placeholder="https://instagram.com/..." />
            <Input label="Telegram" value={form.telegram_url ?? ''} onChange={(e) => patch({ telegram_url: e.target.value })} dir="ltr" placeholder="https://t.me/..." />
            <Input label="LinkedIn" value={form.linkedin_url ?? ''} onChange={(e) => patch({ linkedin_url: e.target.value })} dir="ltr" placeholder="https://linkedin.com/..." />
            <Input label="WhatsApp" value={form.whatsapp_url ?? ''} onChange={(e) => patch({ whatsapp_url: e.target.value })} dir="ltr" placeholder="https://wa.me/..." />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ImageUploadField
              label={t('settings.trustSeal')}
              value={form.trust_seal_url ?? null}
              onChange={(url) => patch({ trust_seal_url: url })}
            />
            <Input
              label={t('settings.trustSealLink')}
              value={form.trust_seal_href ?? ''}
              onChange={(e) => patch({ trust_seal_href: e.target.value })}
              dir="ltr"
              placeholder="https://trustseal.enamad.ir/..."
            />
            <Textarea label={t('settings.trustSealHtml')} className="min-h-32 md:col-span-2" value={form.trust_seal_html ?? ''} onChange={(e) => patch({ trust_seal_html: e.target.value })} dir="ltr" placeholder={'<a href="..."><img src="..." alt="نماد اعتماد" /></a>'} />
            <p className="text-xs leading-6 text-slate-500 md:col-span-2">{t('settings.trustSealHtmlHint')}</p>
          </div>
        </HudFrame>

        <Button type="submit" disabled={busy}>
          {busy ? t('app.loading') : t('common.save')}
        </Button>
      </form>
    </PanelPage>
  )
}
