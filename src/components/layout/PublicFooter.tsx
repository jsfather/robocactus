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
    <footer className="relative mt-20 overflow-hidden rounded-t-[3.5rem] border-t border-emerald-100 bg-gradient-to-b from-[#edf9f7] via-white to-sky-50">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 50% 60% at 20% 0%, var(--rc-glow-blue), transparent), radial-gradient(ellipse 40% 50% at 90% 100%, var(--rc-glow-orange), transparent)',
        }}
      />
      <div className="pointer-events-none absolute -start-32 -top-40 size-96 rounded-full border-[70px] border-sky-100/70" />

      <div className="relative mx-auto max-w-7xl px-4 pt-16 sm:px-8">
        <div className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-[2.25rem] bg-gradient-to-l from-[#087eb8] via-[#078b94] to-[#0ba66b] p-7 text-white shadow-[0_26px_75px_rgb(8_126_184/0.22)] sm:flex-row sm:items-center sm:p-10">
          <span className="absolute -end-12 -top-20 size-64 rounded-full border-[38px] border-white/10" /><div className="relative"><p className="text-sm font-bold text-emerald-100">{isEn ? 'TABARESTAN CUP SECRETARIAT' : 'دبیرخانه جام تبرستان'}</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">{isEn ? 'Have a question? We are here for your team.' : 'سؤالی دارید؟ ما کنار تیم شما هستیم.'}</h2><p className="mt-2 text-sm text-white/70">{isEn ? 'Registration, league rules, payments, and event support.' : 'پاسخ‌گویی درباره ثبت‌نام، قوانین لیگ، پرداخت و برگزاری مسابقات'}</p></div>
          <Link to="/contact" className="relative inline-flex shrink-0 items-center justify-center rounded-2xl bg-white px-6 py-3.5 font-bold text-rc-blue shadow-xl transition hover:-translate-y-1">{isEn ? 'Contact secretariat' : 'ارتباط با دبیرخانه'}</Link>
        </div>
      </div>

      <div className={`relative mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 sm:px-8 ${settings?.trust_seal_url ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <div className="lg:col-span-2">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rc-blue to-rc-accent text-lg font-black text-white shadow-lg">RT</div>
          <p className="mt-5 text-3xl font-black tracking-tight text-slate-800">{brand}</p>
          <p className="mt-2 text-sm font-bold text-emerald-600">Tabarestan Cup · Amol</p>
          {about ? <p className="mt-5 max-w-md text-sm leading-8 text-rc-muted">{about}</p> : <p className="mt-5 max-w-md text-sm leading-8 text-rc-muted">رویداد نوآوری و رباتیک شمال ایران؛ از قلب مازندران، رو به آینده.</p>}
          <div className="mt-6 flex items-center gap-2">
            <span className="size-2 rounded-full bg-rc-accent" />
            <span className="text-xs font-semibold text-rc-muted">
              از مازندران تا آینده
            </span>
          </div>
        </div>

        <div className="lg:col-span-1">
          <p className="mb-4 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">
            {t('footer.usefulLinks')}
          </p>
          <ul className="grid grid-cols-1 gap-3 text-sm text-rc-muted">
            {useful.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="inline-flex items-center gap-2 transition hover:text-rc-blue"
                >
                  <span className="size-1.5 rounded-full bg-rc-accent" />
                  {isEn ? item.label_en : item.label_fa}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-1">
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

        {settings?.trust_seal_url ? <div className="lg:col-span-1">
          <p className="mb-4 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">
            {t('footer.trust')}
          </p>
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
        </div> : null}
      </div>

      <div className="relative border-t border-emerald-100 bg-white/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-rc-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>{copyright}</p>
          <p className="font-mono text-[10px] tracking-[0.18em] text-rc-blue/80 uppercase">
            Amol · Mazandaran · Iran
          </p>
        </div>
      </div>
    </footer>
  )
}
