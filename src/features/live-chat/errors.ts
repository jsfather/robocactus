export function chatErrorMessage(code: string, language: string): string {
  const en = language.startsWith('en')
  switch (code) {
    case 'invalid_chat_upload': return en ? 'Choose one file up to 5 MB.' : 'یک فایل با حجم حداکثر ۵ مگابایت انتخاب کنید.'
    case 'invalid_file_content': return en ? 'The file type or content is not supported. Use PDF, JPEG, PNG or a recorded voice.' : 'نوع یا محتوای فایل معتبر نیست؛ PDF، JPEG، PNG یا ویس ضبط‌شده ارسال کنید.'
    case 'invalid_message_body': return en ? 'Enter a message (up to 5,000 characters) or attach a file.' : 'متن حداکثر ۵۰۰۰ نویسه وارد کنید یا یک فایل پیوست کنید.'
    case 'chat_storage_limit': return en ? 'This conversation has reached its 50 MB attachment limit.' : 'حجم پیوست‌های این گفت‌وگو به سقف ۵۰ مگابایت رسیده است.'
    case 'chat_closed': return en ? 'This conversation has ended. Start a new conversation.' : 'این گفت‌وگو پایان یافته است؛ گفت‌وگوی جدیدی شروع کنید.'
    case 'forbidden': return en ? 'You do not have permission for this action.' : 'برای انجام این عملیات دسترسی ندارید.'
    case 'chat_busy': return en ? 'Uploads are temporarily busy. Try again shortly.' : 'سرویس بارگذاری موقتاً شلوغ است؛ کمی بعد دوباره تلاش کنید.'
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
