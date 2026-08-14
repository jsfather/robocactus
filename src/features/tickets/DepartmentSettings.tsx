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
      <HudFrame className="p-4">
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

      <HudFrame className="p-2">
        <ul className="divide-y divide-rc-line">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
              <div>
                <p className="font-medium">
                  {d.name}{' '}
                  {!d.is_active ? (
                    <span className="font-mono text-[10px] text-rc-muted">inactive</span>
                  ) : null}
                </p>
                <p className="font-mono text-[10px] text-rc-muted">
                  {d.slug} · #{d.sort_order}
                </p>
                {d.description ? <p className="mt-1 text-xs text-rc-muted">{d.description}</p> : null}
              </div>
              <div className="flex gap-2">
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
