import type { Company, Invoice, League, Team } from '@/types/database'
import { formatAmountToman } from './api'

/** Simple printable HTML invoice — user can Save as PDF from the browser print dialog. */
export function buildInvoiceHtml(input: {
  invoice: Invoice
  team: Team
  company: Company
  league: League
}): string {
  const { invoice, team, company, league } = input
  const paid = invoice.status === 'paid'
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فاکتور ${invoice.invoice_number ?? invoice.id}</title>
  <style>
    body { font-family: Tahoma, sans-serif; padding: 32px; color: #111; background: #fff; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .muted { color: #666; font-size: 13px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: right; font-size: 14px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${paid ? '#dcfce7' : '#fef3c7'}; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">چاپ / ذخیره PDF</button>
  <h1>فاکتور روبوکاکتوس</h1>
  <p class="muted">RoboCactus Invoice</p>
  <div class="box">
    <p><strong>شماره فاکتور:</strong> ${invoice.invoice_number ?? '—'}</p>
    <p><strong>وضعیت:</strong> <span class="badge">${invoice.status}</span></p>
    <p><strong>شرکت:</strong> ${company.name}</p>
    <p><strong>تیم:</strong> ${team.name}</p>
    <p><strong>لیگ:</strong> ${league.name}</p>
    <p><strong>تاریخ:</strong> ${new Date(invoice.created_at).toLocaleString('fa-IR')}</p>
    ${invoice.paid_at ? `<p><strong>پرداخت:</strong> ${new Date(invoice.paid_at).toLocaleString('fa-IR')}</p>` : ''}
    ${invoice.gateway_ref ? `<p><strong>پیگیری درگاه:</strong> ${invoice.gateway_ref}</p>` : ''}
    <table>
      <thead><tr><th>شرح</th><th>مبلغ (ریال)</th></tr></thead>
      <tbody>
        <tr><td>هزینه ثبت‌نام ${league.name}</td><td>${formatAmountToman(Number(invoice.amount))}</td></tr>
        <tr><td>تخفیف</td><td>${formatAmountToman(Number(invoice.discount_amount ?? 0))}</td></tr>
        <tr><td><strong>قابل پرداخت</strong></td><td><strong>${formatAmountToman(Number(invoice.amount) - Number(invoice.discount_amount ?? 0))}</strong></td></tr>
      </tbody>
    </table>
  </div>
</body>
</html>`
}

export function downloadInvoicePdf(input: {
  invoice: Invoice
  team: Team
  company: Company
  league: League
}) {
  const html = buildInvoiceHtml(input)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.download = `${input.invoice.invoice_number ?? 'invoice'}.html`
    a.click()
  } else {
    win.addEventListener('load', () => {
      try {
        win.print()
      } catch {
        /* user can print manually */
      }
    })
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
