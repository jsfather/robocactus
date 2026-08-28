import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HomePartner } from '@/features/home/homeSectionsApi'

function PartnerLogo({ partner, name }: { partner: HomePartner; name: string }) {
  const [failed, setFailed] = useState(!partner.logo_url)
  if (failed) return <span className="text-lg font-black text-slate-500" aria-hidden="true">{name.slice(0, 2)}</span>
  return <img src={partner.logo_url ?? ''} alt={name} className="max-h-16 max-w-[9rem] object-contain" loading="lazy" decoding="async" onError={() => setFailed(true)} />
}

export function ScientificPartners({ partners }: { partners: HomePartner[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!partners.length) return null
  return <section className="border-y border-slate-200 bg-slate-50 py-14 sm:py-18" aria-labelledby="scientific-partners-title"><div className="mx-auto max-w-7xl px-4 sm:px-8">
    <header className="grid gap-4 border-b border-slate-300 pb-7 lg:grid-cols-[1fr_.8fr] lg:items-end"><div><p className="text-xs font-black uppercase tracking-[.16em] text-rc-blue">{isEn ? 'Scientific network' : 'شبکه علمی رویداد'}</p><h2 id="scientific-partners-title" className="mt-2 text-3xl font-black leading-tight text-slate-900">{t('home.partnersTitle')}</h2></div><p className="max-w-xl text-sm leading-7 text-slate-600 lg:justify-self-end">{t('home.partnersSubtitle')}</p></header>
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3">{partners.map((partner) => {
      const name = isEn ? partner.name_en : partner.name_fa
      const body = <div className="group flex min-h-36 items-center gap-5 border-b border-slate-200 py-6 sm:px-5 sm:[&:nth-child(odd)]:border-e lg:border-e lg:[&:nth-child(3n)]:border-e-0"><div className="grid h-20 w-28 shrink-0 place-items-center bg-white p-3"><PartnerLogo partner={partner} name={name} /></div><div className="min-w-0"><p className="text-[11px] font-bold text-rc-blue">{t(`home.partnerKind.${partner.kind}`)}</p><h3 className="mt-1 text-base font-black leading-7 text-slate-900">{name}</h3>{partner.link_url ? <span className="mt-2 inline-block text-xs font-bold text-slate-500 transition-colors group-hover:text-rc-blue">{isEn ? 'Official website ↗' : 'وب‌سایت رسمی ↗'}</span> : null}</div></div>
      return <li key={partner.id}>{partner.link_url ? <a href={partner.link_url} target="_blank" rel="noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue">{body}</a> : body}</li>
    })}</ul>
  </div></section>
}
