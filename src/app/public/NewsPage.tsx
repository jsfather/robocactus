import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelCard } from '@/components/ui/FormControls'
import { fetchPublishedAnnouncements } from '@/features/content/api'
import type { Announcement } from '@/types/database'

export function NewsPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Announcement[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchPublishedAnnouncements()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">{t('content.announcementsTitle')}</h1>
        <p className="mt-1 text-rc-muted">{t('content.announcementsSubtitle')}</p>
      </div>

      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {!loading && items.length === 0 ? (
        <p className="text-rc-muted">{t('content.announcementsEmpty')}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id}>
              <PanelCard
                title={item.title}
                description={
                  item.published_at
                    ? new Date(item.published_at).toLocaleString()
                    : undefined
                }
              >
                <div
                  className="leading-relaxed text-rc-muted"
                  dangerouslySetInnerHTML={{ __html: item.body }}
                />
              </PanelCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
