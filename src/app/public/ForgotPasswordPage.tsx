import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input } from '@/components/ui/FormControls'
import { backend } from '@/lib/backend'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: requestError } = await backend.auth.requestPasswordReset(email.trim())
    setBusy(false)
    if (requestError) {
      setError(requestError.message === 'too_many_attempts' ? 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.' : 'ارسال لینک بازیابی ناموفق بود.')
      return
    }
    setSent(true)
  }

  return (
    <div className="auth-stage mx-auto flex min-h-[72vh] max-w-6xl items-center px-4 py-12">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_30px_90px_rgb(18_76_98/0.16)] md:grid-cols-[0.8fr_1.2fr]">
        <div className="hidden bg-gradient-to-br from-[#0b4964] via-[#087eb8] to-[#0b9b65] p-8 text-white md:flex md:flex-col md:justify-between">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-black">ت</span>
          <div><p className="text-2xl font-black">بازیابی امن حساب</p><p className="mt-3 text-sm leading-7 text-white/75">لینک یک‌بارمصرف برای ایمیل حساب شما ارسال می‌شود و فقط ۱۵ دقیقه اعتبار دارد.</p></div>
        </div>
        <div className="p-6 sm:p-10">
          <p className="text-sm font-bold text-emerald-600">جام تبرستان</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">فراموشی رمز عبور</h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">ایمیلی را وارد کنید که هنگام ثبت‌نام استفاده کرده‌اید.</p>
          {sent ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-800">
              اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی برای آن ارسال شد. پوشه Spam را نیز بررسی کنید.
            </div>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
              <Input label="ایمیل حساب" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} dir="ltr" autoComplete="email" placeholder="name@example.com" />
              {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
              <Button className="w-full" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال لینک بازیابی'}</Button>
            </form>
          )}
          <Link to="/login" className="mt-6 inline-flex text-sm font-bold text-rc-blue hover:underline">بازگشت به ورود</Link>
        </div>
      </div>
    </div>
  )
}
