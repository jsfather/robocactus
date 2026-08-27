import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelPage } from '@/components/layout/PanelShell'
import { Button, FieldError, Input, PanelCard, Select, StatusBadge, Textarea } from '@/components/ui/FormControls'
import { HudFrame, SectionLabel, StatCard } from '@/components/panel/HudKit'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { formatAppDateTime } from '@/lib/dates'
import { useToast } from '@/components/ui/Toast'
import { fetchAccessSettings, updateAccessSettings, type AccessSettings } from '@/features/settings/accessApi'
import {
  fetchKavenegarOverview,
  rotateKavenegarWebhookSecret,
  runKavenegarOperation,
  uploadKavenegarMedia,
  type KavenegarLog,
  type KavenegarOperation,
  type KavenegarResult,
} from '@/features/kavenegar/api'

type Tab = 'send' | 'reports' | 'inbox' | 'blocked' | 'templates' | 'media' | 'account' | 'logs'

type Preset = { operation: KavenegarOperation; label: string; sample: Record<string, unknown>; note?: string }
type ProviderTemplate = { id?: number; name: string; smsmessage?: string; approvalstatus?: string }

const siteEvents = [
  ['auth_otp', 'کد ورود و احراز هویت', '%token = کد شش‌رقمی'],
  ['account_approved', 'تأیید حساب کاربری', '%token = نام کاربر'],
  ['registration_submitted', 'ثبت پرونده شرکت در لیگ', '%token = تیم، %token2 = لیگ، %token3 = کد پیگیری'],
  ['league_joined', 'قطعی‌شدن عضویت در لیگ', '%token = تیم، %token2 = لیگ'],
  ['payment_confirmed', 'پرداخت موفق', '%token = مبلغ، %token2 = شماره فاکتور، %token3 = تیم'],
  ['incomplete_profile', 'یادآوری تکمیل اطلاعات', '%token = نام کاربر'],
  ['account_issue', 'اعلام نقص پرونده', '%token = عنوان نقص'],
  ['result_announced', 'اعلام نتیجه مسابقه', '%token = لیگ، %token2 = تیم، %token3 = رتبه'],
  ['newsletter_confirmed', 'تأیید عضویت خبرنامه', '%token = نام، %token2 = نام کانال'],
  ['incomplete_registration_reminder', 'یادآوری ادامه ثبت‌نام لیگ', '%token = نام، %token2 = لیگ'],
  ['team_approval_reminder', 'یادآوری تکمیل تأیید تیم', '%token = تیم، %token2 = لیگ'],
  ['account_verification_reminder', 'یادآوری تأیید حساب', '%token = نام، %token2 = لیگ'],
  ['payment_reminder', 'یادآوری پرداخت صورتحساب', '%token = تیم، %token2 = لیگ، %token3 = شماره صورتحساب'],
] as const

const reportPresets: Preset[] = [
  { operation: 'status', label: 'وضعیت با شناسه پیام', sample: { messageid: '123,456' }, note: 'حداکثر ۵۰۰ شناسه و فقط پیام‌های ۴۸ ساعت گذشته' },
  { operation: 'statusLocal', label: 'وضعیت با شناسه محلی', sample: { localid: '1001,1002' }, note: 'گزارش شناسه محلی تا ۱۲ ساعت' },
  { operation: 'statusByReceptor', label: 'وضعیت براساس گیرنده', sample: { receptor: '09120000000', startdate: 0, enddate: 0 } },
  { operation: 'select', label: 'جزئیات پیام‌ها', sample: { messageid: '123,456' }, note: 'برای این متد IP سرور را در امنیت کاوه‌نگار ثبت کنید' },
  { operation: 'outbox', label: 'صندوق خروجی بازه‌ای', sample: { startdate: 0, enddate: 0, sender: '' }, note: 'بازه حداکثر یک روز و شروع حداکثر سه روز قبل' },
  { operation: 'latestOutbox', label: 'آخرین ارسال‌ها', sample: { pagesize: 100, sender: '' }, note: 'حداکثر ۵۰۰ رکورد؛ نیازمند ثبت IP سرور' },
  { operation: 'countOutbox', label: 'شمارش صندوق خروجی', sample: { startdate: 0, enddate: 0, status: 10 } },
  { operation: 'cancel', label: 'لغو ارسال زمان‌بندی‌شده', sample: { messageid: '123' } },
]

