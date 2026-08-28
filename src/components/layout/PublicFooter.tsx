import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sortedNavItems } from '@/features/settings/api'
import { sanitizeTrustSealHtml } from '@/lib/sanitize'
import type { ReactNode } from 'react'

const fallbackLinks = [
  ['/leagues', 'nav.leagues'], ['/rankings', 'nav.rankings'], ['/companies', 'nav.companies'],
  ['/blog', 'nav.blog'], ['/gallery', 'nav.gallery'], ['/about', 'nav.about'],
  ['/contact', 'nav.contact'], ['/faq', 'nav.faq'], ['/terms', 'nav.terms'],
  ['/registration-guide', 'nav.registrationGuide'],
] as const

function FooterHeading({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-rc-blue text-white shadow-[0_10px_25px_rgb(8_126_184/0.24)]"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg></span><h2 className="text-lg font-black text-slate-900">{children}</h2></div>
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

  return <footer className="relative mt-20 bg-slate-50 pt-14">
    <div className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="relative rounded-[2rem] bg-rc-blue p-4 pt-7 shadow-[0_24px_60px_rgb(8_126_184/0.18)] sm:p-6 sm:pt-8">
        <span className="absolute start-1/2 top-0 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-rc-blue text-white shadow-lg" aria-hidden="true"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 14 5-5 5 5" /></svg></span>
        <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
          <div className="overflow-hidden rounded-[1.65rem] bg-white p-6 sm:p-8">
            <div className="grid gap-9 md:grid-cols-3 md:gap-0">
              <section className="md:pe-7"><FooterHeading>{t('footer.usefulLinks')}</FooterHeading><p className="mt-2 text-xs text-slate-500">{isEn ? 'Quick access to key pages' : 'دسترسی سریع به بخش‌های مهم'}</p><ul className="mt-5 space-y-1">{links.slice(0, 7).map((item) => <li key={item.id}><Link to={item.href} className="flex min-h-9 items-center gap-2 text-sm font-bold text-slate-700 transition-colors hover:text-sky-600"><span className="h-1 w-4 rounded-full bg-slate-300" aria-hidden="true" />{isEn ? item.label_en : item.label_fa}</Link></li>)}</ul></section>

              <section className="border-t border-dashed border-slate-200 pt-8 md:border-s md:border-t-0 md:px-7 md:pt-0"><FooterHeading>{t('footer.contact')}</FooterHeading><p className="mt-2 text-xs text-slate-500">{isEn ? 'We are available through these channels' : 'از راه‌های زیر با ما در ارتباط باشید'}</p><div className="mt-5 space-y-4 text-sm text-slate-700">{address ? <div><p className="text-xs font-bold text-slate-400">{isEn ? 'Address' : 'آدرس'}</p><p className="mt-1 leading-6 font-semibold">{address}</p></div> : null}{email ? <div><p className="text-xs font-bold text-slate-400">{isEn ? 'Email' : 'ایمیل'}</p><a href={`mailto:${email}`} dir="ltr" className="mt-1 block font-black text-slate-800 hover:text-sky-600 [overflow-wrap:anywhere]">{email}</a></div> : null}{phone ? <div><p className="text-xs font-bold text-slate-400">{isEn ? 'Phone' : 'شماره تماس'}</p><a href={`tel:${phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="mt-1 block font-black text-slate-800 hover:text-sky-600">{phone}</a></div> : null}{contactBlurb ? <p className="border-t border-slate-100 pt-3 text-xs leading-6 text-slate-500">{contactBlurb}</p> : null}</div>{socials.length ? <div className="mt-5 flex flex-wrap gap-3">{socials.map(([name, href]) => <a key={name} href={href} target="_blank" rel="noreferrer noopener" className="text-xs font-black text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-sky-600">{name}</a>)}</div> : null}</section>

              <section className="border-t border-dashed border-slate-200 pt-8 md:border-s md:border-t-0 md:ps-7 md:pt-0"><FooterHeading>{isEn ? 'Secretariat' : 'دبیرخانه'}</FooterHeading><p className="mt-2 text-xs text-slate-500">{isEn ? 'Registration and competition support' : 'پاسخ‌گویی ثبت‌نام و امور مسابقات'}</p><p className="mt-5 text-sm leading-7 text-slate-600">{about}</p><Link to="/contact" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-500 px-5 text-sm font-black text-white transition hover:bg-sky-600">{t('nav.contact')}<span className="ms-2" aria-hidden="true">←</span></Link>{hasTrust ? settings?.trust_seal_html?.trim() ? <div className="mt-5 grid min-h-24 place-items-center overflow-hidden rounded-xl bg-slate-50 p-2 [&_img]:max-h-20 [&_img]:max-w-full [&_img]:object-contain" dangerouslySetInnerHTML={{ __html: sanitizeTrustSealHtml(settings.trust_seal_html) }} /> : <a href={settings?.trust_seal_href || '#'} target="_blank" rel="noreferrer noopener" className="mt-5 grid min-h-24 place-items-center rounded-xl bg-slate-50 p-2"><img src={settings?.trust_seal_url || ''} alt={t('footer.trust')} className="max-h-20 max-w-full object-contain" /></a> : null}</section>
            </div>
          </div>

          <aside className="rounded-[1.65rem] bg-white p-6 text-center"><div className="mx-auto grid size-20 place-items-center rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">{settings?.logo_url ? <img src={settings.logo_url} alt={brand} className="max-h-14 max-w-full object-contain" /> : <span className="text-xl font-black text-sky-700">TC</span>}</div><h2 className="mt-5 text-lg font-black text-slate-900">{brand}</h2><div className="mx-auto my-4 w-16 border-t border-dashed border-slate-300" /><p className="text-xs leading-7 text-slate-500">{isEn ? 'Official platform for registration, judging and live results of Tabarestan robotics competitions.' : 'سامانه رسمی ثبت‌نام، داوری و اعلام نتایج مسابقات رباتیک جام تبرستان'}</p><p className="mt-5 text-[10px] font-black tracking-[.12em] text-sky-700">AMOL · MAZANDARAN</p></aside>
        </div>
      </div>
    </div>

    <div className="mt-6 border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-5 text-center text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pb-5 sm:text-start"><p>{copyright}</p><p>{developerCredit}: <a href={developerUrl} target="_blank" rel="noreferrer noopener" className="font-black text-sky-700 hover:underline">{developerName}</a></p></div></div>
  </footer>
}
