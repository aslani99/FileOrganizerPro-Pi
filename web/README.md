# FileOrganizerPro Web Frontend

این پوشه، Frontend واقعی وب/اکوسیستم File Organizer Pro است و برای **Pi Testnet / Sandbox** آماده شده است.

## قابلیت‌ها

- Pi SDK 2.0
- `Pi.init({ version: "2.0", sandbox: true })` در محیط تست
- ورود Pioneer با `Pi.authenticate`
- نمایش وضعیت اتصال Pi
- دریافت زنده پلن‌ها از جدول `plans` در Supabase
- طراحی RTL و Responsive برای Pi Browser
- بدون قرار دادن Secret یا Server API Key در کد Frontend

### نکته امنیتی

کلید `SUPABASE_ANON_KEY` عمداً در Frontend قابل مشاهده است؛ این کلید عمومی است. هرگز `PI_SERVER_API_KEY`، Service Role Key یا توکن کاربر را در Repository قرار ندهید.

بازیابی و تکمیل پرداخت‌های واقعی همچنان باید از مسیر Server/Edge Functions انجام شود. این Frontend منطق محرمانه پرداخت را به Browser منتقل نمی‌کند.

## اجرای محلی

از ریشه پروژه:

```bash
node PiCheckoutDev/server.mjs
```

این دستور Checkout Function فعلی را روی `http://localhost:3000` در دسترس می‌کند.

برای Frontend استاتیک می‌توانید از هر static server استفاده کنید؛ GitHub Pages نیز مناسب است.

## GitHub Pages

محتوای این پوشه باید به Repository جداگانه `FileOrganizerPro-Pi` منتقل شود. پس از فعال‌سازی Pages، دامنه سفارشی:

```text
https://fileorganizer.mohmmadaslanidev.ir
```

را به Repository متصل کنید و سپس رکورد DNS مربوط به `fileorganizer` را در سرویس DNS دامنه بسازید.

## Pi Developer Portal

در Testnet:

- **Your App's URL** = آدرس HTTPS عمومی Frontend
- **Your App's development URL** = `http://localhost:3000`

برای Production بعداً `PI_SANDBOX` و App URL با دامنه Production جداگانه تنظیم خواهند شد.
