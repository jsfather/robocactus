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
      insertHtml(
        `<figure class="my-4"><img src="${url}" alt="" style="max-width:100%;border-radius:8px"/><figcaption></figcaption></figure><p><br/></p>`,
      )
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm text-rc-muted">{label}</span>
      <div className="overflow-hidden rounded-lg border border-rc-line bg-rc-surface">
        <div className="flex flex-wrap gap-1 border-b border-rc-line bg-rc-navy/40 p-2">
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
          className={`${minHeightClass} px-3 py-3 text-sm leading-relaxed outline-none [&_a]:text-rc-blue [&_blockquote]:border-s-2 [&_blockquote]:border-rc-blue/40 [&_blockquote]:ps-3 [&_blockquote]:text-rc-muted [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-5 [&_ul]:list-disc [&_ul]:ps-5`}
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
