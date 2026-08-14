import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  FieldError,
  Input,
  PanelCard,
  Select,
  Textarea,
} from '@/components/ui/FormControls'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame } from '@/components/panel/HudKit'
import {
  createLeague,
  deleteLeague,
  fetchAllLeagues,
  updateLeague,
  type LeagueInput,
} from '@/features/leagues/adminApi'
import { formatAmountToman } from '@/features/payments/api'
import { slugify } from '@/lib/validation'
import type { League } from '@/types/database'

const emptyForm = (): LeagueInput & { id?: string } => ({
  name: '',
  slug: '',
  description: '',
  category: '',
  capacity: null,
  registration_fee: 0,
  registration_open_at: null,
  registration_close_at: null,
  contact_email: '',
  is_active: true,
})

export function SuperAdminLeaguesPage() {
  const { t } = useTranslation()
  const [leagues, setLeagues] = useState<League[]>([])
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      setLeagues(await fetchAllLeagues())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const startEdit = (league: League) => {
    setEditingId(league.id)
    setForm({
      name: league.name,
      slug: league.slug,
      description: league.description ?? '',
      category: league.category ?? '',
      capacity: league.capacity,
      registration_fee: Number(league.registration_fee),
      registration_open_at: league.registration_open_at,
      registration_close_at: league.registration_close_at,
      contact_email: league.contact_email ?? '',
      is_active: league.is_active,
    })
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm())
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload: LeagueInput = {
        ...form,
        registration_open_at: form.registration_open_at,
        registration_close_at: form.registration_close_at,
        capacity: form.capacity ? Number(form.capacity) : null,
        registration_fee: Number(form.registration_fee ?? 0),
      }
      if (editingId) {
        await updateLeague(editingId, payload)
      } else {
        await createLeague(payload)
      }
      resetForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (id: string) => {
    if (!window.confirm(t('admin.leagues.confirmDelete'))) return
    setBusy(true)
    try {
      await deleteLeague(id)
      if (editingId === id) resetForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelPage index="REG.01" title={t('admin.leagues.title')} description={t('admin.leagues.subtitle')}>
      <HudFrame className="p-4">
      <PanelCard
        title={editingId ? t('admin.leagues.editTitle') : t('admin.leagues.createTitle')}
        actions={
          editingId ? (
            <Button type="button" variant="ghost" onClick={resetForm}>
              {t('common.cancel')}
            </Button>
          ) : null
        }
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
          <Input
            label={t('admin.leagues.name')}
            required
            value={form.name}
            onChange={(e) => {
              const name = e.target.value
              setForm((prev) => ({
                ...prev,
                name,
                slug: editingId ? prev.slug : slugify(name),
              }))
            }}
          />
          <Input
            label={t('admin.leagues.slug')}
            required
            value={form.slug ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }))}
            dir="ltr"
          />
          <Input
            label={t('admin.leagues.category')}
            value={form.category ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
          />
          <Input
            label={t('admin.leagues.capacity')}
            type="number"
            min={0}
            value={form.capacity ?? ''}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                capacity: e.target.value ? Number(e.target.value) : null,
              }))
            }
            dir="ltr"
          />
          <Input
            label={t('admin.leagues.fee')}
            type="number"
            min={0}
            required
            value={form.registration_fee ?? 0}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, registration_fee: Number(e.target.value) }))
            }
            dir="ltr"
          />
          <Input
            label={t('admin.leagues.email')}
            type="email"
            value={form.contact_email ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, contact_email: e.target.value }))}
            dir="ltr"
          />
          <DateTimeField
            label={t('admin.leagues.openAt')}
            value={form.registration_open_at}
            onChange={(iso) => setForm((prev) => ({ ...prev, registration_open_at: iso }))}
          />
          <DateTimeField
            label={t('admin.leagues.closeAt')}
            value={form.registration_close_at}
            onChange={(iso) => setForm((prev) => ({ ...prev, registration_close_at: iso }))}
          />
          <Select
            label={t('admin.leagues.active')}
            value={form.is_active ? '1' : '0'}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === '1' }))}
          >
            <option value="1">{t('admin.leagues.activeYes')}</option>
            <option value="0">{t('admin.leagues.activeNo')}</option>
          </Select>
          <div className="md:col-span-2">
            <Textarea
              label={t('admin.leagues.description')}
              value={form.description ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('app.loading') : t('common.save')}
            </Button>
            <FieldError message={error ?? undefined} />
          </div>
        </form>
      </PanelCard>

      <PanelCard title={t('admin.leagues.listTitle')}>
        {loading ? (
          <p className="text-sm text-rc-muted">{t('app.loading')}</p>
        ) : leagues.length === 0 ? (
          <p className="text-sm text-rc-muted">{t('admin.leagues.empty')}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {leagues.map((league) => (
              <li
                key={league.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">
                    {league.name}{' '}
                    {!league.is_active ? (
                      <span className="font-mono text-xs text-amber-300">
                        ({t('admin.leagues.inactive')})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-rc-muted">
                    <span className="font-mono text-rc-blue">{league.slug}</span>
                    {' · '}
                    {formatAmountToman(Number(league.registration_fee))} {t('payment.currency')}
                    {league.capacity != null ? ` · cap ${league.capacity}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/super-admin/leagues/${league.id}`}
                    className="inline-flex items-center rounded-md border border-rc-blue/40 bg-rc-blue/10 px-4 py-2.5 text-sm text-rc-blue hover:bg-rc-blue/20"
                  >
                    {t('admin.leagues.editDetails')}
                  </Link>
                  <Button type="button" variant="secondary" onClick={() => startEdit(league)}>
                    {t('common.edit')}
                  </Button>
                  <Button type="button" variant="danger" onClick={() => void onDelete(league.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
      </HudFrame>
    </PanelPage>
  )
}
