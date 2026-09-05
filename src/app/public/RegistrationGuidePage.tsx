import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const stepsFa = [
  ['ورود یا ساخت حساب', 'شماره موبایل را وارد کنید و کد یک‌بارمصرف شش‌رقمی را تأیید کنید. شماره جدید به مسیر ثبت‌نام هدایت می‌شود.'],
  ['انتخاب نوع شرکت‌کننده', 'مشخص کنید صاحب حساب شخص حقیقی است یا شخص حقوقی. این انتخاب مربوط به Account اصلی است.'],
  ['تکمیل هویت', 'اطلاعات فارسی و انگلیسی، نشانی، اطلاعات تماس و مشخصات هویتی یا ثبتی را کامل کنید.'],
  ['احراز و مدارک حساب', 'موبایل را تأیید و مدارک الزامی مانند کارت ملی یا روزنامه رسمی و مدرک نماینده را بارگذاری کنید.'],
  ['انتخاب لیگ', 'از میان لیگ‌های فعال و دارای ثبت‌نام باز، مسابقه مناسب را انتخاب کنید.'],
  ['ساخت تیم و افراد آن', 'نام و شعار تیم را ثبت کنید؛ سپس سرپرست، مربی و اعضا را به‌عنوان Team People وارد کنید. این افراد حساب CRM مستقل نمی‌گیرند.'],
  ['بازبینی اطلاعات', 'اعضا و تصاویر مدارک مرتبط با هر فرد را یک‌بار کنترل کنید و در صورت نیاز به مرحله قبل برگردید.'],
  ['ارسال اطلاعات فنی و بررسی کمیته', 'مقاله و فیلم ربات را مطابق شرایط لیگ ارسال کنید. فقط عضو یا مدرک ردشده برای اصلاح باز می‌شود.'],
  ['پذیرش قوانین و پرداخت', 'پس از تأیید فنی، قوانین لیگ را بپذیرید، پیش‌فاکتور را ببینید و پرداخت آنلاین یا کارت‌به‌کارت را انجام دهید.'],
  ['صدور مجوز حضور', 'پس از تأیید پرداخت، مجوز حضور همراه با زمان و محل مسابقه صادر و از پرونده تیم قابل مشاهده است.'],
]
const stepsEn = [
  ['Sign in or create an account', 'Enter your mobile number and verify the six-digit OTP. New numbers continue to registration.'],
  ['Choose participant type', 'Identify the account owner as an individual or legal entity.'],
  ['Complete identity', 'Provide bilingual identity, address and contact or legal-entity details.'],
  ['Verification and documents', 'Verify the phone and upload required identity or corporate documents.'],
  ['Choose a league', 'Select an active league whose registration window is open.'],
  ['Create the team and its people', 'Add team details, captain, coaches and members. Team People do not receive separate CRM accounts.'],
  ['Review submitted information', 'Review every team member and the documents attached to that person before submission.'],
  ['Technical submission and review', 'Submit the robot paper and video. Only rejected members or files are reopened for correction.'],
  ['Accept terms and pay', 'After technical approval, accept the league rules, review the proforma and pay online or by bank transfer.'],
  ['Attendance clearance', 'After payment confirmation, the attendance clearance is issued with the competition time and venue.'],
]

export function RegistrationGuidePage() {
  const { i18n } = useTranslation(); const en = i18n.language.startsWith('en'); const steps = en ? stepsEn : stepsFa
  return <div className="pb-20"><section className="bg-gradient-to-br from-[#063d59] via-[#087eb8] to-[#087a58] px-4 pb-24 pt-32 text-white"><div className="mx-auto max-w-5xl"><p className="text-xs font-black tracking-[.2em] text-cyan-200">REGISTRATION ROADMAP</p><h1 className="mt-3 text-4xl font-black sm:text-6xl">{en ? 'Registration guide' : 'مراحل و راهنمای ثبت‌نام'}</h1><p className="mt-5 max-w-3xl text-base leading-8 text-white/75">{en ? 'A clear path from account verification to confirmed league membership.' : 'مسیر واقعی سامانه از تأیید حساب شرکت‌کننده تا عضویت قطعی تیم در لیگ.'}</p></div></section><main className="mx-auto -mt-12 max-w-5xl px-4"><div className="rounded-[2rem] border border-sky-100 bg-white p-5 shadow-[0_25px_80px_rgb(7_59_85/0.13)] sm:p-8"><div className="space-y-3">{steps.map(([title, body], index) => <article key={title} className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-[56px_1fr] sm:p-5"><span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-600 to-emerald-600 font-black text-white shadow-lg">{String(index + 1).padStart(2, '0')}</span><div><h2 className="font-black text-slate-900">{title}</h2><p className="mt-2 text-sm leading-7 text-slate-500">{body}</p></div></article>)}</div><aside className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">{en ? 'Important: the participant account owns multiple teams. Captains, coaches and members are people inside each team—not separate CRM users.' : 'نکته مهم: یک حساب شرکت‌کننده می‌تواند چند تیم داشته باشد. سرپرست، مربی و اعضا افراد داخل هر تیم هستند و حساب مستقل CRM محسوب نمی‌شوند.'}</aside><div className="mt-7 flex flex-wrap gap-3"><Link to="/login" className="rounded-2xl bg-gradient-to-l from-sky-600 to-emerald-600 px-6 py-3 text-sm font-black text-white">{en ? 'Start registration' : 'شروع ثبت‌نام'}</Link><Link to="/terms" className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-black text-slate-600">{en ? 'Read terms' : 'مطالعه قوانین'}</Link></div></div></main></div>
}
