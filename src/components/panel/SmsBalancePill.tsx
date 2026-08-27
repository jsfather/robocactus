import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchKavenegarBalance } from '@/features/kavenegar/api'

export function SmsBalancePill() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    const load = () => void fetchKavenegarBalance().then(setBalance).catch(() => setBalance(null))
    load()
    const timer = window.setInterval(load, 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (balance == null) return null
  return <Link to="/super-admin/kavenegar" title="مشاهده مرکز پیامک" className="hidden items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 xl:flex"><span className="size-2 rounded-full bg-emerald-500" /><span>اعتبار پیامک</span><span dir="ltr" className="font-mono tabular-nums">{Math.round(balance).toLocaleString('fa-IR')}</span><span className="text-[10px]">ریال</span></Link>
}
