import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sortedNavItems } from '@/features/settings/api'

const FALLBACK_LINKS = [
  { href: '/leagues', labelKey: 'nav.leagues' },
  { href: '/rankings', labelKey: 'nav.rankings' },
  { href: '/companies', labelKey: 'nav.companies' },
  { href: '/blog', labelKey: 'nav.blog' },
  { href: '/gallery', labelKey: 'nav.gallery' },
  { href: '/about', labelKey: 'nav.about' },
  { href: '/contact', labelKey: 'nav.contact' },
  { href: '/faq', labelKey: 'nav.faq' },
  { href: '/privacy', labelKey: 'nav.privacy' },
] as const

export function PublicFooter() {
  const { t, i18n } = useTranslation()
  const { settings } = useSiteSettings()
  const isEn = i18n.language.startsWith('en')

  const brand = isEn
    ? settings?.site_name_en || t('app.name')
    : settings?.site_name_fa || t('app.name')
  const about = isEn
    ? settings?.footer_en || settings?.tagline_en
    : settings?.footer_fa || settings?.tagline_fa
  const contactBlurb = isEn ? settings?.contact_blurb_en : settings?.contact_blurb_fa
  const address = isEn ? settings?.contact_address_en : settings?.contact_address_fa
  const copyright = isEn
    ? settings?.copyright_en || t('footer.copyrightDefault')
    : settings?.copyright_fa || t('footer.copyrightDefault')
  const phone = settings?.support_phone
  const email = settings?.contact_email
  const nav = sortedNavItems(settings?.nav_items)
  const useful = nav.length
    ? nav
    : FALLBACK_LINKS.map((l, i) => ({
        id: String(i),
        href: l.href,
        label_fa: t(l.labelKey),
        label_en: t(l.labelKey),
        enabled: true,
        order: i,
      }))

  return (
    <footer className="relative mt-10 overflow-hidden border-t border-rc-line">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 50% 60% at 20% 0%, var(--rc-glow-blue), transparent), radial-gradient(ellipse 40% 50% at 90% 100%, var(--rc-glow-orange), transparent)',
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-rc-blue/50 to-transparent" />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-rc-blue uppercase">RoboCactus</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{brand}</p>
          {about ? <p className="mt-4 max-w-sm text-sm leading-7 text-rc-muted">{about}</p> : null}
          <div className="mt-5 flex gap-2">
            <span className="size-2 animate-rc-soft-pulse bg-rc-blue" />
            <span className="font-mono text-[10px] tracking-wide text-rc-muted uppercase">
              Live competition platform
            </span>
          </div>
        </div>

        <div>
          <p className="mb-4 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">
            {t('footer.usefulLinks')}
          </p>
          <ul className="grid grid-cols-1 gap-2.5 text-sm text-rc-muted sm:grid-cols-2">
            {useful.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="inline-flex items-center gap-2 transition hover:text-rc-blue"
                >
                  <span className="size-1 bg-rc-blue/70" />
                  {isEn ? item.label_en : item.label_fa}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-4 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">
            {t('footer.contact')}
          </p>
          <ul className="space-y-3 text-sm text-rc-muted">
            {phone ? (
              <li>
                <a href={`tel:${phone}`} className="hover:text-rc-blue" dir="ltr">
                  {phone}
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a href={`mailto:${email}`} className="hover:text-rc-blue" dir="ltr">
                  {email}
                </a>
              </li>
            ) : null}
            {address ? <li className="leading-relaxed">{address}</li> : null}
            {contactBlurb ? <li className="leading-relaxed">{contactBlurb}</li> : null}
            {!phone && !email && !address && !contactBlurb ? (
              <li>{t('footer.contactEmpty')}</li>
            ) : null}
          </ul>
        </div>

        <div>
          <p className="mb-4 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">
            {t('footer.trust')}
          </p>
          {settings?.trust_seal_url ? (
            <a
              href={settings.trust_seal_href || '#'}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-block border border-rc-line bg-rc-surface/70 p-3 transition hover:border-rc-blue/40"
            >
              <img
                src={settings.trust_seal_url}
                alt={t('footer.trust')}
                className="h-24 w-auto object-contain"
              />
            </a>
          ) : (
            <div className="flex h-28 w-32 items-center justify-center border border-dashed border-rc-line bg-rc-surface/40 text-center font-mono text-[10px] leading-relaxed text-rc-muted">
              {t('footer.trustPlaceholder')}
            </div>
          )}
        </div>
      </div>

      <div className="relative border-t border-rc-line/80 bg-rc-navy/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-rc-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{copyright}</p>
          <p className="font-mono text-[10px] tracking-[0.18em] text-rc-blue/80 uppercase">
            Mission · Public Surface
          </p>
        </div>
      </div>
    </footer>
  )
}
