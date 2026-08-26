-- Replace the legacy league catalog with the approved national competition list.
-- Existing teams/results/content tied to removed leagues are intentionally deleted.
do $$
declare
  sample_league_id uuid;
  league_ids uuid[];
  team_ids uuid[];
  fk record;
begin
  -- Keep exactly one legacy league as an inactive/editable panel draft sample.
  select id into sample_league_id from public.leagues order by created_at, id limit 1;
  if sample_league_id is not null then
    update public.leagues
    set is_active = false,
        period_override = 'upcoming',
        name = case when name like 'نمونه پیش‌نویس — %' then name else 'نمونه پیش‌نویس — ' || name end
    where id = sample_league_id;
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into league_ids
  from public.leagues where id is distinct from sample_league_id;
  select coalesce(array_agg(id), array[]::uuid[]) into team_ids from public.teams where league_id = any(league_ids);

  for fk in
    select ns.nspname schema_name, cl.relname table_name, att.attname column_name
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'public.teams'::regclass and cardinality(con.conkey) = 1
  loop
    execute format('delete from %I.%I where %I = any($1)', fk.schema_name, fk.table_name, fk.column_name) using team_ids;
  end loop;

  delete from public.teams where id = any(team_ids);

  for fk in
    select ns.nspname schema_name, cl.relname table_name, att.attname column_name
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'public.leagues'::regclass
      and cardinality(con.conkey) = 1 and cl.relname <> 'teams'
  loop
    execute format('delete from %I.%I where %I = any($1)', fk.schema_name, fk.table_name, fk.column_name) using league_ids;
  end loop;

  delete from public.leagues where id = any(league_ids);
end $$;

