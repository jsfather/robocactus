import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomePartner } from '@/features/home/homeSectionsApi'

function PartnerMark({ partner, name }: { partner: HomePartner; name: string }) {
  if (partner.logo_url) return <img src={partner.logo_url} alt={name} className="max-h-16 max-w-32 object-contain sm:max-w-40" loading="lazy" />
  return <span className="text-2xl font-black text-rc-blue">{name.slice(0, 2)}</span>
}

export function ScientificPartners({ partners }: { partners: HomePartner[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!partners.length) return null

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#f5fbfa] via-white to-sky-50/50 py-24 md:py-28">
      <div className="pointer-events-none absolute -end-32 top-16 size-96 rounded-full border-[64px] border-emerald-50" />
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="mb-12 grid items-end gap-6 lg:grid-cols-[1fr_.8fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />شبکه علمی رویداد</span>
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-800 md:text-5xl">{t('home.partnersTitle')}</h2>
          </div>
          <p className="max-w-xl text-base leading-8 text-slate-500 lg:justify-self-end">{t('home.partnersSubtitle')}</p>
        </div>

        <ul className="grid gap-5 md:grid-cols-2">
          {partners.map((partner, index) => {
            const name = isEn ? partner.name_en : partner.name_fa
            const content = (
              <motion.article
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: .45, delay: index * .06 }}
                className="group relative flex min-h-48 items-stretch overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_20px_55px_rgb(18_76_98/0.08)] transition duration-300 hover:-translate-y-1.5 hover:border-emerald-200 hover:shadow-[0_28px_75px_rgb(18_76_98/0.14)]"
              >
                <div className="flex w-36 shrink-0 items-center justify-center bg-gradient-to-br from-sky-50 to-emerald-50 p-5 sm:w-44">
                  <div className="flex size-28 items-center justify-center rounded-[1.5rem] border border-white/90 bg-white p-4 shadow-sm">
                    <PartnerMark partner={partner} name={name} />
                  </div>
                </div>
                <div className="relative flex min-w-0 flex-1 flex-col justify-center p-6 sm:p-7">
                  <span className="absolute end-5 top-4 text-4xl font-black text-sky-50">{String(index + 1).padStart(2, '0')}</span>
                  <span className="relative mb-3 w-fit rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-rc-blue">{t(`home.partnerKind.${partner.kind}`)}</span>
                  <h3 className="relative text-lg font-black leading-7 text-slate-800 sm:text-xl">{name}</h3>
                  <span className="relative mt-4 inline-flex items-center gap-2 text-xs font-bold text-emerald-600">همکار رسمی جام تبرستان <span className="transition group-hover:translate-x-[-3px]">←</span></span>
                </div>
                <div className="absolute inset-x-8 bottom-0 h-1 rounded-t-full bg-gradient-to-l from-rc-accent via-teal-400 to-rc-blue opacity-0 transition group-hover:opacity-100" />
              </motion.article>
            )
            return <li key={partner.id}>{partner.link_url ? <a href={partner.link_url} target="_blank" rel="noreferrer" className="block">{content}</a> : content}</li>
          })}
        </ul>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/60 px-6 py-5">
          <p className="text-sm font-semibold text-slate-600">دانشگاه‌ها و مراکز علمی، بازوی تخصصی برگزاری رقابت‌های معتبر هستند.</p>
          <a href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-700 shadow-sm">درخواست همکاری علمی <span>←</span></a>
        </div>
      </div>
    </section>
  )
}
