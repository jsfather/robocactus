import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchStaticPage } from '@/features/leagues/adminApi'

type FaqItem = { q: string; a: string }
type FaqCategory = { id: string; title: string; items: FaqItem[] }

export function FaqPage() {
  const { t, i18n } = useTranslation()
  const [introHtml, setIntroHtml] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => {
    void fetchStaticPage('faq')
      .then((page) => setIntroHtml(page?.body ?? null))
      .catch(() => undefined)
  }, [])

  const categories = t('home.faqCategories', { returnObjects: true }) as FaqCategory[]
  const list = Array.isArray(categories) ? categories : []

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">{t('nav.faq')}</h1>
        <p className="mt-1 text-rc-muted">{t('home.faqSubtitle')}</p>
      </div>

      {introHtml ? (
        <div
          className="leading-relaxed text-rc-muted [&_a]:text-rc-blue"
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      <div className="space-y-8" key={i18n.language}>
        {list.map((cat) => (
          <section key={cat.id}>
            <h2 className="mb-3 font-mono text-sm tracking-wide text-rc-blue uppercase">
              {cat.title}
            </h2>
            <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
              {cat.items.map((item, idx) => {
                const key = `${cat.id}-${idx}`
                const open = openKey === key
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm font-medium hover:bg-white/[0.03]"
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : key)}
                    >
                      <span>{item.q}</span>
                      <span className="font-mono text-rc-blue">{open ? '−' : '+'}</span>
                    </button>
                    {open ? (
                      <p className="border-t border-white/5 bg-rc-navy/40 px-4 py-3 text-sm text-rc-muted">
                        {item.a}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