const inboxPresets: Preset[] = [
  { operation: 'inboxPaged', label: 'دریافت صفحه‌بندی‌شده', sample: { linenumber: '3000...', isread: 0, startdate: 0, enddate: 0, pagenumber: 1 }, note: 'هر صفحه ۲۰۰ پیام و بازه حداکثر دو روز' },
  { operation: 'unreadInbox', label: 'دریافت سریع پیام‌ها', sample: { linenumber: '3000...', isread: 0 }, note: 'هر فراخوانی حداکثر ۱۰۰ پیام' },
  { operation: 'countInbox', label: 'شمارش صندوق ورودی', sample: { startdate: 0, enddate: 0, linenumber: '3000...', isread: 0 } },
]

const blockedPresets: Preset[] = [
  { operation: 'blockedList', label: 'فهرست مسدودها', sample: { linenumber: '3000...', blockreason: 0, pagenumber: 1 } },
  { operation: 'blockedExists', label: 'بررسی عضویت در مسدودها', sample: { linenumber: '3000...', receptor: '0912...,0935...' } },
  { operation: 'blockedAdd', label: 'افزودن به مسدودها', sample: { linenumber: '3000...', receptor: '0912...,0935...' }, note: 'حداکثر ۲۰۰ شماره' },
  { operation: 'blockedRemove', label: 'حذف از مسدودها', sample: { linenumber: '3000...', receptor: '0912...' }, note: 'حداکثر ۵۰ شماره؛ فقط موارد افزوده‌شده با API یا پنل' },
]

const templatePresets: Preset[] = [
  { operation: 'templateList', label: 'فهرست الگوها', sample: { page: 1 } },
  { operation: 'templateGet', label: 'دریافت یک الگو', sample: { id: 123 } },
  { operation: 'templateAdd', label: 'ساخت الگو', sample: { sourceType: 0, sendMethod: 1, fallBackMethod: 3, name: 'LoginOtp', textMessage: 'کد ورود شما %token است' }, note: 'نام انگلیسی بدون فاصله و زیرخط؛ متن باید %token داشته باشد' },
  { operation: 'templateUpdate', label: 'ویرایش الگو', sample: { templateId: 123, sourceType: 0, sendMethod: 1, fallBackMethod: 3, name: 'LoginOtp', textMessage: 'کد ورود شما %token است' } },
  { operation: 'templateClone', label: 'کپی الگو', sample: { sourceTemplateId: 123, newTemplateName: 'LoginOtpCopy' } },
  { operation: 'templateDelete', label: 'حذف الگو', sample: { id: 123 } },
]

const mediaPresets: Preset[] = [
  { operation: 'mediaList', label: 'فهرست رسانه‌ها', sample: { page: 1, size: 50 } },
  { operation: 'mediaGet', label: 'اطلاعات رسانه', sample: { id: 'media-uuid' } },
  { operation: 'mediaDelete', label: 'حذف رسانه', sample: { id: 'media-uuid' } },
]

const accountPresets: Preset[] = [
  { operation: 'accountInfo', label: 'اعتبار و اطلاعات حساب', sample: {} },
  { operation: 'accountConfig', label: 'خواندن تنظیمات حساب', sample: {} },
  { operation: 'updateAccountConfig', label: 'تغییر تنظیمات حساب', sample: { apilogs: 'justfaults', debugmode: 'disabled', defaultsender: '', mincreditalarm: 100000, resendfailed: 'disabled' }, note: 'debugmode=enabled جلوی ارسال واقعی را می‌گیرد' },
]

