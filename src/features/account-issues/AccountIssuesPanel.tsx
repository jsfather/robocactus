import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, PanelCard, Textarea } from '@/components/ui/FormControls'
import { HudFrame } from '@/components/panel/HudKit'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'

export type AccountIssue = {
  id: string
  user_id: string
  title: string
  body: string | null
  status: 'open' | 'awaiting_review' | 'resolved'
  user_response: string | null
  user_responded_at: string | null
  created_at: string
  resolved_at: string | null
}

export async function fetchMyAccountIssues(): Promise<AccountIssue[]> {
  const { data, error } = await supabase
    .from('account_issues')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as AccountIssue[]
}

export async function respondToAccountIssue(issueId: string, response: string): Promise<AccountIssue> {
  const { data, error } = await supabase.rpc('respond_account_issue', {
    p_issue_id: issueId,
    p_response: response,
  })
  if (error) throw new Error(error.message)
  return data as AccountIssue
}

export async function resolveAccountIssue(issueId: string): Promise<AccountIssue> {
  const { data, error } = await supabase.rpc('resolve_account_issue', {
    p_issue_id: issueId,
  })
  if (error) throw new Error(error.message)
  return data as AccountIssue
}

export async function fetchAllAccountIssues(): Promise<AccountIssue[]> {
  const { data, error } = await supabase
    .from('account_issues')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as AccountIssue[]
}

/** Banner + resolver UI for the signed-in user */
export function AccountIssuesPanel() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const [issues, setIssues] = useState<AccountIssue[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    if (!user) return
    try {
      setIssues(await fetchMyAccountIssues())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const openOnes = issues.filter((i) => i.status !== 'resolved')
  if (!openOnes.length) return null

  const onSubmit = async (e: FormEvent, issueId: string) => {
    e.preventDefault()
    const text = drafts[issueId]?.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      await respondToAccountIssue(issueId, text)
      toast.success(t('accountIssues.submitted'))
      setDrafts((d) => ({ ...d, [issueId]: '' }))
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error')
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 space-y-3">
      {openOnes.map((issue) => (
        <HudFrame key={issue.id} className="border-amber-500/40 bg-amber-500/5 p-4" glow>
          <p className="font-mono text-[10px] tracking-[0.2em] text-amber-300 uppercase">
            {t('accountIssues.badge')} · {issue.status}
          </p>
          <h3 className="mt-2 text-base font-semibold">{issue.title}</h3>
          {issue.body ? <p className="mt-1 text-sm text-rc-muted">{issue.body}</p> : null}
          {issue.user_response ? (
            <p className="mt-3 border border-rc-line bg-rc-surface/50 p-3 text-sm">
              <span className="font-mono text-[10px] text-rc-blue uppercase">
                {t('accountIssues.yourResponse')}
              </span>
              <span className="mt-1 block">{issue.user_response}</span>
            </p>
          ) : null}
          {issue.status !== 'awaiting_review' || !issue.user_response ? (
            <form className="mt-3 space-y-2" onSubmit={(e) => void onSubmit(e, issue.id)}>
              <Textarea
                label={t('accountIssues.fixHint')}
                value={drafts[issue.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [issue.id]: e.target.value }))}
                required
              />
              <Button type="submit" disabled={busy}>
                {t('accountIssues.submitFix')}
              </Button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-rc-muted">{t('accountIssues.waitingReview')}</p>
          )}
        </HudFrame>
      ))}
      <FieldError message={error ?? undefined} />
    </div>
  )
}

export function AccountIssuesAdminList() {
  const { t } = useTranslation()
  const toast = useToast()
  const [issues, setIssues] = useState<AccountIssue[]>([])
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    setIssues(await fetchAllAccountIssues())
  }

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [])

  return (
    <PanelCard title={t('accountIssues.adminTitle')} description={t('accountIssues.adminHint')}>
      <ul className="divide-y divide-rc-line">
        {issues.length === 0 ? (
          <li className="py-2 text-sm text-rc-muted">{t('accountIssues.empty')}</li>
        ) : (
          issues.map((issue) => (
            <li key={issue.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{issue.title}</p>
                <p className="text-xs text-rc-muted">
                  {issue.status} · {new Date(issue.created_at).toLocaleString()}
                </p>
                {issue.user_response ? (
                  <p className="mt-2 text-sm text-rc-text">{issue.user_response}</p>
                ) : null}
              </div>
              {issue.status !== 'resolved' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void resolveAccountIssue(issue.id)
                      .then(() => toast.success(t('accountIssues.resolved')))
                      .then(reload)
                      .catch((err: Error) => toast.error(err.message))
                      .finally(() => setBusy(false))
                  }}
                >
                  {t('accountIssues.resolve')}
                </Button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </PanelCard>
  )
}
