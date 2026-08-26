-- Operational live-chat copy and configurable unanswered-message reminder.
alter table public.site_settings
  add column if not exists chat_wait_timeout_seconds integer not null default 180,
  add column if not exists chat_wait_message_fa text not null default 'کارشناسان ما در اولین فرصت پاسخ‌گو هستند. می‌توانید منتظر بمانید یا برای پیگیری سریع‌تر با دبیرخانه تماس بگیرید.',
  add column if not exists chat_wait_message_en text not null default 'Our specialists will respond as soon as possible. You can wait here or contact the secretariat for faster assistance.';

update public.site_settings
set chat_welcome_fa = 'سؤال خود را مطرح کنید؛ کارشناسان ما پاسخ‌گوی شما هستند.',
    chat_welcome_en = 'Ask your question; our specialists are here to help.'
where id = 1 and (
  chat_welcome_fa is null or chat_welcome_fa ilike '%نام%' or chat_welcome_fa ilike '%مکالمه%'
  or chat_welcome_en is null or chat_welcome_en ilike '%name%' or chat_welcome_en ilike '%conversation%'
);