function JsonResult({ value }: { value: KavenegarResult | null }) {
  if (!value) return <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">نتیجه عملیات اینجا نمایش داده می‌شود</div>
  const entries = Array.isArray(value.entries) ? value.entries.length : value.entries ? 1 : 0
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><StatusBadge status="approved" label={`کد ${value.return?.status ?? 200}`} />{entries ? <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{entries} رکورد</span> : null}<span className="text-sm text-slate-500">{value.return?.message}</span></div>
    <pre className="max-h-[32rem] overflow-auto rounded-2xl bg-slate-950 p-4 text-left font-mono text-xs leading-6 text-emerald-200" dir="ltr">{JSON.stringify(value, null, 2)}</pre>
  </div>
}

function Workbench({ title, presets, onComplete }: { title: string; presets: Preset[]; onComplete: (value: KavenegarResult) => void }) {
  const toast = useToast()
  const [selected, setSelected] = useState(presets[0])
  const [json, setJson] = useState(() => JSON.stringify(presets[0]?.sample ?? {}, null, 2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changePreset = (operation: string) => {
    const next = presets.find((item) => item.operation === operation) ?? presets[0]
    setSelected(next)
    setJson(JSON.stringify(next.sample, null, 2))
    setError(null)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const params = JSON.parse(json) as Record<string, unknown>
      const result = await runKavenegarOperation(selected.operation, params)
      onComplete(result); toast.success('عملیات کاوه‌نگار با موفقیت انجام شد')
    } catch (err) { setError(err instanceof Error ? err.message : 'عملیات ناموفق بود') } finally { setBusy(false) }
  }
  return <PanelCard title={title} description={selected.note}>
    <form className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]" onSubmit={(event) => void submit(event)}>
      <div className="space-y-3"><Select label="عملیات" value={selected.operation} onChange={(event) => changePreset(event.target.value)}>{presets.map((preset) => <option key={preset.operation} value={preset.operation}>{preset.label}</option>)}</Select><Button type="submit" className="w-full" disabled={busy}>{busy ? 'در حال ارتباط…' : 'اجرای عملیات'}</Button><FieldError message={error ?? undefined} /></div>
      <Textarea label="پارامترهای درخواست (JSON)" value={json} onChange={(event) => setJson(event.target.value)} className="min-h-48 font-mono text-xs" dir="ltr" />
    </form>
  </PanelCard>
}

