-- Homepage sections: sponsors, events, partners, why cards, FAQs, display stats

create table if not exists home_sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text not null,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_events (
  id uuid primary key default gen_random_uuid(),
  title_fa text not null,
  title_en text not null,
  description_fa text,
  description_en text,
  event_date date not null,
  end_date date,
  location_fa text,
  location_en text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_partners (
  id uuid primary key default gen_random_uuid(),
  name_fa text not null,
  name_en text not null,
  logo_url text,
  link_url text,
  kind text not null default 'university'
    check (kind in ('university', 'scientific', 'organization')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_why_cards (
  id uuid primary key default gen_random_uuid(),
  title_fa text not null,
  title_en text not null,
  body_fa text,
  body_en text,
  icon_key text not null default 'star',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_faqs (
  id uuid primary key default gen_random_uuid(),
  question_fa text not null,
  question_en text not null,
  answer_fa text not null,
  answer_en text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_stat_cards (
  id uuid primary key default gen_random_uuid(),
  label_fa text not null,
  label_en text not null,
  value_num int not null default 0,
  suffix text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table home_sponsors enable row level security;
alter table home_events enable row level security;
alter table home_partners enable row level security;
alter table home_why_cards enable row level security;
alter table home_faqs enable row level security;
alter table home_stat_cards enable row level security;

drop policy if exists "home_sponsors_public" on home_sponsors;
create policy "home_sponsors_public" on home_sponsors for select using (is_active = true);
drop policy if exists "home_sponsors_sa" on home_sponsors;
create policy "home_sponsors_sa" on home_sponsors for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_events_public" on home_events;
create policy "home_events_public" on home_events for select using (is_active = true);
drop policy if exists "home_events_sa" on home_events;
create policy "home_events_sa" on home_events for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_partners_public" on home_partners;
create policy "home_partners_public" on home_partners for select using (is_active = true);
drop policy if exists "home_partners_sa" on home_partners;
create policy "home_partners_sa" on home_partners for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_why_public" on home_why_cards;
create policy "home_why_public" on home_why_cards for select using (is_active = true);
drop policy if exists "home_why_sa" on home_why_cards;
create policy "home_why_sa" on home_why_cards for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_faqs_public" on home_faqs;
create policy "home_faqs_public" on home_faqs for select using (is_active = true);
drop policy if exists "home_faqs_sa" on home_faqs;
create policy "home_faqs_sa" on home_faqs for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_stats_public" on home_stat_cards;
create policy "home_stats_public" on home_stat_cards for select using (is_active = true);
drop policy if exists "home_stats_sa" on home_stat_cards;
create policy "home_stats_sa" on home_stat_cards for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Seed defaults (idempotent by label)
insert into home_stat_cards (label_fa, label_en, value_num, sort_order)
select * from (values
  ('لیگ', 'Leagues', 35, 1),
  ('شرکت‌کننده', 'Participants', 4500, 2),
  ('تیم', 'Teams', 600, 3),
  ('دانشگاه', 'Universities', 40, 4),
  ('استان', 'Provinces', 15, 5),
  ('داور', 'Judges', 20, 6)
) as v(label_fa, label_en, value_num, sort_order)
where not exists (select 1 from home_stat_cards limit 1);

insert into home_why_cards (title_fa, title_en, body_fa, body_en, icon_key, sort_order)
select * from (values
  ('استاندارد بین‌المللی', 'International standard', 'قوانین و داوری هم‌تراز رویدادهای جهانی رباتیک.', 'Rules and judging aligned with global robotics events.', 'globe', 1),
  ('داوری تخصصی', 'Specialized judging', 'کمیته فنی و مسیر داوری هر لیگ به‌صورت جداگانه.', 'Dedicated technical committees and judging paths per league.', 'judge', 2),
  ('گواهینامه معتبر', 'Valid certificates', 'گواهی و تقدیرنامه‌های قابل استناد برای تیم‌ها.', 'Recognized certificates for teams and participants.', 'certificate', 3),
  ('جوایز', 'Awards', 'جوایز نقدی و غیرنقدی در سطوح مختلف مسابقات.', 'Cash and non-cash awards across competition tiers.', 'trophy', 4),
  ('شبکه‌سازی', 'Networking', 'ارتباط با تیم‌ها، شرکت‌ها و متخصصان صنعت.', 'Connect with teams, companies, and industry experts.', 'network', 5),
  ('فرصت جذب سرمایه', 'Investment opportunities', 'معرفی تیم‌های برتر به سرمایه‌گذاران و شتاب‌دهنده‌ها.', 'Showcase top teams to investors and accelerators.', 'rocket', 6)
) as v(title_fa, title_en, body_fa, body_en, icon_key, sort_order)
where not exists (select 1 from home_why_cards limit 1);

insert into home_faqs (question_fa, question_en, answer_fa, answer_en, sort_order)
select * from (values
  ('چطور در لیگ ثبت‌نام کنم؟', 'How do I register for a league?', 'از پنل شرکت، تیم بسازید، مدارک را بارگذاری کنید و هزینه را پرداخت کنید.', 'From the company panel, create a team, upload documents, and pay the fee.', 1),
  ('چه کسانی می‌توانند شرکت کنند؟', 'Who can participate?', 'تیم‌های دانشگاهی، مدرسه‌ای و آزاد مطابق قوانین هر لیگ.', 'University, school, and open teams per each league’s rules.', 2),
  ('نتایج چطور اعلام می‌شود؟', 'How are results published?', 'پس از داوری، نتایج در صفحه رتبه‌بندی و اعلان‌ها منتشر می‌شود.', 'After judging, results appear on rankings and announcements.', 3)
) as v(question_fa, question_en, answer_fa, answer_en, sort_order)
where not exists (select 1 from home_faqs limit 1);

insert into home_events (title_fa, title_en, description_fa, description_en, event_date, location_fa, location_en, sort_order)
select * from (values
  ('آغاز ثبت‌نام لیگ‌ها', 'League registration opens', 'شروع دوره ثبت‌نام رسمی مسابقات.', 'Official registration period begins.', current_date + 7, 'آنلاین', 'Online', 1),
  ('کارگاه فنی رباتیک', 'Robotics tech workshop', 'جلسه آموزشی برای تیم‌ها و مربیان.', 'Training session for teams and coaches.', current_date + 21, 'تهران', 'Tehran', 2),
  ('روز مسابقه نهایی', 'Finals day', 'برگزاری فینال لیگ‌های منتخب.', 'Finals for selected leagues.', current_date + 60, 'تهران', 'Tehran', 3)
) as v(title_fa, title_en, description_fa, description_en, event_date, location_fa, location_en, sort_order)
where not exists (select 1 from home_events limit 1);

insert into home_partners (name_fa, name_en, kind, sort_order)
select * from (values
  ('دانشگاه تهران', 'University of Tehran', 'university', 1),
  ('دانشگاه صنعتی شریف', 'Sharif University of Technology', 'university', 2),
  ('انجمن رباتیک ایران', 'Iran Robotics Society', 'scientific', 3),
  ('پارک علم و فناوری', 'Science & Technology Park', 'organization', 4)
) as v(name_fa, name_en, kind, sort_order)
where not exists (select 1 from home_partners limit 1);

insert into home_sponsors (name, logo_url, sort_order)
select * from (values
  ('Sponsor A', 'https://placehold.co/160x64/0f172a/38bdf8?text=Sponsor+A', 1),
  ('Sponsor B', 'https://placehold.co/160x64/0f172a/fb923c?text=Sponsor+B', 2),
  ('Sponsor C', 'https://placehold.co/160x64/0f172a/38bdf8?text=Sponsor+C', 3),
  ('Sponsor D', 'https://placehold.co/160x64/0f172a/fb923c?text=Sponsor+D', 4),
  ('Sponsor E', 'https://placehold.co/160x64/0f172a/38bdf8?text=Sponsor+E', 5),
  ('Sponsor F', 'https://placehold.co/160x64/0f172a/fb923c?text=Sponsor+F', 6)
) as v(name, logo_url, sort_order)
where not exists (select 1 from home_sponsors limit 1);
