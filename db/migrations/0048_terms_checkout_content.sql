-- Bilingual operational pages and server-enforced invoice terms acceptance.
alter table public.static_pages
  add column if not exists title_en text,
  add column if not exists body_en text,
  add column if not exists excerpt_en text;

alter table public.invoices
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function public.reset_invoice_terms_on_amount_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.amount is distinct from old.amount or new.team_id is distinct from old.team_id or new.company_id is distinct from old.company_id then
    new.terms_accepted_at:=null; new.terms_version:=null;
  end if;
  return new;
end $$;
drop trigger if exists reset_invoice_terms_on_amount_change on public.invoices;
create trigger reset_invoice_terms_on_amount_change before update of amount,team_id,company_id on public.invoices
for each row execute function public.reset_invoice_terms_on_amount_change();

insert into public.static_pages(slug,title,title_en,excerpt,excerpt_en,body,body_en)
values
('terms','قوانین و مقررات','Terms and Conditions','چارچوب استفاده از سامانه، ثبت‌نام و پرداخت در جام تبرستان','Rules governing platform use, registration and payments at Tabarestan Cup',
'<h2>حساب و اطلاعات هویتی</h2><p>مسئولیت صحت اطلاعات حساب شرکت‌کننده، تیم‌ها و افراد هر تیم بر عهده صاحب حساب است.</p><h2>ثبت‌نام مسابقه</h2><p>ثبت‌نام پس از تکمیل اطلاعات، مدارک، پرداخت و تأیید نهایی معتبر است.</p><h2>پرداخت و بازپرداخت</h2><p>مبلغ، روش پرداخت و شرایط بازپرداخت هر لیگ پیش از پرداخت نمایش داده می‌شود.</p><h2>رفتار حرفه‌ای</h2><p>شرکت‌کنندگان موظف به رعایت آیین‌نامه مسابقه، حقوق دیگران و تصمیم‌های رسمی کمیته داوری هستند.</p>',
'<h2>Account and identity</h2><p>The participant account owner is responsible for the accuracy of account, team and team-person information.</p><h2>Competition registration</h2><p>Registration becomes valid after required information, documents, payment and final review are completed.</p><h2>Payment and refunds</h2><p>Fees, payment methods and league-specific refund conditions are shown before checkout.</p><h2>Professional conduct</h2><p>Participants must follow competition rules, respect others and comply with official judging decisions.</p>'),
('registration-guide','مراحل و راهنمای ثبت‌نام','Registration Guide','راهنمای قدم‌به‌قدم ساخت حساب، تکمیل هویت، ثبت تیم و پرداخت','A step-by-step guide to account setup, identity, team registration and payment','','')
on conflict(slug) do update set title_en=excluded.title_en, excerpt_en=excluded.excerpt_en,
  body_en=case when nullif(public.static_pages.body_en,'') is null then excluded.body_en else public.static_pages.body_en end;

create or replace function public.accept_invoice_terms(p_invoice_id uuid,p_version text default '2026-08')
returns public.invoices language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_invoice from invoices where id=p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if not public.is_super_admin()
    and not exists(select 1 from company_members cm where cm.company_id=v_invoice.company_id and cm.user_id=v_uid)
    and not exists(select 1 from teams t where t.id=v_invoice.team_id and t.captain_id=v_uid)
  then raise exception 'forbidden'; end if;
  update invoices set terms_accepted_at=now(),terms_version=nullif(trim(p_version),'') where id=p_invoice_id returning * into v_invoice;
  return v_invoice;
end $$;
revoke all on function public.accept_invoice_terms(uuid,text) from public;
grant execute on function public.accept_invoice_terms(uuid,text) to authenticated;

create or replace function public.issue_mock_payment_authority(p_invoice_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_invoice invoices%rowtype; v_secret text;
begin
  if public.get_payment_mode()<>'mock' then raise exception 'not in mock mode'; end if;
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_invoice from invoices where id=p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.terms_accepted_at is null then raise exception 'terms_not_accepted'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=v_invoice.company_id and cm.user_id=v_uid) and not exists(select 1 from teams t where t.id=v_invoice.team_id and t.captain_id=v_uid) then raise exception 'forbidden'; end if;
  select value into v_secret from payment_config where key='mock_secret';
  return 'MOCK-'||encode(digest(p_invoice_id::text||':'||coalesce(v_secret,''),'sha256'),'hex');
end $$;
revoke all on function public.issue_mock_payment_authority(uuid) from public;
grant execute on function public.issue_mock_payment_authority(uuid) to authenticated;

create or replace function public.submit_card_receipt(p_invoice_id uuid,p_receipt_path text)
returns invoices language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select card_to_card_enabled from auth_settings where id=1),false) then raise exception 'card_to_card_disabled'; end if;
  select * into v_invoice from invoices where id=p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.terms_accepted_at is null then raise exception 'terms_not_accepted'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=v_invoice.company_id and cm.user_id=v_uid) and not exists(select 1 from teams t where t.id=v_invoice.team_id and t.captain_id=v_uid) then raise exception 'forbidden'; end if;
  update invoices set payment_method='card_to_card',receipt_path=p_receipt_path,receipt_status='pending_review',receipt_rejection_reason=null,receipt_submitted_at=now(),receipt_reviewed_at=null,receipt_reviewed_by=null,status='pending' where id=p_invoice_id returning * into v_invoice;
  return v_invoice;
end $$;
revoke all on function public.submit_card_receipt(uuid,text) from public;
grant execute on function public.submit_card_receipt(uuid,text) to authenticated;

-- Legacy compatibility: teams are owned by the participant Account. A person's
-- phone must never resolve to a second CRM Account merely because they captain a team.
create or replace function public.resolve_team_captain(p_company_id uuid,p_phone text,p_full_name_hint text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=p_company_id and cm.user_id=v_uid and cm.is_owner=true) then raise exception 'not company owner'; end if;
  return v_uid;
end $$;
revoke all on function public.resolve_team_captain(uuid,text,text) from public;
grant execute on function public.resolve_team_captain(uuid,text,text) to authenticated;
