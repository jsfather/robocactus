import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Textarea } from '@/components/ui/FormControls'
import { fetchStaticPage } from '@/features/leagues/adminApi'
import { submitContactMessage } from '@/features/home/api'
import { ArcaptchaField, captchaErrorMessage } from '@/features/captcha/ArcaptchaField'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sanitizeHtml } from '@/lib/sanitize'

export function ContactPage() {
  const { t, i18n } = useTranslation()
  const { settings } = useSiteSettings()
  const [introHtml, setIntroHtml] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const supportPhone = settings?.support_phone?.trim()
  const telephoneHref = supportPhone ? `tel:${supportPhone.replace(/[^\d+]/g, '')}` : null
  const contactAddress = i18n.language.startsWith('en') ? settings?.contact_address_en : settings?.contact_address_fa
  const mapEmbedUrl = settings?.contact_map_embed_url?.trim()
  const safeMapEmbedUrl = mapEmbedUrl && /^https:\/\/(www\.)?(google\.[^/]+|maps\.googleapis\.com)\//i.test(mapEmbedUrl) ? mapEmbedUrl : null
  const socialLinks = [
    ['Instagram', settings?.instagram_url], ['Telegram', settings?.telegram_url],
    ['LinkedIn', settings?.linkedin_url], ['WhatsApp', settings?.whatsapp_url],
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim() && /^https:\/\//i.test(item[1])))

  useEffect(() => {
    void fetchStaticPage('contact')
      .then((page) => setIntroHtml(page?.body ? sanitizeHtml(page.body) : null))
      .catch(() => undefined)
  }, [])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await submitContactMessage({
        full_name: fullName,
        email,
        phone,
        subject,
        body,
        captchaToken,
      })
      setDone(true)
      setFullName('')
      setEmail('')
      setPhone('')
      setSubject('')
      setBody('')
      setCaptchaToken('')
      setCaptchaReset((value) => value + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message.startsWith('captcha_') ? captchaErrorMessage(message) : message)
      setCaptchaToken('')
      setCaptchaReset((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">{t('nav.contact')}</h1>
        <p className="mt-1 text-rc-muted">{t('home.contactSubtitle')}</p>
      </div>

      {introHtml ? (
        <div
          className="max-w-3xl leading-relaxed text-rc-muted [&_a]:text-rc-blue"
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      {(supportPhone || settings?.contact_email || contactAddress) ? (
        <section className="grid gap-3 rounded-[1.75rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50/70 p-4 shadow-[0_16px_45px_rgb(8_126_184/0.08)] sm:grid-cols-3 sm:p-6" aria-label={t('footer.contact')}>
          {supportPhone && telephoneHref ? <a href={telephoneHref} className="group flex items-center gap-3 rounded-2xl border border-sky-100 bg-white p-4 transition duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700 transition group-hover:bg-sky-600 group-hover:text-white"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-4-1-1.2 2a13.8 13.8 0 0 1-9.8-9.8L8 7 7 3Z" /></svg></span><span className="min-w-0"><span className="block text-xs font-bold text-slate-400">{t('auth.phone')}</span><span className="mt-1 block truncate font-black text-slate-800" dir="ltr">{supportPhone}</span></span></a> : null}
          {settings?.contact_email ? <a href={`mailto:${settings.contact_email}`} className="group flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-4 transition duration-300 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg></span><span className="min-w-0"><span className="block text-xs font-bold text-slate-400">{t('auth.email')}</span><span className="mt-1 block truncate font-black text-slate-800" dir="ltr">{settings.contact_email}</span></span></a> : null}
          {contactAddress ? <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg></span><span className="min-w-0"><span className="block text-xs font-bold text-slate-400">{t('auth.address')}</span><span className="mt-1 block text-sm font-bold leading-6 text-slate-700">{contactAddress}</span></span></div> : null}
        </section>
      ) : null}

      {socialLinks.length ? <section className="rounded-[1.75rem] border border-sky-100 bg-white p-5 shadow-[0_16px_45px_rgb(8_126_184/0.07)] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">{i18n.language.startsWith('en') ? 'Follow us' : 'ما را در شبکه‌های اجتماعی دنبال کنید'}</h2><p className="mt-1 text-xs text-slate-500">{i18n.language.startsWith('en') ? 'Official Tabarestan Cup communication channels' : 'کانال‌های رسمی ارتباطی جام تبرستان'}</p></div><div className="flex flex-wrap gap-2">{socialLinks.map(([name, href]) => <a key={name} href={href} target="_blank" rel="noreferrer noopener" className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-2.5 text-sm font-black text-sky-800 transition hover:-translate-y-0.5 hover:bg-sky-700 hover:text-white">{name}</a>)}</div></div></section> : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <PanelCard title={t('home.contactForm')}>
          <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <Input
              label={t('auth.fullName')}
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              label={t('auth.email')}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
            <Input
              label={t('auth.phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
            />
            <Input
              label={t('home.contactSubject')}
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              label={t('home.contactBody')}
              required
              className="min-h-32"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <ArcaptchaField context="contact" onToken={setCaptchaToken} resetKey={captchaReset} />
            <FieldError message={error ?? undefined} />
            {done ? <p className="text-sm text-emerald-400">{t('home.contactSent')}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? t('app.loading') : t('home.contactSend')}
            </Button>
          </form>
        </PanelCard>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">{t('home.contactMap')}</h2>
          {safeMapEmbedUrl ? <div className="overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white p-2 shadow-[0_16px_45px_rgb(8_126_184/0.09)]">
            <iframe
              title={t('home.contactMap')}
              src={safeMapEmbedUrl}
              className="h-80 w-full rounded-2xl bg-slate-100"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div> : <div className="grid h-80 place-items-center rounded-[1.75rem] border border-dashed border-sky-200 bg-sky-50/50 p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-sky-700 shadow-sm">⌖</span><p className="mt-3 text-sm font-bold text-slate-600">{contactAddress || t('home.contactMapHint')}</p></div></div>}
          {contactAddress ? <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">{contactAddress}</p> : null}
        </div>
      </div>
    </div>
  )
}
