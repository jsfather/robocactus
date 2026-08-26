import { useEffect, useState, type FormEvent } from 'react'
import { Button, FieldError, Input, Select, Textarea } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, SectionLabel } from '@/components/panel/HudKit'
import { useToast } from '@/components/ui/Toast'
import {
  fetchAccessSettings,
  updateAccessSettings,
  type AccessSettings,
} from '@/features/settings/accessApi'

function Toggle({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean
  label: string
  hint: string
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-rc-line bg-rc-surface/70 p-4 transition hover:border-rc-blue/40">
      <span>
        <span className="block text-sm font-bold text-rc-text">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-rc-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-[var(--rc-blue)]"
      />
    </label>
  )
}

export function SuperAdminAccessSettingsPage() {
  const toast = useToast()
  const [form, setForm] = useState<AccessSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patternsText, setPatternsText] = useState('{}')

  useEffect(() => {
    void fetchAccessSettings()
      .then((settings) => {
        setForm(settings)
        setPatternsText(JSON.stringify(settings.sms_patterns ?? {}, null, 2))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const patch = (value: Partial<AccessSettings>) => setForm((current) => current ? { ...current, ...value } : current)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    if (!form.otp_login_enabled && !form.password_login_enabled && !form.email_magic_login_enabled) {
      setError('حداقل یک روش ورود باید فعال بماند.')
      return
    }
    if (!form.email_signup_enabled && !form.phone_signup_enabled) {
      setError('حداقل یک روش ثبت‌نام باید فعال بماند.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const parsedPatterns = JSON.parse(patternsText) as Record<string, string>
      const { id: _id, updated_at: _updatedAt, ...payload } = form
      const saved = await updateAccessSettings({ ...payload, sms_patterns: parsedPatterns })
      setForm(saved)
      setPatternsText(JSON.stringify(saved.sms_patterns ?? {}, null, 2))
      toast.success('تنظیمات دسترسی، ایمیل و پرداخت ذخیره شد.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ذخیره تنظیمات ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelPage
      index="SYS.10"
      title="ورود، ایمیل و پرداخت"
      description="روش‌های ورود و ثبت‌نام، سرویس ایمیل و اطلاعات کارت‌به‌کارت را از یک مرکز کنترل کنید."
    >
      <FieldError message={error ?? undefined} />
      {loading || !form ? <p className="text-rc-muted">در حال بارگذاری…</p> : (
        <form className="space-y-6" onSubmit={(event) => void save(event)}>
          <HudFrame className="space-y-4 p-5">
            <SectionLabel index="AUTH.01" title="روش‌های ورود" hint="حداقل یک روش ورود را فعال نگه دارید." />
            <div className="grid gap-3 lg:grid-cols-3">
              <Toggle checked={form.otp_login_enabled} label="کد یکبارمصرف پیامکی" hint="ورود امن با شماره موبایل و OTP" onChange={(value) => patch({ otp_login_enabled: value })} />
              <Toggle checked={form.password_login_enabled} label="نام کاربری و رمز عبور" hint="شناسه می‌تواند نام کاربری، ایمیل یا موبایل باشد" onChange={(value) => patch({ password_login_enabled: value })} />
              <Toggle checked={form.email_magic_login_enabled} label="لینک ورود ایمیلی" hint="ورود بدون رمز از طریق لینک یکبارمصرف" onChange={(value) => patch({ email_magic_login_enabled: value })} />
            </div>
          </HudFrame>

          <HudFrame className="space-y-4 p-5">
            <SectionLabel index="CAP.05" title="کپچای امنیتی ArCaptcha" hint="محافظت از ورود، ثبت‌نام و فرم‌های عمومی؛ Secret Key فقط در سرور استفاده می‌شود." />
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle checked={form.captcha_enabled ?? false} label="فعال‌سازی کپچا" hint="پس از ثبت هر دو کلید فعال کنید تا کاربران قفل نشوند" onChange={(value) => patch({ captcha_enabled: value })} />
              <Select label="ارائه‌دهنده کپچا" value={form.captcha_provider ?? 'arcaptcha'} onChange={() => patch({ captcha_provider: 'arcaptcha' })}><option value="arcaptcha">ArCaptcha / ابر آروان</option></Select>
              <Input label="Site Key عمومی" value={form.arcaptcha_site_key ?? ''} onChange={(event) => patch({ arcaptcha_site_key: event.target.value })} dir="ltr" />
              <Input label="Secret Key محرمانه" type="password" value={form.arcaptcha_secret_key ?? ''} onChange={(event) => patch({ arcaptcha_secret_key: event.target.value })} dir="ltr" autoComplete="new-password" />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Toggle checked={form.captcha_on_login ?? true} label="ورود کاربران" hint="رمز عبور، لینک ایمیل و درخواست OTP" onChange={(value) => patch({ captcha_on_login: value })} />
              <Toggle checked={form.captcha_on_signup ?? true} label="ثبت‌نام" hint="ثبت‌نام ایمیلی و درخواست کد موبایل" onChange={(value) => patch({ captcha_on_signup: value })} />
              <Toggle checked={form.captcha_on_password_reset ?? true} label="بازیابی رمز" hint="فرم فراموشی رمز عبور" onChange={(value) => patch({ captcha_on_password_reset: value })} />
              <Toggle checked={form.captcha_on_contact ?? true} label="فرم تماس" hint="ارسال پیام به صندوق دبیرخانه" onChange={(value) => patch({ captcha_on_contact: value })} />
              <Toggle checked={form.captcha_on_live_chat ?? true} label="شروع چت آنلاین" hint="پیش از ساخت گفتگوی مهمان" onChange={(value) => patch({ captcha_on_live_chat: value })} />
            </div>
            <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-6 text-amber-800">ابتدا Site Key و Secret Key را ذخیره و اتصال را بررسی کنید؛ سپس گزینه فعال‌سازی کلی را روشن کنید.</p>
          </HudFrame>

          <HudFrame className="space-y-4 p-5">
            <SectionLabel index="API.04" title="کلیدهای سرویس پیامک" hint="مقادیر از دیتابیس خوانده می‌شوند و نیازی به تعریف آن‌ها در فایل env نیست." />
            <div className="grid gap-4 md:grid-cols-2">
              <Select label="سرویس‌دهنده پیامک" value={form.sms_provider ?? 'ippanel'} onChange={(event) => patch({ sms_provider: event.target.value as 'ippanel' | 'kavenegar' })}>
                <option value="ippanel">IPPanel</option>
                <option value="kavenegar">Kavenegar</option>
              </Select>
              <Input label="شماره یا خط ارسال IPPanel" value={form.ippanel_originator ?? ''} onChange={(event) => patch({ ippanel_originator: event.target.value })} dir="ltr" />
              <Input label="API Key سرویس IPPanel" type="password" value={form.ippanel_api_key ?? ''} onChange={(event) => patch({ ippanel_api_key: event.target.value })} dir="ltr" autoComplete="new-password" />
              <Input label="API Key سرویس کاوه‌نگار" type="password" value={form.kavenegar_api_key ?? ''} onChange={(event) => patch({ kavenegar_api_key: event.target.value })} dir="ltr" autoComplete="new-password" />
              <div className="md:col-span-2">
                <Textarea label="کد الگوهای پیامک (JSON)" value={patternsText} onChange={(event) => setPatternsText(event.target.value)} dir="ltr" className="min-h-36 font-mono text-xs" placeholder={'{\n  "auth_otp": "pattern-code"\n}'} />
              </div>
            </div>
          </HudFrame>

          <HudFrame className="space-y-4 p-5">
            <SectionLabel index="REG.02" title="کانال‌های ثبت‌نام" />
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle checked={form.phone_signup_enabled} label="ثبت‌نام با موبایل" hint="ساخت حساب جدید پس از تأیید پیامکی" onChange={(value) => patch({ phone_signup_enabled: value })} />
              <Toggle checked={form.email_signup_enabled} label="ثبت‌نام با ایمیل" hint="ساخت حساب با ایمیل و تأیید لینک" onChange={(value) => patch({ email_signup_enabled: value })} />
            </div>
          </HudFrame>

          <HudFrame className="space-y-4 p-5">
            <SectionLabel index="MAIL.03" title="تنظیمات ایمیل" hint="کلید سرویس فقط برای مدیر کل قابل دسترسی است." />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="ارائه‌دهنده" value={form.email_provider} onChange={(event) => patch({ email_provider: event.target.value })} dir="ltr" />
              <Input label="فرستنده" value={form.email_from ?? ''} onChange={(event) => patch({ email_from: event.target.value })} dir="ltr" placeholder="Tabarestan Cup <no-reply@example.com>" />
              <div className="md:col-span-2">
                <Input label="API Key ایمیل" type="password" value={form.email_api_key ?? ''} onChange={(event) => patch({ email_api_key: event.target.value })} dir="ltr" autoComplete="new-password" />
              </div>
            </div>
          </HudFrame>

          <HudFrame className="space-y-4 p-5">
            <SectionLabel index="PAY.04" title="روش‌های پرداخت" />
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle checked={form.online_payment_enabled} label="پرداخت آنلاین زرین‌پال" hint="هدایت کاربر به درگاه آنلاین" onChange={(value) => patch({ online_payment_enabled: value })} />
              <Toggle checked={form.card_to_card_enabled} label="کارت‌به‌کارت" hint="نمایش کارت بانکی و دریافت تصویر فیش" onChange={(value) => patch({ card_to_card_enabled: value })} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input label="شماره کارت" value={form.bank_card_number ?? ''} onChange={(event) => patch({ bank_card_number: event.target.value })} dir="ltr" />
              <Input label="شماره شبا" value={form.bank_iban ?? ''} onChange={(event) => patch({ bank_iban: event.target.value })} dir="ltr" />
              <Input label="نام صاحب حساب" value={form.bank_account_owner ?? ''} onChange={(event) => patch({ bank_account_owner: event.target.value })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Merchant ID زرین‌پال" type="password" value={form.zarinpal_merchant_id ?? ''} onChange={(event) => patch({ zarinpal_merchant_id: event.target.value })} dir="ltr" autoComplete="new-password" />
              <Toggle checked={form.zarinpal_sandbox ?? false} label="حالت آزمایشی زرین‌پال" hint="برای تست پرداخت بدون تراکنش واقعی فعال کنید" onChange={(value) => patch({ zarinpal_sandbox: value })} />
            </div>
          </HudFrame>

          <Button type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره همه تنظیمات'}</Button>
        </form>
      )}
    </PanelPage>
  )
}
