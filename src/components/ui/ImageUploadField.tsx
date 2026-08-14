import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { uploadContentMedia } from '@/features/content/api'
import { Button } from '@/components/ui/FormControls'

type Props = {
  label: string
  value: string | null | undefined
  onChange: (url: string | null) => void
  accept?: string
  hint?: string
}

export function ImageUploadField({
  label,
  value,
  onChange,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  hint,
}: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!user) {
      setError(t('auth.loginRequired') || 'Login required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const url = await uploadContentMedia(user.id, file)
      onChange(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-rc-muted">{label}</p>
      {value ? (
        <div className="overflow-hidden rounded-lg border border-rc-line">
          <img src={value} alt="" className="h-40 w-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer">
          <span className="rounded-md border border-rc-blue/40 bg-rc-blue/10 px-3 py-2 text-sm text-rc-blue hover:bg-rc-blue/20">
            {busy ? t('app.loading') : t('common.upload')}
          </span>
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={busy || !user}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            {t('common.delete')}
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-rc-muted">{hint}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <input
        className="w-full rounded-md border border-rc-line bg-rc-surface px-3 py-2 text-xs text-rc-muted outline-none focus:border-rc-blue/50"
        dir="ltr"
        placeholder="https://…"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  )
}
