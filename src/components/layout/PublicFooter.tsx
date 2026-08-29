import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sortedNavItems } from '@/features/settings/api'
import { sanitizeTrustSealHtml } from '@/lib/sanitize'

const FALLBACK_LINKS = [
  { href: '/leagues', labelKey: 'nav.leagues' }, { href: '/rankings', labelKey: 'nav.rankings' },
  { href: '/companies', labelKey: 'nav.companies' }, { href: '/blog', labelKey: 'nav.blog' },
  { href: '/gallery', labelKey: 'nav.gallery' }, { href: '/about', labelKey: 'nav.about' },
  { href: '/contact', labelKey: 'nav.contact' }, { href: '/faq', labelKey: 'nav.faq' },
  { href: '/privacy', labelKey: 'nav.privacy' },
  { href: '/terms', labelKey: 'nav.terms' }, { href: '/registration-guide', labelKey: 'nav.registrationGuide' },
] as const

function ContactIcon({ kind }: { kind: 'phone' | 'email' | 'address' }) {
  const paths = {
    phone: <path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-4-1-1.2 2a13.8 13.8 0 0 1-9.8-9.8L8 7 7 3Z" />,
    email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    address: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  }
  return <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg></span>
}

export function PublicFooter() {
  const { t, i18n } = useTranslation()
  const { settings } = useSiteSettings()
  const isEn = i18n.language.startsWith('en')
  const brand = isEn ? settings?.site_name_en || t('app.name') : settings?.site_name_fa || t('app.name')
  const about = (isEn ? settings?.footer_en || settings?.tagline_en : settings?.footer_fa || settings?.tagline_fa) || t('home.footerTagline')
  const contactBlurb = isEn ? settings?.contact_blurb_en : settings?.contact_blurb_fa
  const address = isEn ? settings?.contact_address_en : settings?.contact_address_fa
  const copyright = isEn ? settings?.copyright_en || t('footer.copyrightDefault') : settings?.copyright_fa || t('footer.copyrightDefault')
  const developerCredit = isEn
    ? settings?.developer_credit_en || 'Designed and developed by'
    : settings?.developer_credit_fa || 'طراحی و توسعه'
  const developerName = settings?.developer_name?.trim() || (isEn ? 'Farino' : 'فارینو')
  const developerUrl = settings?.developer_url?.trim() || 'https://farino.ir'
  const phone = settings?.support_phone?.trim()
  const telephoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined
  const email = settings?.contact_email?.trim()
  const socials = [
    ['Instagram', settings?.instagram_url], ['Telegram', settings?.telegram_url],
    ['LinkedIn', settings?.linkedin_url], ['WhatsApp', settings?.whatsapp_url],
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim() && /^https:\/\//i.test(item[1])))
  const hasTrustSeal = Boolean(settings?.trust_seal_html?.trim() || settings?.trust_seal_url)
  const configuredNav = sortedNavItems(settings?.nav_items)
  const useful = configuredNav.length ? [...configuredNav] : FALLBACK_LINKS.map((item, index) => ({ id: String(index), href: item.href, label_fa: t(item.labelKey), label_en: t(item.labelKey), enabled: true, order: index }))
  for (const item of [{ href: '/terms', key: 'nav.terms' }, { href: '/registration-guide', key: 'nav.registrationGuide' }]) if (!useful.some((link) => link.href === item.href)) useful.push({ id: item.href, href: item.href, label_fa: t(item.key), label_en: t(item.key), enabled: true, order: useful.length })

  return <footer className="relative mt-20 border-t border-sky-900 bg-[#052f46] text-white">
    <div className="relative overflow-hidden">
      <span className="pointer-events-none absolute -end-36 -top-48 size-[30rem] rounded-full border-[5rem] border-white/[0.025]" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-36 -start-32 size-96 rounded-full bg-emerald-400/[0.05] blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 pt-10 sm:px-8 sm:pt-14">
        <section className="grid gap-6 overflow-hidden rounded-[2rem] border border-sky-100 bg-white p-6 text-slate-950 shadow-[0_24px_70px_rgb(0_0_0/0.18)] md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div><p className="text-xs font-black tracking-widest text-emerald-700">{brand}</p><h2 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{t('footer.ctaTitle')}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{t('footer.ctaSubtitle')}</p></div>
          <Link to="/contact" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-sky-700 to-emerald-600 px-6 font-black text-white shadow-xl transition duration-300 hover:-translate-y-1">{t('nav.contact')} <span aria-hidden>←</span></Link>
        </section>
      </div>

      <div className={`relative mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-8 sm:py-14 md:grid-cols-2 ${hasTrustSeal ? 'lg:grid-cols-[1.4fr_.9fr_1fr_.55fr]' : 'lg:grid-cols-[1.4fr_.9fr_1fr]'}`}>
        <section>
          <div className="flex items-center gap-4">{settings?.logo_url ? <span className="grid size-16 place-items-center rounded-2xl bg-white p-2 shadow-lg"><img src={settings.logo_url} alt={brand} className="max-h-12 max-w-full object-contain" /></span> : <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 text-lg font-black shadow-lg">TC</span>}<div><h2 className="text-2xl font-black">{brand}</h2><p className="mt-1 text-xs font-bold tracking-wide text-emerald-200">Tabarestan Cup · Amol</p></div></div>
          <p className="mt-5 max-w-lg text-sm leading-8 text-sky-100/65">{about}</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-lg"><span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgb(16_185_129/0.14)]" />{isEn ? 'From Mazandaran toward the future' : 'از مازندران تا آینده'}</div>
        </section>

        <section className="rounded-2xl border border-sky-100 bg-white p-5 text-slate-900 shadow-[0_18px_45px_rgb(1_24_38/0.18)]"><h3 className="text-sm font-black text-slate-950">{t('footer.usefulLinks')}</h3><div className="mt-3 h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent" /><ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs font-bold text-slate-700">{useful.map((item) => <li key={item.id}><Link to={item.href} className="inline-flex min-h-8 items-center gap-2 rounded-lg px-1 transition hover:bg-sky-50 hover:text-sky-800"><span className="size-1.5 rounded-full bg-emerald-500" />{isEn ? item.label_en : item.label_fa}</Link></li>)}</ul></section>

        <section className="rounded-2xl border border-sky-100 bg-white p-5 text-slate-900 shadow-[0_18px_45px_rgb(1_24_38/0.18)]"><h3 className="text-sm font-black text-slate-950">{t('footer.contact')}</h3><div className="mt-3 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent" /><ul className="mt-5 space-y-3 text-xs leading-6 text-slate-700">{phone && telephoneHref ? <li><a href={telephoneHref} className="flex items-center gap-3 rounded-xl transition hover:bg-sky-50 hover:text-sky-800"><ContactIcon kind="phone" /><span dir="ltr">{phone}</span></a></li> : null}{email ? <li><a href={`mailto:${email}`} className="flex items-center gap-3 rounded-xl transition hover:bg-sky-50 hover:text-sky-800"><ContactIcon kind="email" /><span className="min-w-0 truncate" dir="ltr">{email}</span></a></li> : null}{address ? <li className="flex items-start gap-3"><ContactIcon kind="address" /><span>{address}</span></li> : null}{socials.length ? <li className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">{socials.map(([name, href]) => <a key={name} href={href} target="_blank" rel="noreferrer noopener" className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700 transition hover:bg-sky-100 hover:text-sky-800">{name}</a>)}</li> : null}{contactBlurb ? <li className="border-t border-slate-100 pt-3 text-slate-600">{contactBlurb}</li> : null}{!phone && !email && !address && !contactBlurb ? <li>{t('footer.contactEmpty')}</li> : null}</ul></section>

        {hasTrustSeal ? <section className="rounded-2xl border border-sky-100 bg-white p-5 text-slate-900 shadow-[0_18px_45px_rgb(1_24_38/0.18)]"><h3 className="text-sm font-black text-slate-950">{t('footer.trust')}</h3>{settings?.trust_seal_html?.trim() ? <div className="mt-5 grid min-h-28 place-items-center overflow-hidden rounded-2xl bg-slate-50 p-3 [&_img]:max-h-28 [&_img]:max-w-full [&_img]:object-contain" dangerouslySetInnerHTML={{ __html: sanitizeTrustSealHtml(settings.trust_seal_html) }} /> : <a href={settings?.trust_seal_href || '#'} target="_blank" rel="noreferrer noopener" className="mt-5 grid aspect-square place-items-center rounded-2xl bg-slate-50 p-3 transition hover:-translate-y-1"><img src={settings?.trust_seal_url || ''} alt={t('footer.trust')} className="max-h-24 max-w-full object-contain" /></a>}</section> : null}
      </div>
    </div>

    <div className="relative border-t border-white/10 bg-[#03283b]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-6 text-center text-xs text-sky-50 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pb-7 sm:text-start">
        <div className="space-y-1.5"><p>{copyright}</p><p className="text-sky-100/75">{developerCredit}: <a href={developerUrl} target="_blank" rel="noreferrer noopener" className="font-black text-emerald-200 underline decoration-emerald-400/50 underline-offset-4 transition hover:text-white">{developerName}</a></p></div>
        <p className="font-mono text-[10px] tracking-[0.18em] text-emerald-200 uppercase">Amol · Mazandaran · Iran</p>
      </div>
    </div>
  </footer>
}