export function SuperAdminKavenegarPage() {
  const { i18n } = useTranslation()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('send')
  const [logs, setLogs] = useState<KavenegarLog[]>([])
  const [configured, setConfigured] = useState(false)
  const [settings, setSettings] = useState<AccessSettings | null>(null)
  const [patternsText, setPatternsText] = useState('{}')
  const [result, setResult] = useState<KavenegarResult | null>(null)
  const [approvedTemplates, setApprovedTemplates] = useState<ProviderTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [send, setSend] = useState({ receptor: '', message: '', sender: '', date: '', type: '1', localid: '', hide: false, tag: '', policy: '', mediaid: '' })
  const [lookup, setLookup] = useState({ receptor: '', template: '', token: '', token2: '', token3: '', token10: '', token20: '', type: 'sms' })
  const [bulk, setBulk] = useState({ receptors: '', senders: '', messages: '', date: '', tag: '', policy: '' })
  const successLogs = logs.filter((row) => row.status === 'success').length
  const failedLogs = logs.filter((row) => row.status === 'failed').length
  const deliveredLogs = logs.filter((row) => row.provider_status === 10).length

  const reload = async () => {
    try {
      const [overview, access] = await Promise.all([fetchKavenegarOverview(), fetchAccessSettings()])
      setConfigured(overview.configured); setLogs(overview.logs); setSettings(access); setPatternsText(JSON.stringify(access.sms_patterns ?? {}, null, 2))
      setSend((current) => ({ ...current, sender: current.sender || access.kavenegar_sender || '' }))
    } catch (err) { setError(err instanceof Error ? err.message : 'دریافت اطلاعات ناموفق بود') }
  }
  useEffect(() => { void reload() }, [])

  const execute = async (operation: KavenegarOperation, params: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try { const value = await runKavenegarOperation(operation, params); setResult(value); if (operation === 'templateList') setApprovedTemplates((Array.isArray(value.entries) ? value.entries : []).filter((entry): entry is ProviderTemplate => !!entry && typeof entry === 'object' && !!(entry as ProviderTemplate).name && String((entry as ProviderTemplate).approvalstatus).toLowerCase() === 'approved')); toast.success('درخواست با موفقیت اجرا شد'); await reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'درخواست ناموفق بود') }
    finally { setBusy(false) }
  }
  const completeWorkbench = (value: KavenegarResult) => { setResult(value); void reload() }

  const sendSimple = (event: FormEvent) => {
    event.preventDefault()
    const date = send.date ? Math.floor(new Date(send.date).getTime() / 1000) : undefined
    void execute('send', { ...send, date, hide: send.hide ? 1 : undefined })
  }
  const sendLookup = (event: FormEvent) => { event.preventDefault(); void execute('lookup', lookup) }
  const sendBulk = (event: FormEvent) => {
    event.preventDefault()
    const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)
    void execute('sendArray', { receptor: lines(bulk.receptors), sender: lines(bulk.senders), message: lines(bulk.messages), date: bulk.date ? Math.floor(new Date(bulk.date).getTime() / 1000) : undefined, tag: bulk.tag, policy: bulk.policy })
  }

  const saveSettings = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault(); if (!settings) return; setBusy(true)
    try {
      const saved = await updateAccessSettings({
        sms_provider: 'kavenegar', kavenegar_api_key: settings.kavenegar_api_key,
        kavenegar_sender: settings.kavenegar_sender, kavenegar_default_type: Number(settings.kavenegar_default_type ?? 1),
        kavenegar_default_tag: settings.kavenegar_default_tag, kavenegar_default_policy: settings.kavenegar_default_policy,
        kavenegar_webhook_secret: settings.kavenegar_webhook_secret,
        sms_patterns: JSON.parse(patternsText) as Record<string, string>,
      })
      setSettings(saved); toast.success('تنظیمات کاوه‌نگار ذخیره شد'); await reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'ذخیره ناموفق بود') } finally { setBusy(false) }
  }

  const updateEventPattern = (key: string, value: string) => {
    let current: Record<string, string> = {}
    try { current = JSON.parse(patternsText) as Record<string, string> } catch { /* repair invalid JSON through structured fields */ }
    if (value.trim()) current[key] = value.trim(); else delete current[key]
    setPatternsText(JSON.stringify(current, null, 2))
  }
  const currentPatterns = (() => { try { return JSON.parse(patternsText) as Record<string, string> } catch { return {} } })()

  const tabs: Array<[Tab, string]> = [['send', 'ارسال'], ['reports', 'گزارش و وضعیت'], ['inbox', 'صندوق ورودی'], ['blocked', 'مسدودها'], ['templates', 'الگوها'], ['media', 'رسانه'], ['account', 'حساب و اتصال'], ['logs', 'لاگ عملیات']]

  return <PanelPage index="SYS.SMS" title="مرکز عملیات کاوه‌نگار" description="ارسال، گزارش تحویل، صندوق پیام، الگوها، رسانه و تنظیمات حساب از یک پنل امن" actions={<Button type="button" variant="secondary" onClick={() => void reload()}>به‌روزرسانی</Button>}>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard index="KV01" label="وضعیت اتصال" value={configured ? 'متصل' : 'نیازمند کلید'} hint="API Key فقط در سرور استفاده می‌شود" accent={configured ? 'green' : 'red'} />
      <StatCard index="KV02" label="عملیات موفق" value={successLogs} hint="در ۱۰۰ عملیات آخر" accent="green" />
      <StatCard index="KV03" label="تحویل قطعی" value={deliveredLogs} hint="وضعیت رسمی ۱۰ کاوه‌نگار" />
      <StatCard index="KV04" label="عملیات ناموفق" value={failedLogs} hint="برای بررسی وارد لاگ شوید" accent={failedLogs ? 'red' : 'green'} />
    </div>
    <div className="panel-tabs flex gap-2 rounded-2xl border border-white/80 bg-white p-2 shadow-sm">{tabs.map(([key, label]) => <Button key={key} type="button" variant={tab === key ? 'primary' : 'ghost'} onClick={() => setTab(key)}>{label}</Button>)}</div>
    <FieldError message={error ?? undefined} />

    {tab === 'account' ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900"><strong className="block">تفاوت API Key و الگوی Lookup</strong><p>API Key فقط اتصال حساب را برقرار می‌کند. نام <span dir="ltr" className="font-mono font-bold">auth_otp</span> باید به نام دقیق الگوی تأییدشده نگاشت شود. در نبود الگوی معتبر، OTP اکنون از مسیر پیامک عادی ارسال می‌شود.</p><Button type="button" variant="secondary" disabled={busy} onClick={() => void execute('templateList', { page: 1 })}>بررسی اتصال و دریافت فهرست الگوها</Button></div> : null}
    {tab === 'account' && approvedTemplates.length ? <PanelCard title="الگوهای تأییدشده" description="الگوی مناسب را برای کد ورود انتخاب و سپس تنظیمات اتصال را ذخیره کنید."><div className="grid gap-3 md:grid-cols-2">{approvedTemplates.map((template) => <button key={template.id ?? template.name} type="button" onClick={() => { let current: Record<string, string> = {}; try { current = JSON.parse(patternsText) as Record<string, string> } catch { /* replace invalid draft */ } setPatternsText(JSON.stringify({ ...current, auth_otp: template.name }, null, 2)); toast.success(`الگوی ${template.name} برای OTP انتخاب شد؛ حالا ذخیره کنید.`) }} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-start transition hover:border-emerald-400"><span className="flex items-center justify-between gap-3"><strong dir="ltr" className="text-emerald-900">{template.name}</strong><span className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">تأییدشده</span></span><span className="mt-2 block line-clamp-3 whitespace-pre-line text-xs leading-6 text-emerald-800">{template.smsmessage}</span><span className="mt-3 block text-xs font-black text-emerald-700">انتخاب برای OTP</span></button>)}</div></PanelCard> : null}

    {tab === 'account' ? <PanelCard title="الگوهای رویدادهای خودکار سایت" description="نام دقیق الگوی تأییدشده کاوه‌نگار را برای هر رویداد وارد کنید. ارسال‌ها از صف ضدتکرار انجام می‌شوند و حذف صفحه قدیمی لاگ به این زیرساخت آسیبی نمی‌زند."><div className="grid gap-4 md:grid-cols-2">{siteEvents.map(([key, label, tokens]) => <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><Input label={label} value={currentPatterns[key] ?? ''} onChange={(event) => updateEventPattern(key, event.target.value)} dir="ltr" list="approved-kavenegar-templates" placeholder="نام الگوی کاوه‌نگار" /><p className="mt-2 text-xs leading-6 text-slate-500"><code dir="ltr" className="me-2 rounded bg-white px-1.5 py-0.5 text-sky-700">{key}</code>{tokens}</p></div>)}</div><datalist id="approved-kavenegar-templates">{approvedTemplates.map((template) => <option key={template.id ?? template.name} value={template.name} />)}</datalist><div className="mt-5 flex flex-wrap items-center gap-3"><Button type="button" disabled={busy || !settings} onClick={() => void saveSettings()}>ذخیره نگاشت رویدادها</Button><p className="text-xs text-slate-500">برای نمایش پیشنهادها ابتدا «دریافت فهرست الگوها» را بزنید.</p></div></PanelCard> : null}

    {tab === 'send' ? <div className="grid gap-5 xl:grid-cols-2">
      <PanelCard title="ارسال پیامک حرفه‌ای" description="ارسال فوری یا زمان‌بندی‌شده با خط، تگ، جریان ارسال و رسانه">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={sendSimple}>
          <Input label="گیرنده‌ها" required value={send.receptor} onChange={(event) => setSend({ ...send, receptor: event.target.value })} placeholder="0912...,0935..." dir="ltr" />
          <Input label="خط فرستنده" value={send.sender} onChange={(event) => setSend({ ...send, sender: event.target.value })} dir="ltr" />
          <div className="md:col-span-2"><Textarea label="متن پیام" required value={send.message} onChange={(event) => setSend({ ...send, message: event.target.value })} maxLength={4000} /><p className="mt-1 text-xs text-slate-400">{send.message.length} کاراکتر؛ سقف خطوط داخلی ۴۰۰۰ و سایر خطوط ۱۸۰۰ کاراکتر</p></div>
          <DateTimeField label="زمان ارسال (شمسی)" value={send.date || null} onChange={(iso) => setSend({ ...send, date: iso ?? '' })} />
          <Select label="نوع نمایش" value={send.type} onChange={(event) => setSend({ ...send, type: event.target.value })}><option value="1">عادی و ذخیره در گوشی</option><option value="0">Flash</option><option value="2">ذخیره در SIM</option><option value="3">ارسال به نرم‌افزار</option></Select>
          <Input label="شناسه محلی ضد تکرار" value={send.localid} onChange={(event) => setSend({ ...send, localid: event.target.value })} dir="ltr" />
          <Input label="تگ" value={send.tag} onChange={(event) => setSend({ ...send, tag: event.target.value })} dir="ltr" />
          <Input label="جریان ارسال (Policy)" value={send.policy} onChange={(event) => setSend({ ...send, policy: event.target.value })} dir="ltr" />
          <Input label="شناسه رسانه" value={send.mediaid} onChange={(event) => setSend({ ...send, mediaid: event.target.value })} dir="ltr" />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4"><input type="checkbox" checked={send.hide} onChange={(event) => setSend({ ...send, hide: event.target.checked })} /> مخفی‌کردن گیرنده در کنسول</label>
          <Button type="submit" disabled={busy}>ارسال پیامک</Button>
        </form>
      </PanelCard>
      <PanelCard title="ارسال اعتبارسنجی Lookup" description="OTP با الگوی تأییدشده و توکن‌های استاندارد کاوه‌نگار">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={sendLookup}><Input label="گیرنده" required value={lookup.receptor} onChange={(event) => setLookup({ ...lookup, receptor: event.target.value })} dir="ltr" /><Input label="نام الگو" required value={lookup.template} onChange={(event) => setLookup({ ...lookup, template: event.target.value })} dir="ltr" /><Input label="token" required value={lookup.token} onChange={(event) => setLookup({ ...lookup, token: event.target.value })} /><Input label="token2" value={lookup.token2} onChange={(event) => setLookup({ ...lookup, token2: event.target.value })} /><Input label="token3" value={lookup.token3} onChange={(event) => setLookup({ ...lookup, token3: event.target.value })} /><Input label="token10" value={lookup.token10} onChange={(event) => setLookup({ ...lookup, token10: event.target.value })} /><Input label="token20" value={lookup.token20} onChange={(event) => setLookup({ ...lookup, token20: event.target.value })} /><Select label="روش ارسال" value={lookup.type} onChange={(event) => setLookup({ ...lookup, type: event.target.value })}><option value="sms">پیامک</option><option value="call">تماس صوتی</option></Select><Button type="submit" disabled={busy}>ارسال کد</Button></form>
      </PanelCard>
      <PanelCard title="ارسال گروهی SendArray" description="هر سطر گیرنده، فرستنده و متن با سطر متناظر خود ارسال می‌شود؛ سقف هر درخواست ۲۰۰ رکورد">
        <form className="grid gap-4" onSubmit={sendBulk}><div className="grid gap-4 md:grid-cols-3"><Textarea label="گیرنده‌ها؛ هر خط یک شماره" required value={bulk.receptors} onChange={(event) => setBulk({ ...bulk, receptors: event.target.value })} dir="ltr" /><Textarea label="فرستنده‌ها؛ هر خط یک شماره" required value={bulk.senders} onChange={(event) => setBulk({ ...bulk, senders: event.target.value })} dir="ltr" /><Textarea label="متن‌ها؛ هر خط یک پیام" required value={bulk.messages} onChange={(event) => setBulk({ ...bulk, messages: event.target.value })} /></div><div className="grid gap-4 md:grid-cols-3"><DateTimeField label="زمان ارسال (شمسی)" value={bulk.date || null} onChange={(iso) => setBulk({ ...bulk, date: iso ?? '' })} /><Input label="تگ" value={bulk.tag} onChange={(event) => setBulk({ ...bulk, tag: event.target.value })} dir="ltr" /><Input label="Policy" value={bulk.policy} onChange={(event) => setBulk({ ...bulk, policy: event.target.value })} dir="ltr" /></div><Button type="submit" disabled={busy}>ارسال گروهی</Button></form>
      </PanelCard>
      <Workbench title="تماس صوتی TTS" presets={[{ operation: 'voice', label: 'ارسال تماس صوتی', sample: { receptor: '09120000000', message: 'پیام صوتی جام تبرستان', localid: '', tag: '' } }]} onComplete={completeWorkbench} />
    </div> : null}

    {tab === 'reports' ? <Workbench title="وضعیت، تحویل، گزارش و لغو" presets={reportPresets} onComplete={completeWorkbench} /> : null}
    {tab === 'inbox' ? <Workbench title="صندوق پیامک دریافتی" presets={inboxPresets} onComplete={completeWorkbench} /> : null}
    {tab === 'blocked' ? <Workbench title="مدیریت فهرست مسدود خطوط" presets={blockedPresets} onComplete={completeWorkbench} /> : null}
    {tab === 'templates' ? <div className="space-y-5"><PanelCard title="الگوهای یادآوری چرخه ثبت‌نام" description="Pattern، متغیرها، فعال/غیرفعال، تأخیر، سقف و فاصله ارسال"><div className="grid gap-3 sm:grid-cols-2">{siteEvents.filter(([key]) => key.endsWith('_reminder')).map(([key, label, variables]) => <div key={key} className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4"><p className="font-black text-slate-800">{label}</p><p className="mt-2 font-mono text-xs text-sky-700" dir="ltr">{key}</p><p className="mt-2 text-xs leading-6 text-slate-500">{variables}</p></div>)}</div><Link to="/super-admin/incomplete-registrations" className="mt-5 inline-flex rounded-xl bg-gradient-to-l from-sky-600 to-emerald-600 px-5 py-3 text-sm font-bold text-white">تنظیم Pattern و سیاست ارسال یادآوری‌ها</Link></PanelCard><Workbench title="مدیریت کامل الگوهای اعتبارسنجی" presets={templatePresets} onComplete={completeWorkbench} /></div> : null}
    {tab === 'media' ? <div className="grid gap-5 lg:grid-cols-2"><PanelCard title="آپلود رسانه" description="JPG/GIF تا ۱۰MB و MP4 تا ۲۰MB و ۶۰ ثانیه؛ ویژه خطوط پیام‌رسان داخلی"><div className="space-y-4"><input type="file" accept="image/jpeg,image/gif,video/mp4" onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)} /><Button type="button" disabled={!mediaFile || busy} onClick={() => void (async () => { if (!mediaFile) return; setBusy(true); try { setResult(await uploadKavenegarMedia(mediaFile)); toast.success('رسانه آپلود شد'); await reload() } catch (err) { setError(err instanceof Error ? err.message : 'آپلود ناموفق بود') } finally { setBusy(false) } })()}>آپلود در کاوه‌نگار</Button></div></PanelCard><Workbench title="مدیریت رسانه‌ها" presets={mediaPresets} onComplete={completeWorkbench} /></div> : null}
    {tab === 'account' && settings ? <div className="grid gap-5 xl:grid-cols-2"><PanelCard title="تنظیمات اتصال امن" description="کلید فقط سمت سرور مصرف می‌شود و در هیچ درخواست مرورگر به کاوه‌نگار قرار نمی‌گیرد"><form className="grid gap-4" onSubmit={(event) => void saveSettings(event)}><Input label="API Key کاوه‌نگار" type="password" value={settings.kavenegar_api_key ?? ''} onChange={(event) => setSettings({ ...settings, kavenegar_api_key: event.target.value })} dir="ltr" autoComplete="new-password" /><Input label="خط پیش‌فرض" value={settings.kavenegar_sender ?? ''} onChange={(event) => setSettings({ ...settings, kavenegar_sender: event.target.value })} dir="ltr" /><Select label="نوع نمایش پیش‌فرض" value={String(settings.kavenegar_default_type ?? 1)} onChange={(event) => setSettings({ ...settings, kavenegar_default_type: Number(event.target.value) })}><option value="1">عادی</option><option value="0">Flash</option><option value="2">SIM</option><option value="3">Application</option></Select><Input label="تگ پیش‌فرض" value={settings.kavenegar_default_tag ?? ''} onChange={(event) => setSettings({ ...settings, kavenegar_default_tag: event.target.value })} dir="ltr" /><Input label="Policy پیش‌فرض" value={settings.kavenegar_default_policy ?? ''} onChange={(event) => setSettings({ ...settings, kavenegar_default_policy: event.target.value })} dir="ltr" /><Textarea label="نگاشت رویدادهای سایت به نام الگو (JSON)" value={patternsText} onChange={(event) => setPatternsText(event.target.value)} dir="ltr" className="min-h-40 font-mono text-xs" placeholder={'{\n  "auth_otp": "LoginOtp",\n  "account_approved": "AccountApproved"\n}'} /><p className="rounded-xl bg-sky-50 p-3 text-xs leading-6 text-sky-800">کلیدهای متداول: auth_otp، account_approved، league_joined، results، incomplete_profile و account_issue</p><Button type="submit" disabled={busy}>ذخیره و انتخاب کاوه‌نگار</Button><Link to="/super-admin/access" className="text-sm font-bold text-sky-700 hover:underline">مشاهده همه تنظیمات ورود و سرویس‌ها ←</Link></form></PanelCard><PanelCard title="Callback وضعیت و پیام ورودی" description="این URL را در تنظیمات خط کاوه‌نگار ثبت کنید"><div className="space-y-4"><Input label="Webhook URL" readOnly value={settings.kavenegar_webhook_secret ? `${window.location.origin}/api/kavenegar/webhook/${settings.kavenegar_webhook_secret}` : 'ابتدا کلید امن بسازید'} dir="ltr" /><Button type="button" variant="secondary" onClick={() => void (async () => { const secret = await rotateKavenegarWebhookSecret(); setSettings({ ...settings, kavenegar_webhook_secret: secret }); toast.success('آدرس امن جدید ساخته شد') })()}>ساخت/تعویض کلید Callback</Button><p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">پس از تعویض کلید، URL قبلی بلافاصله نامعتبر می‌شود. برای گزارش‌های Select و Outbox نیز IP عمومی سرور Dokploy را در تنظیمات امنیتی کاوه‌نگار ثبت کنید.</p></div></PanelCard><Workbench title="اطلاعات و تنظیمات حساب کاوه‌نگار" presets={accountPresets} onComplete={completeWorkbench} /></div> : null}
    {tab === 'logs' ? <HudFrame className="p-5"><SectionLabel index="AUDIT" title="ردپای عملیات و Callbackها" hint="توکن‌ها و شماره‌ها در لاگ ممیزی ماسک می‌شوند؛ API Key هیچ‌گاه لاگ نمی‌شود." /><div className="overflow-x-auto"><table className="min-w-[900px] text-sm"><thead><tr><th>زمان</th><th>عملیات</th><th>وضعیت</th><th>کد ارائه‌دهنده</th><th>شناسه پیام</th><th>خطا/پیام</th></tr></thead><tbody>{logs.map((row) => <tr key={row.id}><td className="whitespace-nowrap">{formatAppDateTime(row.created_at, i18n.language)}</td><td className="font-mono text-xs">{row.operation}</td><td><StatusBadge status={row.status === 'success' ? 'approved' : row.status === 'failed' ? 'rejected' : 'under_review'} label={row.status} /></td><td>{row.provider_status ?? '—'}</td><td className="font-mono text-xs" dir="ltr">{row.message_ids?.join(', ') || '—'}</td><td className="max-w-xs truncate text-xs">{row.error_message || row.provider_message || '—'}</td></tr>)}</tbody></table></div></HudFrame> : null}
    {tab !== 'logs' ? <PanelCard title="پاسخ زنده کاوه‌نگار" description="پاسخ خام برای عیب‌یابی و کنترل دقیق تمام فیلدهای API"><JsonResult value={result} /></PanelCard> : null}
  </PanelPage>
}
