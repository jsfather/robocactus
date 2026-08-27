import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, Textarea } from '@/components/ui/FormControls'
import { HudFrame, SectionLabel } from '@/components/panel/HudKit'
import {
  deleteTicketDepartment,
  fetchTicketDepartments,
  upsertTicketDepartment,
} from '@/features/tickets/api'
import type { TicketDepartment } from '@/types/database'

export function DepartmentSettings() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<TicketDepartment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')

  const reload = async () => {
    try {
      setRows(await fetchTicketDepartments())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const reset = () => {
    setEditId(null)
    setName('')
    setSlug('')
    setDescription('')
    setSortOrder(String(rows.length + 1))
  }

  const onEdit = (d: TicketDepartment) => {
    setEditId(d.id)
    setName(d.name)
    setSlug(d.slug)
    setDescription(d.description ?? '')
    setSortOrder(String(d.sort_order))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await upsertTicketDepartment({
        id: editId ?? undefined,
        name,
        slug,
        description,
        sort_order: Number(sortOrder) || 0,
      })
      reset()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionLabel index="DEP.01" title={t('tickets.departments')} hint={t('tickets.departmentsHint')} />
      <FieldError message={error ?? undefined} />
      <HudFrame className="overflow-hidden p-5">
        <div className="mb-5 flex items-center gap-4 rounded-2xl bg-gradient-to-l from-sky-50 to-emerald-50 p-4"><span className="flex size-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">⌘</span><div><p className="font-black text-slate-800">{editId ? 'ویرایش دپارتمان' : 'ساخت مسیر پاسخ‌گویی جدید'}</p><p className="mt-1 text-xs leading-6 text-slate-500">نام روشن و توضیح کوتاه، ارجاع تیکت‌ها را برای کارشناسان سریع‌تر می‌کند.</p></div></div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
          <Input label={t('tickets.deptName')} required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={t('content.slug')} value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" />
          <Textarea
            label={t('admin.leagues.description')}
            className="min-h-20 md:col-span-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            label={t('tickets.sortOrder')}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            dir="ltr"
          />
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('app.loading') : t('common.save')}
            </Button>
            {editId ? (
              <Button type="button" variant="ghost" onClick={reset}>
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
      </HudFrame>

      <HudFrame className="p-4">
        <div className="mb-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-sky-50 p-4"><p className="text-xs font-bold text-sky-700">کل دپارتمان‌ها</p><p className="mt-1 text-2xl font-black text-sky-900">{rows.length}</p></div><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">فعال</p><p className="mt-1 text-2xl font-black text-emerald-900">{rows.filter((row) => row.is_active).length}</p></div></div>
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((d) => (
            <li key={d.id} className={`flex flex-col justify-between gap-4 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${editId === d.id ? 'border-sky-300 bg-sky-50/70' : 'border-slate-100 bg-white'}`}>
              <div>
                <p className="font-medium">
                  {d.name}{' '}
                  {!d.is_active ? (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">غیرفعال</span>
                  ) : null}
                </p>
                <p className="font-mono text-[10px] text-rc-muted">
                  {d.slug} · #{d.sort_order}
                </p>
                {d.description ? <p className="mt-1 text-xs text-rc-muted">{d.description}</p> : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button type="button" variant="secondary" onClick={() => onEdit(d)}>
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() =>
                    void deleteTicketDepartment(d.id)
                      .then(reload)
                      .catch((err: Error) => setError(err.message))
                  }
                >
                  {t('common.delete')}
                </Button>
              </div>
            </li>
          ))}
          {!rows.length ? (
            <li className="px-3 py-4 text-sm text-rc-muted">{t('tickets.noDepartments')}</li>
          ) : null}
        </ul>
      </HudFrame>
    </div>
  )
}
