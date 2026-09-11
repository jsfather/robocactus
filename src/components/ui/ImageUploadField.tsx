import { useEffect, useState } from 'react'
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
  preview?: 'image' | 'file'
  allowUrl?: boolean
}

export function ImageUploadField({
  label,
  value,
  onChange,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  hint,
  preview = 'image',
  allowUrl = true,
}: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    setPreviewFailed(false)
  }, [value])

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
      {value && preview === 'image' && !previewFailed ? (
        <div className="overflow-hidden rounded-lg border border-rc-line">
          <img
            src={value}
            alt=""
            className="h-40 w-full object-cover"
            onError={() => {
              setPreviewFailed(true)
              setError('پیش‌نمایش تصویر در دسترس نیست؛ نشانی تصویر را بررسی کنید.')
            }}
          />
        </div>
      ) : null}
      {value && preview === 'image' && previewFailed ? <p className="text-xs text-amber-700">پیش‌نمایش تصویر در دسترس نیست؛ خود فایل هنوز ذخیره شده است.</p> : null}
      {value && preview === 'file' ? <a href={value} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100"><span className="rounded bg-red-600 px-2 py-1 text-xs text-white">PDF</span><span className="truncate" dir="ltr">مشاهده فایل آیین‌نامه</span></a> : null}
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
      {allowUrl ? <input
        className="w-full rounded-md border border-rc-line bg-rc-surface px-3 py-2 text-xs text-rc-muted outline-none focus:border-rc-blue/50"
        dir="ltr"
        placeholder="https://…"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      /> : null}
    </div>
  )
}
