alter table public.site_settings add column if not exists onboarding_guidance jsonb not null default '{
  "profile": {"enabled":true,"title_fa":"پروفایل شما کامل شد!","title_en":"Your profile is complete!","body_fa":"تبریک! اطلاعات هویتی شما با موفقیت تکمیل و ذخیره شد. در گام بعد، نام مجموعه، مدرسه، دانشگاه یا حامی تیم خود را ثبت کنید. اگر مستقل شرکت می‌کنید، نام خودتان را وارد کنید و نوع مجموعه را «شخص حقیقی» انتخاب کنید. سپس می‌توانید تیم خود را در لیگ دلخواه ثبت‌نام کنید.","body_en":"Your identity information has been saved. Next, create your organization, school, university or team sponsor profile. Independent participants can use their own name and select Individual. Then register your team in a league."},
  "organization": {"enabled":true,"title_fa":"یک گام نزدیک‌تر به مسابقات!","title_en":"Ready to explore competitions!","body_fa":"اطلاعات مجموعه شما ذخیره شد. اکنون لیگ مناسب را انتخاب کنید، شرایط و آیین‌نامه آن را بخوانید و با افزودن تیم و اعضا، ثبت‌نام را ادامه دهید. ثبت‌نام نهایی پس از تکمیل مراحل و پرداخت تأیید می‌شود.","body_en":"Your organization has been saved. Choose a league, review its requirements and rules, then add your team and members. Final registration is confirmed after completing the required steps and payment."},
  "company_form": {"enabled":true,"title_fa":"معرفی مجموعه یا حامی تیم","title_en":"Introduce your organization or team sponsor","body_fa":"نام مجموعه یا حامی تیم را وارد کنید و نوع آن را انتخاب کنید. برای شرکت مستقل، نام خودتان و نوع «شخص حقیقی» کافی است. فیلدهای ستاره‌دار الزامی‌اند؛ وب‌سایت، سال تأسیس، معرفی و تصاویر اختیاری هستند. پس از ذخیره، می‌توانید برای همین مجموعه چند تیم در لیگ‌ها ثبت کنید.","body_en":"Enter your organization or sponsor name and select its type. Independent participants can use their own name and select Individual. Starred fields are required; website, founding year, description and images are optional. Save to register your teams."},
  "leagues": {"enabled":true,"title_fa":"مسیر کوتاه ثبت‌نام در مسابقات","title_en":"Your path to competition registration","body_fa":"وارد حساب شوید، پروفایل هویتی و اطلاعات مجموعه را تکمیل کنید، سپس لیگ دلخواه را انتخاب کنید. پس از مطالعه آیین‌نامه، تیم و اعضا را اضافه کرده و مراحل بررسی و پرداخت را تا تأیید نهایی ادامه دهید.","body_en":"Sign in, complete your identity and organization profiles, then choose a league. Read the rules, add your team and members, and complete review and payment for final confirmation."}
}'::jsonb;

create table if not exists app_private.onboarding_notice_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice text not null check (notice in ('profile','organization')),
  shown_at timestamptz not null default now(),
  primary key (user_id, notice)
);
revoke all on app_private.onboarding_notice_receipts from public, anon, authenticated;

-- Existing completed accounts must not receive first-completion messages.
insert into app_private.onboarding_notice_receipts(user_id,notice)
select id,'profile' from public.profiles where identity_completed_at is not null
on conflict do nothing;
insert into app_private.onboarding_notice_receipts(user_id,notice)
select distinct cm.user_id,'organization' from public.company_members cm
on conflict do nothing;

-- Final review may only be reached after the signup identity fields were saved.
create or replace function public.guard_signup_identity_completion()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.signup_completed_at is not null and new.signup_completed_at is distinct from old.signup_completed_at then
    if nullif(trim(new.first_name_fa),'') is null or nullif(trim(new.last_name_fa),'') is null
      or nullif(trim(new.first_name_en),'') is null or nullif(trim(new.last_name_en),'') is null
      or nullif(trim(new.email),'') is null or new.birth_date is null
      or nullif(trim(new.postal_code),'') is null or nullif(trim(new.address),'') is null
      or new.account_type is null
      or (new.account_type='individual' and nullif(trim(new.national_id),'') is null)
      or (new.account_type='legal' and (nullif(trim(new.company_name),'') is null
        or nullif(trim(new.company_national_id),'') is null or nullif(trim(new.legal_representative_national_id),'') is null))
    then raise exception 'signup_identity_required'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_signup_identity_completion on public.profiles;
create trigger guard_signup_identity_completion before update of signup_completed_at on public.profiles
for each row execute function public.guard_signup_identity_completion();
