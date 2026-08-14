# 🚀 راهنمای کامل دیپلوی RoboCactus

> پلتفرم وب مدیریت مسابقات و رویدادهای علمی/رباتیک — تک‌رویداد در هر instance، چندنقشه.

---

## 📑 فهرست مطالب

1. [روش اول: دیپلوی با Supabase Cloud (سریع)](#روش-اول-دیپلوی-با-supabase-cloud)
2. [روش دوم: دیپلوی با Supabase Self-Hosted روی سرور شخصی](#روش-دوم-دیپلوی-با-supabase-self-hosted)
3. [آپلود دیتابیس با all-in-one.sql](#آپلود-دیتابیس-با-all-in-onesql)
4. [تنظیمات Environment](#تنظیمات-environment)
5. [دیپلوی فرانت‌اند (Vite + React)](#دیپلوی-فرانت‌اند)
6. [تنظیمات DNS و SSL](#تنظیمات-dns-و-ssl)
7. [عیب‌یابی](#عیب‌یابی)

---

## 🌐 روش اول: دیپلوی با Supabase Cloud

سریع‌ترین روش برای راه‌اندازی پروژه. دیتابیس و auth توسط Supabase مدیریت می‌شود.

### ۱.۱ ساخت پروژه در Supabase

1. به [https://supabase.com](https://supabase.com) بروید و ثبت‌نام کنید.
2. از داشبورد روی **New project** کلیک کنید.
3. یک **Organization** انتخاب کنید (یا بسازید).
4. تنظیمات پروژه:
   - **Name**: مثلاً `robocactous`
   - **Database Password**: یک پسورد قوی وارد کنید (این را ذخیره کنید!)
   - **Region**: نزدیک‌ترین region به کاربرانتان (مثلاً `ap-south-1` برای ایران نزدیک‌ترین)
5. روی **Create new project** کلیک کنید و چند دقیقه صبر کنید.

### ۱.۲ دریافت کلیدها

پس از ساخته شدن پروژه، به **Project Settings > API** بروید:

| متغیر | مکان در داشبورد |
|-------|----------------|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project API Keys → `anon` / `publishable` |
| `SUPABASE_ACCESS_TOKEN` | Account Settings → Access Tokens → Generate new token |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → Database password |

### ۱.۳ آپلود migration ها

از طریق SQL Editor در داشبورد Supabase:

```bash
# فایل all-in-one.sql را باز کنید
# محتوای آن را کپی کنید
# به SQL Editor در داشبورد Supabase بروید
# New query → Paste → Run
```

یا از طریق CLI:

```bash
# نصب Supabase CLI
npm install -g supabase

# لاگین
supabase login

# لینک به پروژه
supabase link --project-ref YOUR_PROJECT_REF

# اجرای migration
supabase db push
```

### ۱.۴ تنظیمات Storage (Bucket)

به **Storage** در داشبورد بروید و یک bucket به نام `assets` بسازید:
- **Public bucket**: خاموش (Private)
- **Allowed MIME types**: `image/*`
- **File size limit**: 5MB

سپس به **Policies** بروید و policy های زیر را اضافه کنید:

```sql
-- INSERT برای کاربران auth شده
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assets');

-- SELECT برای همه
CREATE POLICY "Allow public read" ON storage.objects
FOR SELECT TO anon USING (bucket_id = 'assets');

-- DELETE برای ادمین
CREATE POLICY "Allow admin delete" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'assets' AND
  auth.uid() IN (SELECT id FROM profiles WHERE role = 'super_admin')
);
```

### ۱.۵ تنظیمات Auth

به **Authentication > Providers** بروید:
- **Email provider** را فعال کنید.
- **Confirm email** را خاموش کنید (اگر می‌خواهید بدون تأیید ایمیل ثبت‌نام شود).
- **Site URL** را به دامنه نهایی خود تنظیم کنید.

---

## 🖥️ روش دوم: دیپلوی با Supabase Self-Hosted

اگر می‌خواهید همه چیز روی سرور شخصی خودتان باشد (دیتابیس، auth، storage).

### ۲.۱ پیش‌نیازهای سرور

```
OS: Ubuntu 22.04 LTS (توصیه شده)
RAM: حداقل 4GB (8GB توصیه شده)
CPU: 2 core
Disk: 50GB SSD
Docker: 24.0+
Docker Compose: 2.20+
```

### ۲.۲ نصب Docker و Docker Compose

```bash
# آپدیت سیستم
sudo apt update && sudo apt upgrade -y

# نصب Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# نصب Docker Compose
sudo apt install docker-compose-plugin -y

# اضافه کردن user به docker group
sudo usermod -aG docker $USER
newgrp docker

# تست
docker --version
docker compose version
```

### ۲.۳ نصب Supabase Self-Hosted

```bash
# ساخت دایرکتوری
mkdir -p ~/supabase && cd ~/supabase

# کلون کردن repo
git clone https://github.com/supabase/supabase.git
cd supabase/docker

# کپی فایل env
cp .env.example .env

# ویرایش فایل .env
nano .env
```

### ۲.۴ تنظیمات .env برای Self-Hosted

فایل `.env` را با مقادیر زیر ویرایش کنید:

```env
############
# Secrets
############
POSTGRES_PASSWORD=your-very-strong-password-here
JWT_SECRET=your-jwt-secret-min-32-chars-long
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # یک JWT secret با base64
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # یک JWT secret دیگر

############
# Database
############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

############
# API
############
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

############
# Auth
############
SITE_URL=http://your-domain.com
ADDITIONAL_REDIRECT_URLS=
JWT_EXPIRY=3600
DISABLE_SIGNUP=false

############
# SMTP (برای ارسال ایمیل)
############
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true # true = بدون تأیید ایمیل
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SENDER_NAME=RoboCactus

############
# Storage
############
STORAGE_BACKEND=file
FILE_STORAGE_BACKEND_PATH=/var/lib/storage

############
# Analytics (اختیاری)
############
ANALYTICS=false
```

### ۲.۵ تولید کلیدهای JWT

```bash
# نصب openssl
sudo apt install openssl -y

# تولید secret
openssl rand -base64 32

# این secret را به عنوان JWT_SECRET در .env قرار دهید

# تولید ANON_KEY (باید یک JWT باشد)
# از ابزار آنلاین https://jwt.io استفاده کنید یا:

# نصب node.js
sudo apt install nodejs npm -y

# ساخت یک اسکریپت کوچک
node -e "
const crypto = require('crypto');
const secret = 'your-jwt-secret-here';
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ role: 'anon', iss: 'supabase', iat: Math.floor(Date.now()/1000) })).toString('base64url');
const signature = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
console.log(header + '.' + payload + '.' + signature);
"
```

### ۲.۶ راه‌اندازی سرویس‌ها

```bash
cd ~/supabase/supabase/docker

# Pull و start
docker compose pull
docker compose up -d

# بررسی وضعیت
docker compose ps

# لاگ‌ها
docker compose logs -f
```

### ۲.۷ تنظیمات فایروال

```bash
# باز کردن پورت‌ها
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8000/tcp  # Supabase API (فقط اگر نیاز دارید)
sudo ufw enable
```

### ۲.۸ تنظیمات Nginx Reverse Proxy (توصیه شده)

```bash
sudo apt install nginx -y
```

فایل `/etc/nginx/sites-available/robocactous`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support (Realtime)
    location /realtime/v1/websocket {
        proxy_pass http://localhost:8000/realtime/v1/websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/robocactous /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🗄️ آپلود دیتابیس با all-in-one.sql

پس از راه‌اندازی دیتابیس (چه Cloud چه Self-Hosted)، باید schema و جداول را ایجاد کنید.

### روش ۱: از طریق SQL Editor (Cloud)

1. به داشبورد Supabase بروید
2. به **SQL Editor** بروید
3. **New query** را بزنید
4. محتوای فایل `supabase/all-in-one.sql` را کپی و paste کنید
5. **Run** را بزنید

### روش ۲: از طریق psql (Self-Hosted یا Cloud)

```bash
# برای Self-Hosted
docker exec -i supabase-db psql -U postgres -d postgres < all-in-one.sql

# یا با psql مستقیم (نیاز به پورت فوروارد یا دسترسی مستقیم)
psql -h localhost -U postgres -d postgres -f all-in-one.sql

# برای Cloud (با استفاده از connection string)
psql "postgres://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" -f all-in-one.sql
```

### روش ۳: از طریق Supabase CLI

```bash
# اگر پروژه لینک شده است
supabase db push

# یا اجرای SQL مستقیم
supabase sql < all-in-one.sql
```

### بررسی موفقیت migration

```sql
-- در SQL Editor یا psql اجرا کنید:
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- باید حدود 30+ جدول برگرداند

SELECT * FROM site_settings LIMIT 1;
-- باید یک ردیف با تنظیمات پیش‌فرض برگرداند
```

---

## ⚙️ تنظیمات Environment

فایل `.env` در روت پروژه را ایجاد/ویرایش کنید:

### برای Supabase Cloud:

```env
# === Supabase Project ===
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxx

# === Migrations (HTTPS Management API) ===
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxx
SUPABASE_DB_PASSWORD=your-db-password

# === Payment ===
VITE_PAYMENT_PROVIDER=mock
VITE_ZARINPAL_MERCHANT_ID=
VITE_ZARINPAL_SANDBOX=true

# === SMS ===
VITE_IPPANEL_MOCK=true
VITE_IPPANEL_API_KEY=
VITE_IPPANEL_ORIGINATOR=
```

### برای Supabase Self-Hosted:

```env
# === Supabase Self-Hosted ===
VITE_SUPABASE_URL=http://your-server-ip:8000
VITE_SUPABASE_ANON_KEY=your-anon-key-from-env

# === Database (Direct Postgres) ===
DATABASE_URL=postgres://postgres:your-password@your-server-ip:5432/postgres
# یا
SUPABASE_DB_PASSWORD=your-postgres-password

# === Payment ===
VITE_PAYMENT_PROVIDER=mock
VITE_ZARINPAL_MERCHANT_ID=
VITE_ZARINPAL_SANDBOX=true

# === SMS ===
VITE_IPPANEL_MOCK=true
VITE_IPPANEL_API_KEY=
VITE_IPPANEL_ORIGINATOR=
```

---

## 🚀 دیپلوی فرانت‌اند

### ۳.۱ ساخت نسخه Production

```bash
# روی سرور شخصی یا CI/CD
cd /path/to/robocactous

# نصب وابستگی‌ها
npm install

# ساخت نسخه production
npm run build

# محتوای پوشه dist/ آماده دیپلوی است
```

### ۳.۲ دیپلوی با Nginx

```bash
# کپی فایل‌های build
sudo mkdir -p /var/www/robocactous
sudo cp -r dist/* /var/www/robocactous/
sudo chown -R www-data:www-data /var/www/robocactous
```

فایل `/etc/nginx/sites-available/robocactous-frontend`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/robocactous;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # React Router fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy (برای self-hosted)
    location /rest/ {
        proxy_pass http://localhost:8000/rest/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /auth/ {
        proxy_pass http://localhost:8000/auth/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /storage/ {
        proxy_pass http://localhost:8000/storage/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /realtime/ {
        proxy_pass http://localhost:8000/realtime/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/robocactous-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### ۳.۳ دیپلوی روی Vercel / Netlify / Cloudflare Pages

برای **Vercel**:
```bash
npm i -g vercel
vercel --prod
# یا با git: connect repository in Vercel dashboard
```

برای **Netlify**:
```bash
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

**مهم**: در هاستینگ‌های استاتیک، باید:
1. **SPA fallback** را تنظیم کنید (همه مسیرها به `index.html` برگردند)
2. **Environment variables** را در داشبورد هاستینگ وارد کنید
3. **Supabase URL** باید عمومی/قابل دسترس باشد

---

## 🔒 تنظیمات DNS و SSL

### با Certbot (Let's Encrypt)

```bash
# نصب Certbot
sudo apt install certbot python3-certbot-nginx -y

# دریافت SSL
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# تست auto-renew
sudo certbot renew --dry-run
```

### تنظیمات DNS

در پنل DNS دامنه خود:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_SERVER_IP | 300 |
| A | www | YOUR_SERVER_IP | 300 |

---

## ✅ چک‌لیست نهایی دیپلوی

- [ ] دامنه ثبت شده و DNS تنظیم شده
- [ ] SSL certificate نصب شده (HTTPS کار می‌کند)
- [ ] Supabase (Cloud یا Self-Hosted) راه‌اندازی شده
- [ ] دیتابیس با `all-in-one.sql` پر شده
- [ ] Storage bucket `assets` ساخته شده
- [ ] Auth provider فعال شده
- [ ] فایل `.env` روی سرور تنظیم شده
- [ ] فرانت‌اند build و دیپلوی شده
- [ ] WebSocket (Realtime) کار می‌کند
- [ ] Login/Register تست شده
- [ ] Upload عکس تست شده

---

## 🔧 عیب‌یابی

### خطا: `Failed to fetch`
- بررسی کنید `VITE_SUPABASE_URL` درست تنظیم شده
- CORS در Supabase تنظیم شده؟ (Settings > API > CORS)
- آیا دامنه در Site URL و Redirect URLs auth ثبت شده؟

### خطا: `Invalid login credentials`
- بررسی کنید `ENABLE_EMAIL_AUTOCONFIRM=true` در self-hosted
- در Cloud: Email provider فعال است؟

### خطا: `new row violates row-level security policy`
- بررسی کنید user لاگین کرده باشد
- Policies درست تنظیم شده‌اند؟ (به `all-in-one.sql` مراجعه کنید)

### خطا: Realtime کار نمی‌کند
- WebSocket در Nginx فعال است؟
- `proxy_read_timeout` تنظیم شده؟
- در Cloud: Realtime در Project Settings فعال است؟

### خطا: Storage upload ناموفق
- Bucket `assets` ساخته شده؟
- Policy های storage درست تنظیم شده‌اند؟
- MIME type و size limit بررسی شود

---

## 📁 ساختار فایل‌های دیپلوی

```
robocactous/
├── .env                      ← تنظیمات محیطی (هرگز کامیت نشود!)
├── .env.example              ← نمونه تنظیمات
├── dist/                     ← خروجی build
├── docs/                     ← مستندات
├── scripts/                  ← اسکریپت‌های کمکی
├── src/                      ← سورس کد
├── supabase/
│   ├── all-in-one.sql       ← ← ← تمام migration ها در یک فایل
│   ├── migrations/          ← فایل‌های جداگانه migration
│   └── seed.sql             ← داده‌های اولیه
├── index.html
├── package.json
└── vite.config.ts
```

---

## 📝 نکات مهم

1. **هرگز `service_role_key` را در فرانت‌اند استفاده نکنید!** فقط `anon_key` را در `.env` بگذارید.
2. **فایل `.env` را در git کامیت نکنید.** (در `.gitignore` هست)
3. **از پسورد قوی برای Postgres استفاده کنید.**
4. **Backup منظم دیتابیس** را تنظیم کنید.
5. **Monitor کردن منابع سرور** را فراموش نکنید.

---

## 🆘 پشتیبان‌گیری و بازیابی

### Backup

```bash
# Self-Hosted
docker exec supabase-db pg_dump -U postgres -d postgres > backup_$(date +%Y%m%d).sql

# Cloud (با psql)
pg_dump "postgres://postgres:[password]@db.[ref].supabase.co:5432/postgres" > backup.sql
```

### Restore

```bash
# Self-Hosted
docker exec -i supabase-db psql -U postgres -d postgres < backup.sql

# Cloud
psql "postgres://postgres:[password]@db.[ref].supabase.co:5432/postgres" < backup.sql
```

---

**موفق باشید! 🎉**
