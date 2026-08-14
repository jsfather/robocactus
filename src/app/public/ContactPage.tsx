import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Textarea } from '@/components/ui/FormControls'
import { fetchStaticPage } from '@/features/leagues/adminApi'
import { submitContactMessage } from '@/features/home/api'

export function ContactPage() {
  const { t } = useTranslation()
  const [introHtml, setIntroHtml] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchStaticPage('contact')
      .then((page) => setIntroHtml(page?.body ?? null))
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
      })
      setDone(true)
      setFullName('')
      setEmail('')
      setPhone('')
      setSubject('')
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
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
            <FieldError message={error ?? undefined} />
            {done ? <p className="text-sm text-emerald-400">{t('home.contactSent')}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? t('app.loading') : t('home.contactSend')}
            </Button>
          </form>
        </PanelCard>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">{t('home.contactMap')}</h2>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <iframe
              title={t('home.contactMap')}
              src="https://www.openstreetmap.org/export/embed.html?bbox=51.35%2C35.68%2C51.45%2C35.74&layer=mapnik&marker=35.71%2C51.40"
              className="h-80 w-full bg-rc-navy"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <p className="text-sm text-rc-muted">{t('home.contactMapHint')}</p>
        </div>
      </div>
    </div>
  )
}
