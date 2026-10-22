export function chatErrorMessage(code: string, language: string): string {
  const en = language.startsWith('en')
  switch (code) {
    case 'invalid_chat_identity':
    case 'invalid_phone': return en ? 'Enter your name and a valid 11-digit Iranian mobile number.' : 'نام و شماره موبایل معتبر ۱۱ رقمی وارد کنید.'
    case 'session_not_found': return en ? 'This conversation has ended. Please start a new conversation.' : 'این گفت‌وگو پایان یافته است؛ لطفاً گفت‌وگوی جدیدی شروع کنید.'
    case 'empty_body': return en ? 'Enter a message.' : 'متن پیام را وارد کنید.'
    case 'message_too_long': return en ? 'Messages may contain up to 5,000 characters.' : 'متن پیام حداکثر می‌تواند ۵۰۰۰ نویسه باشد.'
    case 'too_many_attempts':
    case 'rate_limited': return en ? 'Please wait a minute before trying again.' : 'لطفاً کمی صبر کنید و دوباره تلاش کنید.'
    default: return en ? 'Could not connect to support. Please try again.' : 'ارتباط با پشتیبانی برقرار نشد؛ دوباره تلاش کنید.'
  }
}
