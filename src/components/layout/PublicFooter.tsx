import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sortedNavItems } from '@/features/settings/api'
import { sanitizeTrustSealHtml } from '@/lib/sanitize'

const fallbackLinks = [
  ['/leagues', 'nav.leagues'], ['/rankings', 'nav.rankings'], ['/companies', 'nav.companies'],
  ['/blog', 'nav.blog'], ['/gallery', 'nav.gallery'], ['/about', 'nav.about'],
  ['/contact', 'nav.contact'], ['/faq', 'nav.faq'], ['/privacy', 'nav.privacy'],
  ['/terms', 'nav.terms'], ['/registration-guide', 'nav.registrationGuide'],
] as const

function ContactIcon({ type }: { type: 'phone' | 'email' | 'address' }) {
  const body = type === 'phone' ? <path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-4-1-1.2 2a13.8 13.8 0 0 1-9.8-9.8L8 7 7 3Z" /> : type === 'email' ? <><rect x="3" y="5" width="18" height="14" /><path d="m4 7 8 6 8-6" /></> : <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>
  return <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{body}</svg>
}

export function PublicFooter() {
  const { t, i18n } = useTranslation()
  const { settings } = useSiteSettings()
  const isEn = i18n.language.startsWith('en')
  const brand = isEn ? settings?.site_name_en || t('app.name') : settings?.site_name_fa || t('app.name')
  const about = (isEn ? settings?.footer_en || settings?.tagline_en : settings?.footer_fa || settings?.tagline_fa) || t('home.footerTagline')
  const address = isEn ? settings?.contact_address_en : settings?.contact_address_fa
  const contactBlurb = isEn ? settings?.contact_blurb_en : settings?.contact_blurb_fa
  const copyright = isEn ? settings?.copyright_en || t('footer.copyrightDefault') : settings?.copyright_fa || t('footer.copyrightDefault')
  const developerCredit = isEn ? settings?.developer_credit_en || 'Designed and developed by' : settings?.developer_credit_fa || 'طراحی و توسعه'
  const developerName = settings?.developer_name?.trim() || (isEn ? 'Farino' : 'فارینو')
  const developerUrl = settings?.developer_url?.trim() || 'https://farino.ir'
  const phone = settings?.support_phone?.trim()
  const email = settings?.contact_email?.trim()
  const socials = [['Instagram', settings?.instagram_url], ['Telegram', settings?.telegram_url], ['LinkedIn', settings?.linkedin_url], ['WhatsApp', settings?.whatsapp_url]].filter((item): item is [string, string] => Boolean(item[1]?.trim() && /^https:\/\//i.test(item[1])))
  const hasTrust = Boolean(settings?.trust_seal_html?.trim() || settings?.trust_seal_url)
  const configured = sortedNavItems(settings?.nav_items)
  const links = configured.length ? [...configured] : fallbackLinks.map(([href, key], index) => ({ id: String(index), href, label_fa: t(key), label_en: t(key), enabled: true, order: index }))
  for (const [href, key] of [['/terms', 'nav.terms'], ['/registration-guide', 'nav.registrationGuide']] as const) if (!links.some((item) => item.href === href)) links.push({ id: href, href, label_fa: t(key), label_en: t(key), enabled: true, order: links.length })

  return <footer className="relative mt-16 border-t border-slate-800 bg-slate-950 text-slate-200">
    <div className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className={`grid gap-0 py-12 md:grid-cols-2 ${hasTrust ? 'lg:grid-cols-[1.25fr_.9fr_1fr_.55fr]' : 'lg:grid-cols-[1.25fr_.9fr_1fr]'}`}>
        <section className="pb-8 md:pe-8 lg:pb-0"><div className="flex items-center gap-4">{settings?.logo_url ? <span className="grid size-16 place-items-center bg-white p-2"><img src={settings.logo_url} alt={brand} className="max-h-12 max-w-full object-contain" /></span> : <span className="grid size-14 place-items-center border border-white/25 text-lg font-black text-sky-300">TC</span>}<div><h2 className="text-xl font-black text-white">{brand}</h2><p className="mt-1 text-[11px] font-bold tracking-wider text-slate-400">TABARESTAN CUP · AMOL</p></div></div><p className="mt-5 max-w-md text-sm leading-8 text-slate-400">{about}</p><p className="mt-5 border-s-2 border-sky-400 ps-3 text-xs font-bold text-slate-300">{isEn ? 'From Mazandaran toward the future' : 'از مازندران تا آینده'}</p></section>

        <nav className="border-t border-white/15 py-8 md:border-s md:border-t-0 md:px-8 md:py-0" aria-label={t('footer.usefulLinks')}><h3 className="text-xs font-black tracking-[.12em] text-white">{t('footer.usefulLinks')}</h3><ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-1">{links.map((item) => <li key={item.id}><Link to={item.href} className="inline-flex min-h-9 items-center text-xs font-bold text-slate-400 transition-colors hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{isEn ? item.label_en : item.label_fa}</Link></li>)}</ul></nav>

        <section className="border-t border-white/15 py-8 md:border-s md:px-8 lg:border-t-0 lg:py-0"><h3 className="text-xs font-black tracking-[.12em] text-white">{t('footer.contact')}</h3><ul className="mt-5 space-y-4 text-sm leading-6 text-slate-400">{phone ? <li><a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex min-h-10 items-start gap-3 transition-colors hover:text-sky-300"><ContactIcon type="phone" /><span dir="ltr">{phone}</span></a></li> : null}{email ? <li><a href={`mailto:${email}`} className="flex min-h-10 min-w-0 items-start gap-3 transition-colors hover:text-sky-300"><ContactIcon type="email" /><span className="[overflow-wrap:anywhere]" dir="ltr">{email}</span></a></li> : null}{address ? <li className="flex items-start gap-3"><ContactIcon type="address" /><span>{address}</span></li> : null}{contactBlurb ? <li className="border-t border-white/10 pt-4 text-xs leading-6">{contactBlurb}</li> : null}</ul>{socials.length ? <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 pt-4">{socials.map(([name, href]) => <a key={name} href={href} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center text-xs font-black text-slate-300 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-sky-300">{name}</a>)}</div> : null}</section>

        {hasTrust ? <section className="border-t border-white/15 pt-8 md:border-s md:px-8 lg:border-t-0 lg:pt-0"><h3 className="text-xs font-black tracking-[.12em] text-white">{t('footer.trust')}</h3>{settings?.trust_seal_html?.trim() ? <div className="mt-5 grid min-h-28 place-items-center bg-white p-3 [&_img]:max-h-24 [&_img]:max-w-full [&_img]:object-contain" dangerouslySetInnerHTML={{ __html: sanitizeTrustSealHtml(settings.trust_seal_html) }} /> : <a href={settings?.trust_seal_href || '#'} target="_blank" rel="noreferrer noopener" className="mt-5 grid min-h-28 place-items-center bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><img src={settings?.trust_seal_url || ''} alt={t('footer.trust')} className="max-h-24 max-w-full object-contain" /></a>}</section> : null}
      </div>
    </div>

    <div className="border-t border-white/15 bg-black/20"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-6 text-center text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pb-6 sm:text-start"><div><p>{copyright}</p><p className="mt-1.5">{developerCredit}: <a href={developerUrl} target="_blank" rel="noreferrer noopener" className="font-black text-sky-300 underline underline-offset-4 hover:text-white">{developerName}</a></p></div><p className="font-mono text-[10px] tracking-[.14em] text-slate-500">AMOL · MAZANDARAN · IRAN</p></div></div>
  </footer>
}
