import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/FormControls'
import { backend } from '@/lib/backend'
import { isStrongPassword, PasswordField } from '@/components/auth/PasswordField'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = params.get('code') ?? ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isStrongPassword(password)) return setError('رمز باید حداقل ۸ کاراکتر و شامل حرف بزرگ، حرف کوچک و عدد باشد.')
    if (password !== confirm) return setError('رمز عبور و تکرار آن یکسان نیستند.')
    setBusy(true)
    setError(null)
    const { error: resetError } = await backend.auth.confirmPasswordReset(code, password)
    setBusy(false)
    if (resetError) return setError('لینک بازیابی نامعتبر یا منقضی شده است؛ دوباره درخواست بازیابی بدهید.')
    setDone(true)
  }

  return (
    <div className="auth-stage mx-auto flex min-h-[72vh] max-w-xl items-center px-4 py-12">
      <div className="w-full rounded-[2rem] border border-white/70 bg-white p-6 shadow-[0_30px_90px_rgb(18_76_98/0.16)] sm:p-10">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rc-blue to-emerald-500 text-2xl font-black text-white">ت</span>
        <h1 className="mt-6 text-3xl font-black text-slate-900">تعیین رمز عبور جدید</h1>
        {done ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">رمز عبور با موفقیت تغییر کرد. اکنون می‌توانید وارد حساب شوید.</div> : (
          <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)}>
            <PasswordField label="رمز عبور جدید" value={password} onChange={setPassword} />
            <PasswordField label="تکرار رمز عبور جدید" value={confirm} onChange={setConfirm} confirmValue={password} />
            {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <Button className="w-full" disabled={busy || !code}>{busy ? 'در حال ذخیره…' : 'ذخیره رمز جدید'}</Button>
          </form>
        )}
        <Link to="/login" className="mt-6 inline-flex text-sm font-bold text-rc-blue hover:underline">رفتن به صفحه ورود</Link>
      </div>
    </div>
  )
}
