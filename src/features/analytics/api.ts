import { backend } from '@/lib/backend'

export type AnalyticsBucket = {
  key: string
  count: number
  id?: string
  slug?: string
  amount?: number
}

export type AnalyticsSnapshot = {
  generated_at: string
  totals: {
    teams: number
    companies: number
    paid_invoices: number
    paid_amount: number
  }
  by_status: AnalyticsBucket[]
  by_league: AnalyticsBucket[]
  by_province: AnalyticsBucket[]
  by_company: AnalyticsBucket[]
  finance_by_status: AnalyticsBucket[]
}

export type AnalyticsExportRow = {
  id: string
  team_name: string
  status: string
  province: string | null
  city: string | null
  member_count: number | null
  created_at: string
  submitted_at: string | null
  league_name: string
  league_slug: string
  company_name: string
  company_slug: string
  captain_name: string | null
  captain_phone: string | null
  invoice_number: string | null
  invoice_amount: number | null
  invoice_status: string | null
  paid_at: string | null
}

export async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const { data, error } = await backend.rpc('analytics_snapshot')
  if (error) throw new Error(error.message)
  return data as AnalyticsSnapshot
}

export async function fetchAnalyticsExportRows(): Promise<AnalyticsExportRow[]> {
  const { data, error } = await backend.rpc('analytics_export_teams')
  if (error) throw new Error(error.message)
  return (data ?? []) as AnalyticsExportRow[]
}

export function downloadCsv(filename: string, rows: AnalyticsExportRow[]): void {
  const headers = [
    'team_name',
    'status',
    'province',
    'city',
    'league_name',
    'company_name',
    'captain_name',
    'captain_phone',
    'member_count',
    'invoice_number',
    'invoice_amount',
    'invoice_status',
    'paid_at',
    'created_at',
    'submitted_at',
  ] as const

  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function openAnalyticsPdf(rows: AnalyticsExportRow[], title: string): void {
  const tr = rows
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.team_name)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.league_name)}</td>
      <td>${escapeHtml(r.company_name)}</td>
      <td>${escapeHtml(r.province ?? '')}</td>
      <td>${escapeHtml(r.invoice_status ?? '')}</td>
      <td>${escapeHtml(r.invoice_amount != null ? String(r.invoice_amount) : '')}</td>
    </tr>`,
    )
    .join('')

  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:Tahoma,sans-serif;padding:24px;color:#111}
  h1{font-size:18px} table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #ccc;padding:6px;text-align:right}
  th{background:#f3f4f6}
  @media print{button{display:none}}
</style></head><body>
  <button onclick="window.print()">چاپ / PDF</button>
  <h1>${escapeHtml(title)}</h1>
  <p>${rows.length} ردیف — ${new Date().toLocaleString('fa-IR')}</p>
  <table>
    <thead><tr>
      <th>تیم</th><th>وضعیت</th><th>لیگ</th><th>شرکت</th><th>استان</th><th>پرداخت</th><th>مبلغ</th>
    </tr></thead>
    <tbody>${tr}</tbody>
  </table>
</body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (win) {
    win.addEventListener('load', () => {
      try {
        win.print()
      } catch {
        /* ignore */
      }
    })
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
