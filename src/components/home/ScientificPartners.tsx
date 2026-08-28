import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HomePartner } from '@/features/home/homeSectionsApi'

function Logo({ partner, name }: { partner: HomePartner; name: string }) {
  const [failed, setFailed] = useState(!partner.logo_url)
  if (failed) return <span className="text-xl font-black text-slate-400" aria-hidden="true">{name.slice(0, 2)}</span>
  return <img src={partner.logo_url ?? ''} alt={name} className="max-h-16 max-w-[9rem] object-contain transition duration-300 group-hover:scale-[1.03]" loading="lazy" decoding="async" onError={() => setFailed(true)} />
}

export function ScientificPartners({ partners }: { partners: HomePartner[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!partners.length) return null
  return <section className="bg-slate-50 py-16 sm:py-20" aria-labelledby="partners-heading"><div className="mx-auto max-w-7xl px-4 sm:px-8">
    <header className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black tracking-[.14em] text-rc-blue">{isEn ? 'ACADEMIC NETWORK' : 'شبکه علمی جام تبرستان'}</p><h2 id="partners-heading" className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{t('home.partnersTitle')}</h2><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600">{t('home.partnersSubtitle')}</p></header>
    <ul className="grid grid-cols-2 border-s border-t border-slate-200 sm:grid-cols-3 lg:grid-cols-4">{partners.map((partner) => { const name = isEn ? partner.name_en : partner.name_fa; const content = <div className="group flex min-h-44 flex-col items-center justify-center border-b border-e border-slate-200 bg-white px-4 py-6 text-center transition-colors hover:bg-sky-50/50"><div className="grid h-20 place-items-center"><Logo partner={partner} name={name} /></div><h3 className="mt-3 text-sm font-black leading-6 text-slate-800">{name}</h3><p className="mt-1 text-[11px] font-bold text-slate-500">{t(`home.partnerKind.${partner.kind}`)}</p></div>; return <li key={partner.id}>{partner.link_url ? <a href={partner.link_url} target="_blank" rel="noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue">{content}</a> : content}</li> })}</ul>
  </div></section>
}
