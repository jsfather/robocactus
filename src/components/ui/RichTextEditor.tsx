import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { uploadContentMedia } from '@/features/content/api'

type Props = {
  label: string
  value: string
  onChange: (html: string) => void
  /** Change this when loading a different document so the editor remounts content. */
  resetKey: string
  hint?: string
  minHeightClass?: string
}

function ToolbarBtn({
  onClick,
  children,
  title,
}: {
  onClick: () => void
  children: ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded border border-rc-line px-2 py-1 text-xs text-rc-muted hover:bg-rc-hover hover:text-rc-text"
    >
      {children}
    </button>
  )
}

/** Lightweight rich editor (contentEditable) with formatting + image upload. */
export function RichTextEditor({
  label,
  value,
  onChange,
  resetKey,
  hint,
  minHeightClass = 'min-h-56',
}: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = value || '<p><br/></p>'
    }
    // Only remount HTML when switching documents — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [resetKey])

  const sync = () => {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    sync()
  }

  const insertHtml = (html: string) => {
    ref.current?.focus()
    document.execCommand('insertHTML', false, html)
    sync()
  }

  const onImage = async (file: File | undefined) => {
    if (!file || !user) return
    try {
      const url = await uploadContentMedia(user.id, file)
      const alt = window.prompt(t('content.imageAltPrompt'))?.trim() || ''
      insertHtml(
        `<figure class="my-4"><img src="${url}" alt="${alt.replace(/["<>]/g, '')}" style="max-width:100%;border-radius:16px"/><figcaption></figcaption></figure><p><br/></p>`,
      )
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm text-rc-muted">{label}</span>
      <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-[0_12px_35px_rgb(18_76_98/0.06)]">
        <div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-sky-100 bg-sky-50/85 p-3 backdrop-blur">
          <ToolbarBtn title="Bold" onClick={() => exec('bold')}>
            B
          </ToolbarBtn>
          <ToolbarBtn title="Italic" onClick={() => exec('italic')}>
            I
          </ToolbarBtn>
          <ToolbarBtn title="Underline" onClick={() => exec('underline')}>
            U
          </ToolbarBtn>
          <ToolbarBtn title="H2" onClick={() => exec('formatBlock', 'h2')}>
            H2
          </ToolbarBtn>
          <ToolbarBtn title="H3" onClick={() => exec('formatBlock', 'h3')}>
            H3
          </ToolbarBtn>
          <ToolbarBtn title="Quote" onClick={() => exec('formatBlock', 'blockquote')}>
            “ ”
          </ToolbarBtn>
          <ToolbarBtn title="List" onClick={() => exec('insertUnorderedList')}>
            • List
          </ToolbarBtn>
          <ToolbarBtn title="Ordered" onClick={() => exec('insertOrderedList')}>
            1.
          </ToolbarBtn>
          <ToolbarBtn
            title="Link"
            onClick={() => {
              const url = window.prompt('URL')
              if (url) exec('createLink', url)
            }}
          >
            Link
          </ToolbarBtn>
          <ToolbarBtn title="HR" onClick={() => insertHtml('<hr/><p><br/></p>')}>
            —
          </ToolbarBtn>
          <label className="cursor-pointer rounded border border-rc-blue/40 bg-rc-blue/10 px-2 py-1 text-xs text-rc-blue hover:bg-rc-blue/20">
            {t('common.upload')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onImage(e.target.files?.[0])}
            />
          </label>
        </div>
        <div
          ref={ref}
          className={`${minHeightClass} px-5 py-5 text-base leading-8 text-slate-700 outline-none [&_a]:text-sky-700 [&_blockquote]:my-5 [&_blockquote]:border-s-4 [&_blockquote]:border-emerald-400 [&_blockquote]:bg-emerald-50 [&_blockquote]:p-4 [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-slate-950 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-black [&_h3]:text-slate-900 [&_img]:my-5 [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:ps-5`}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={sync}
        />
      </div>
      {hint ? <p className="text-xs text-rc-muted">{hint}</p> : null}
    </div>
  )
}
