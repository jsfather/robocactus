export function paymentRequestError(error: string | undefined, code?: number | null): string {
  const messages: Record<string, string> = {
    zarinpal_not_configured: 'درگاه پرداخت هنوز پیکربندی نشده است؛ لطفاً با پشتیبانی تماس بگیرید.',
    zarinpal_provider_not_enabled: 'تنظیمات درگاه تغییر کرده است؛ صفحه را تازه‌سازی کنید و دوباره تلاش کنید.',
    zarinpal_timeout: 'پاسخ درگاه بیش از حد زمان برد؛ کمی بعد دوباره تلاش کنید.',
    zarinpal_unreachable: 'ارتباط سرور با زرین‌پال برقرار نشد؛ کمی بعد دوباره تلاش کنید.',
    invalid_payment_amount: 'مبلغ صورتحساب برای ارسال به درگاه معتبر نیست؛ با پشتیبانی تماس بگیرید.',
    terms_not_accepted: 'ابتدا قوانین و مقررات صورتحساب را بپذیرید.',
    payment_deadline_passed: 'مهلت پرداخت این لیگ پایان یافته است.',
    registration_archived: 'این ثبت‌نام بایگانی شده و قابل پرداخت نیست.',
    online_payment_disabled: 'پرداخت اینترنتی در حال حاضر غیرفعال است.',
    payment_under_financial_review: 'پرداخت قبلی در حال بررسی مالی است؛ نیازی به پرداخت دوباره نیست.',
    payable_invoice_not_found: 'صورتحساب قابل پرداخت یافت نشد؛ صفحه را تازه‌سازی کنید.',
    authentication_required: 'برای پرداخت دوباره وارد حساب خود شوید.',
  }
  if (error === 'zarinpal_request_failed') {
    return `زرین‌پال درخواست پرداخت را نپذیرفت${typeof code === 'number' ? ` (کد ${code})` : ''}؛ لطفاً کد خطا را به پشتیبانی اطلاع دهید تا تنظیمات پذیرنده و دامنه بررسی شود.`
  }
  return messages[error ?? ''] ?? 'شروع پرداخت انجام نشد؛ کمی بعد دوباره تلاش کنید.'
}
