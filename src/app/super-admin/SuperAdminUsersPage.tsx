import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import {
  adminUpdateProfile,
  assignLeagueAdmin,
  fetchAllLeagues,
  fetchAllProfiles,
  fetchLeagueAdmins,
  removeLeagueAdmin,
  setUserRole,
  type LeagueAdminRow,
} from '@/features/leagues/adminApi'
import { activateUserAccount, createAccountIssue } from '@/features/notifications/api'
import { AccountIssuesAdminList } from '@/features/account-issues/AccountIssuesPanel'
import { useToast } from '@/components/ui/Toast'
import type { League, Profile, UserRole } from '@/types/database'

const ALL_ROLES: UserRole[] = [
  'super_admin',
  'league_admin',
  'staff',
  'company_admin',
  'team_captain',
]

export function SuperAdminUsersPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [admins, setAdmins] = useState<LeagueAdminRow[]>([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    national_id: '',
    address: '',
    company_name: '',
    company_national_id: '',
    economic_code: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, l, a] = await Promise.all([
        fetchAllProfiles(),
        fetchAllLeagues(),
        fetchLeagueAdmins(),
      ])
      setProfiles(p)
      setLeagues(l)
      setAdmins(a)
      if (!selectedLeague && l[0]) setSelectedLeague(l[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const leagueAdmins = useMemo(
    () => admins.filter((a) => a.league_id === selectedLeague),
    [admins, selectedLeague],
  )

  const profileName = (id: string) => {
    const p = profiles.find((x) => x.id === id)
    return p ? `${p.full_name} (${p.phone})` : id.slice(0, 8)
  }

  const openEdit = (profile: Profile) => {
    setEditing(profile)
    setEditForm({
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      email: profile.email ?? '',
      national_id: profile.national_id ?? '',
      address: profile.address ?? '',
      company_name: profile.company_name ?? '',
      company_national_id: profile.company_national_id ?? '',
      economic_code: profile.economic_code ?? '',
    })
  }

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const updated = await adminUpdateProfile({
        userId: editing.id,
        fullName: editForm.full_name,
        phone: editForm.phone,
        email: editForm.email,
        nationalId: editForm.national_id,
        address: editForm.address,
        companyName: editForm.company_name,
        companyNationalId: editForm.company_national_id,
        economicCode: editForm.economic_code,
      })
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
      setEditing(null)
      toast.success(t('admin.users.saved'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error')
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onRoleChange = async (userId: string, role: UserRole) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await setUserRole(userId, role)
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onAssign = async () => {
    if (!selectedLeague || !assignUserId) return
    setBusy(true)
    setError(null)
    try {
      await assignLeagueAdmin(selectedLeague, assignUserId)
      setAssignUserId('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (userId: string) => {
    if (!selectedLeague) return
    setBusy(true)
    try {
      await removeLeagueAdmin(selectedLeague, userId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{t('admin.users.title')}</h1>
        <p className="mt-1 text-rc-muted">{t('admin.users.subtitle')}</p>
      </div>

      <FieldError message={error ?? undefined} />

      {editing ? (
        <PanelCard title={t('admin.users.editTitle')} description={editing.full_name}>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void onSaveEdit(e)}>
            <Input
              label={t('auth.fullName')}
              required
              value={editForm.full_name}
              onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
            />
            <Input
              label={t('auth.phone')}
              required
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.email')}
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.nationalId')}
              value={editForm.national_id}
              onChange={(e) => setEditForm((f) => ({ ...f, national_id: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.companyNationalId')}
              value={editForm.company_national_id}
              onChange={(e) => setEditForm((f) => ({ ...f, company_national_id: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.economicCode')}
              value={editForm.economic_code}
              onChange={(e) => setEditForm((f) => ({ ...f, economic_code: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('company.name')}
              value={editForm.company_name}
              onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
            />
            <div className="md:col-span-2">
              <Textarea
                label={t('auth.address')}
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? t('app.loading') : t('common.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </PanelCard>
      ) : null}

      <PanelCard title={t('admin.users.listTitle')}>
        {loading ? (
          <p className="text-sm text-rc-muted">{t('app.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-rc-muted">
                  <th className="px-2 py-2 text-start">{t('auth.fullName')}</th>
                  <th className="px-2 py-2 text-start">{t('auth.phone')}</th>
                  <th className="px-2 py-2 text-start">{t('dashboard.role')}</th>
                  <th className="px-2 py-2 text-start">{t('admin.users.status')}</th>
                  <th className="px-2 py-2 text-start">{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-b border-white/5">
                    <td className="px-2 py-2">{profile.full_name}</td>
                    <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                      {profile.phone}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="rounded-md border border-white/10 bg-rc-navy px-2 py-1.5 text-sm"
                        value={profile.role}
                        disabled={busy}
                        onChange={(e) =>
                          void onRoleChange(profile.id, e.target.value as UserRole)
                        }
                      >
                        {ALL_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {t(`dashboard.roles.${role}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {profile.account_status ?? 'active'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => openEdit(profile)}
                        >
                          {t('common.edit')}
                        </Button>
                        {profile.account_status === 'pending' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void activateUserAccount(profile.id)
                                .then(reload)
                                .then(() => toast.success(t('admin.users.activated')))
                                .catch((err: Error) => {
                                  setError(err.message)
                                  toast.error(err.message)
                                })
                            }
                          >
                            {t('admin.users.activate')}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const title = window.prompt(t('admin.users.issueTitle'))
                            if (!title) return
                            void createAccountIssue({ userId: profile.id, title })
                              .then(() => toast.success(t('admin.users.issueLogged')))
                              .catch((err: Error) => toast.error(err.message))
                          }}
                        >
                          {t('admin.users.logIssue')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <PanelCard title={t('admin.users.assignTitle')} description={t('admin.users.assignHint')}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Select
            label={t('team.league')}
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
          >
            <option value="">{t('team.selectLeague')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('admin.users.pickUser')}
            value={assignUserId}
            onChange={(e) => setAssignUserId(e.target.value)}
          >
            <option value="">{t('admin.users.pickUserPlaceholder')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} — {p.phone}
              </option>
            ))}
          </Select>
          <Button type="button" onClick={() => void onAssign()} disabled={busy || !assignUserId}>
            {t('admin.users.assignCta')}
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-white/5">
          {leagueAdmins.length === 0 ? (
            <li className="py-2 text-sm text-rc-muted">{t('admin.users.noAdmins')}</li>
          ) : (
            leagueAdmins.map((row) => (
              <li key={`${row.league_id}-${row.user_id}`} className="flex items-center justify-between py-2">
                <span className="text-sm">{profileName(row.user_id)}</span>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void onRemove(row.user_id)}
                  disabled={busy}
                >
                  {t('common.delete')}
                </Button>
              </li>
            ))
          )}
        </ul>
      </PanelCard>

      <AccountIssuesAdminList />
    </div>
  )
}
