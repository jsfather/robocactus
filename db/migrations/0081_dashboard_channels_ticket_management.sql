alter table public.site_settings
  add column if not exists communication_channels jsonb not null default '[
    {"id":"telegram","label_fa":"تلگرام","label_en":"Telegram","icon":"telegram","url":"","enabled":true},
    {"id":"instagram","label_fa":"اینستاگرام","label_en":"Instagram","icon":"instagram","url":"","enabled":true},
    {"id":"rubika","label_fa":"روبیکا","label_en":"Rubika","icon":"message","url":"","enabled":true},
    {"id":"bale","label_fa":"پیام‌رسان بله","label_en":"Bale Messenger","icon":"message","url":"","enabled":true}
  ]'::jsonb;

update public.site_settings set communication_channels=jsonb_build_array(
  jsonb_build_object('id','telegram','label_fa','تلگرام','label_en','Telegram','icon','telegram','url',coalesce(telegram_url,''),'enabled',true),
  jsonb_build_object('id','instagram','label_fa','اینستاگرام','label_en','Instagram','icon','instagram','url',coalesce(instagram_url,''),'enabled',true),
  jsonb_build_object('id','rubika','label_fa','روبیکا','label_en','Rubika','icon','rubika','url','','enabled',true),
  jsonb_build_object('id','bale','label_fa','پیام‌رسان بله','label_en','Bale Messenger','icon','bale','url','','enabled',true)
);

alter table public.ticket_messages
  add column if not exists sender_name text,
  add column if not exists sender_role text;

update public.ticket_messages m set
  sender_name=coalesce(m.sender_name,p.full_name),
  sender_role=coalesce(m.sender_role,case
    when p.role='super_admin' then 'مدیریت'
    when p.role='league_admin' then 'داور یا مسئول لیگ'
    when p.role='staff' then case p.staff_department when 'support' then 'کارشناس پشتیبانی' when 'finance' then 'کارشناس مالی' when 'operations' then 'کارشناس اجرایی' when 'judge' then 'داور' else 'کارشناس پشتیبانی' end
    else 'شرکت‌کننده' end)
from public.profiles p where p.id=m.sender_id and (m.sender_name is null or m.sender_role is null);

create or replace function public.snapshot_ticket_message_author()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles where id=new.sender_id;
  new.sender_name:=coalesce(nullif(new.sender_name,''),p.full_name,'کاربر سامانه');
  new.sender_role:=coalesce(nullif(new.sender_role,''),case
    when p.role='super_admin' then 'مدیریت'
    when p.role='league_admin' then 'داور یا مسئول لیگ'
    when p.role='staff' then case p.staff_department when 'support' then 'کارشناس پشتیبانی' when 'finance' then 'کارشناس مالی' when 'operations' then 'کارشناس اجرایی' when 'judge' then 'داور' else 'کارشناس پشتیبانی' end
    else 'شرکت‌کننده' end);
  return new;
end $$;
drop trigger if exists snapshot_ticket_message_author on public.ticket_messages;
create trigger snapshot_ticket_message_author before insert on public.ticket_messages
for each row execute function public.snapshot_ticket_message_author();

create or replace function public.manage_ticket(p_ticket_id uuid,p_action text,p_status ticket_status default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_ticket public.tickets%rowtype; v_allowed boolean:=false;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_ticket from public.tickets where id=p_ticket_id for update;
  if not found then raise exception 'ticket_not_found'; end if;
  v_allowed:=public.is_super_admin()
    or (public.has_panel_permission('tickets') and (
      public.current_user_role()='staff'
      or v_ticket.assigned_to=auth.uid()
      or exists(select 1 from public.league_admins la where la.league_id=v_ticket.league_id and la.user_id=auth.uid())
    ));
  if not v_allowed then raise exception 'forbidden'; end if;
  if p_action='status' then
    if p_status is null then raise exception 'ticket_status_required'; end if;
    update public.tickets set status=p_status where id=p_ticket_id;
  elsif p_action='delete' then
    delete from public.tickets where id=p_ticket_id;
  else
    raise exception 'invalid_ticket_action';
  end if;
end $$;
revoke all on function public.snapshot_ticket_message_author(),public.manage_ticket(uuid,text,ticket_status) from public;
grant execute on function public.manage_ticket(uuid,text,ticket_status) to authenticated;