insert into public.leagues (
  name, slug, description, short_description, full_description, category, age_range,
  capacity, registration_fee, registration_open_at, registration_close_at,
  event_starts_at, event_ends_at, participation_mode, team_size_min, team_size_max,
  cover_image_url, hero_image_url, venue_name, difficulty_level, competition_language,
  rules_summary, scoring_rows, timeline_steps, is_active, period_override
)
values
('لیگ ناجی داخل سالن زیر ۱۴ سال','indoor-rescue-u14','رقابت ربات‌های امدادگر خودران در زمین ماز و سناریوهای جست‌وجو و نجات داخل سالن.','مسیریابی، تشخیص مصدوم و اجرای عملیات نجات برای تیم‌های زیر ۱۴ سال.','تیم‌ها باید رباتی خودران طراحی کنند که در یک زمین استاندارد داخل سالن، مسیر را پیمایش کرده، علائم مصدوم را تشخیص دهد و مأموریت نجات را با بیشترین دقت انجام دهد.','امداد و نجات','زیر ۱۴ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',1,3,'/images/leagues/indoor-rescue-cover.png','/images/leagues/indoor-rescue-hero.png','سالن مسابقات جام تبرستان','مقدماتی تا متوسط','فارسی', 'ابعاد زمین ۴×۴ متر و کنترل داوری مطابق آیین‌نامه رسمی لیگ است.','[{"label":"تکمیل مأموریت","points":60},{"label":"دقت تشخیص","points":25},{"label":"زمان اجرا","points":15}]','[{"title":"پذیرش فنی"},{"title":"مرحله مقدماتی"},{"title":"مرحله نهایی"}]',true,'open'),
('لیگ ناجی فضای باز آزاد','outdoor-rescue-open','رقابت ربات‌های امدادگر مقاوم برای عبور از موانع و سناریوهای عملیات در فضای باز.','عملیات امداد و نجات رباتیک در زمین ۵۰ متری فضای باز.','این لیگ توان حرکتی، پایداری، کنترل و سامانه دید ربات‌های امدادگر را در محیط‌های ناهموار و مأموریت‌های نزدیک به شرایط واقعی ارزیابی می‌کند.','امداد و نجات','آزاد',100,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,4,'/images/leagues/outdoor-rescue-cover.png','/images/leagues/outdoor-rescue-hero.png','محوطه مسابقات جام تبرستان','پیشرفته','فارسی / انگلیسی','زمین مسابقه فضای باز با مسیر ناهموار و طول تقریبی ۵۰ متر است.','[{"label":"عبور از موانع","points":40},{"label":"تکمیل مأموریت","points":40},{"label":"زمان اجرا","points":20}]','[{"title":"بازرسی ایمنی"},{"title":"تست مسیر"},{"title":"فینال عملیات"}]',true,'open'),
('لیگ Space Race آزاد','space-race-open','مسابقه سرعت و هدایت ربات‌های خودران در پیست فضایی و مسیرهای فنی.','رقابت سرعت رباتیک در پیست استاندارد ۲۰۰ متری.','ربات‌های خودران در پیستی با الهام از مأموریت‌های فضایی، بر اساس سرعت، دقت مسیریابی و پایداری فنی رقابت می‌کنند.','Space Race','آزاد',250,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,4,'/images/leagues/space-race-cover.png','/images/leagues/space-race-hero.png','پیست مسابقات جام تبرستان','پیشرفته','فارسی / انگلیسی','پیست مسابقه حدود ۲۰۰ متر و کنترل ربات در بخش اصلی خودران است.','[{"label":"بهترین زمان","points":60},{"label":"دقت مسیر","points":25},{"label":"پایداری فنی","points":15}]','[{"title":"تأیید فنی"},{"title":"تایم‌تریال"},{"title":"مسابقه نهایی"}]',true,'open'),
('لیگ آتش‌نشان آزاد','firefighter-open','رقابت شناسایی و مهار حریق توسط ربات‌های آتش‌نشان در زمین چندطبقه.','شناسایی منبع حریق و اجرای عملیات اطفا در زمین استاندارد.','ربات‌ها باید در زمینی چندبخشی حرکت کنند، منبع حریق را تشخیص دهند و با رعایت کامل الزامات ایمنی عملیات اطفا را انجام دهند.','آتش‌نشان','آزاد',50,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,5,'/images/leagues/firefighter-cover.png','/images/leagues/firefighter-hero.png','سالن مسابقات جام تبرستان','پیشرفته','فارسی','زمین سه‌طبقه با سازه MDF و ورق، مطابق آیین‌نامه ایمنی مسابقه آماده می‌شود.','[{"label":"تشخیص حریق","points":30},{"label":"اطفای موفق","points":50},{"label":"زمان اجرا","points":20}]','[{"title":"کنترل ایمنی"},{"title":"مقدماتی"},{"title":"فینال اطفا"}]',true,'open'),
('لیگ ربات‌های صنعتی دانش‌آموزی زیر ۱۹ سال','industrial-student-u19','چالش طراحی و برنامه‌ریزی ربات صنعتی برای اجرای مأموریت‌های تولید هوشمند.','رقابت صنعتی ویژه دانش‌آموزان زیر ۱۹ سال.','تیم‌ها در یک سلول تولید کوچک، مأموریت‌هایی مانند جابه‌جایی، دسته‌بندی و مونتاژ قطعات را با ربات صنعتی اجرا می‌کنند.','ربات صنعتی','زیر ۱۹ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',1,3,'/images/leagues/industrial-student-cover.png','/images/leagues/industrial-student-hero.png','سالن فناوری جام تبرستان','متوسط','فارسی','کنسول داوری، میز ربات صنعتی و فضای استاندارد ۱۶ مترمربع برای هر تیم در نظر گرفته می‌شود.','[{"label":"دقت عملیات","points":45},{"label":"زمان چرخه","points":30},{"label":"ایمنی و طراحی","points":25}]','[{"title":"ارائه طراحی"},{"title":"آزمون عملکرد"},{"title":"مرحله نهایی"}]',true,'open'),
('لیگ ربات‌های صنعتی دانشگاهی آزاد','industrial-university-open','رقابت پیشرفته اتوماسیون، بازوی رباتیک و ربات‌های متحرک صنعتی.','چالش صنعتی آزاد برای تیم‌های دانشگاهی.','تیم‌های دانشگاهی راهکار کامل اتوماسیون شامل ادراک، برنامه‌ریزی حرکت و اجرای دقیق مأموریت‌های صنعتی را ارائه می‌کنند.','ربات صنعتی','آزاد',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,3,'/images/leagues/industrial-university-cover.png','/images/leagues/industrial-university-hero.png','سالن فناوری جام تبرستان','حرفه‌ای','فارسی / انگلیسی','فضای ۱۶ مترمربع، میز ربات صنعتی و کنسول داوری مستقل برای هر تیم فراهم می‌شود.','[{"label":"کیفیت اتوماسیون","points":45},{"label":"دقت و تکرارپذیری","points":35},{"label":"نوآوری","points":20}]','[{"title":"ارزیابی طرح"},{"title":"دموی صنعتی"},{"title":"فینال تخصصی"}]',true,'open'),
('لیگ ربات‌های ورزشی زیر ۱۴ سال','sports-robots-u14','رقابت تیمی ربات‌های ورزشی در زمین استاندارد ویژه رده زیر ۱۴ سال.','فوتبال رباتیک و رقابت تیمی برای استعدادهای زیر ۱۴ سال.','سه ربات هر تیم در زمین مسابقه با تمرکز بر همکاری تیمی، کنترل دقیق و استراتژی بازی با یکدیگر رقابت می‌کنند.','ربات ورزشی','زیر ۱۴ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,3,'/images/leagues/sports-u14-cover.png','/images/leagues/sports-u14-hero.png','سالن ورزشی جام تبرستان','مقدماتی تا متوسط','فارسی','زمین MDF به ابعاد تقریبی ۱۶ مترمربع و کنسول داوری استاندارد استفاده می‌شود.','[{"label":"نتیجه مسابقه","points":60},{"label":"بازی تیمی","points":25},{"label":"کیفیت فنی","points":15}]','[{"title":"تست ربات‌ها"},{"title":"مرحله گروهی"},{"title":"حذفی و فینال"}]',true,'open'),
('لیگ ربات‌های ورزشی زیر ۱۹ سال','sports-robots-u19','رقابت حرفه‌ای ربات‌های ورزشی برای تیم‌های زیر ۱۹ سال.','فوتبال رباتیک سریع و تاکتیکی در رده زیر ۱۹ سال.','تیم‌ها با سه ربات و راهبردهای کنترلی پیشرفته در زمین استاندارد برای کسب عنوان قهرمانی رقابت می‌کنند.','ربات ورزشی','زیر ۱۹ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,3,'/images/leagues/sports-u19-cover.png','/images/leagues/sports-u19-hero.png','سالن ورزشی جام تبرستان','پیشرفته','فارسی','زمین MDF به ابعاد تقریبی ۱۶ مترمربع و کنسول داوری استاندارد استفاده می‌شود.','[{"label":"نتیجه مسابقه","points":60},{"label":"استراتژی تیمی","points":25},{"label":"کیفیت فنی","points":15}]','[{"title":"بازرسی فنی"},{"title":"مرحله گروهی"},{"title":"حذفی و فینال"}]',true,'open');
