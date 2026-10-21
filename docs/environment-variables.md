# متغيرات البيئة: ديمو دلوقتي، وproduction بتغيير المتغيرات بس

> آخر تحديث: 21 أكتوبر 2026 · مشروع التطوير: `hlhlpjecinkqqsqrjpcj`

المشروع كله شغال دلوقتي **كديمو** على مشروع Supabase بتاع التطوير. أي جزء محتاج خدمة خارجية (دفع، إيميل، SMS، واتساب، ذكاء اصطناعي) بيشتغل في **وضع تجريبي** لوحده لحد ما مفاتيحه تتحط. يوم الإطلاق مش محتاج تغيير كود: بتحط المتغيرات اللي تحت، وكل جزء بيتحول **live** لوحده.

## الحالة دلوقتي

| الجزء | الوضع دلوقتي | بيتحول live لما |
|---|---|---|
| الدفع بالكارت (Paymob) | **تجريبي**: `SIGNUP_PAYMENT_TEST_MODE=true`. الدفع بيتعمل محاكاة، والمحاولة بتتعلّم `[TEST PAYMENT]` ومابتتأكدش أبدًا | تحط متغيرات Paymob وتخلي `SIGNUP_PAYMENT_TEST_MODE=false` |
| الإيميل (Resend) | **تجريبي**: الرسالة بتتسجل في سجل الرسائل ومابتتبعتش | `RESEND_API_KEY` و`EMAIL_FROM` |
| SMS (SMS Misr) | **تجريبي** | `SMS_MISR_USERNAME` و`SMS_MISR_PASSWORD` و`SMS_MISR_SENDER` |
| واتساب (360dialog) | **تجريبي** | `WHATSAPP_360DIALOG_API_KEY` |
| المساعد الذكي واستيراد البيانات بالذكاء الاصطناعي | **مقفول**: بيرد "AI is not configured" | `ANTHROPIC_API_KEY` |
| InstaPay والتحويل البنكي والمحافظ اليدوية | شغالين، بس محتاجين بيانات الحضانة | بيانات بتتكتب من لوحة الأدمن (تحت) |

**في الوضع التجريبي** رسالة الإيميل أو SMS أو واتساب اللي رايحة لمستخدم في التطبيق (رمز التحقق، فاتورة جديدة) بتظهر له **في إشعارات التطبيق** ومكتوب عليها "تجريبي"، علشان المسار يتجرّب كامل. كل رسالة، تجريبية أو حقيقية، بتتسجل في جدول `message_deliveries`: نوعها، ولمين، ومين طلبها، واتبعتت ولا لأ. نص الرسالة والأكواد **مابيتخزنوش**.

## 1. متغيرات دوال السيرفر (Supabase Edge Functions)

**بتتحط فين:** Supabase Dashboard ← Edge Functions ← Secrets. أو مرة واحدة من ملف:

```
cp supabase/functions/.env.example supabase/functions/.env.production.local
# املا القيم، وامسح السطور اللي مش هتستخدمها
npx supabase secrets set --env-file supabase/functions/.env.production.local --project-ref <project-ref>
```

الملف `.env.production.local` مش بيترفع على git. النموذج `supabase/functions/.env.example` فيه كل الأسماء.

| المتغير | دلوقتي (ديمو) | production |
|---|---|---|
| `SIGNUP_PAYMENT_TEST_MODE` | `true` | `false` أو تمسحه |
| `PAYMOB_SECRET_KEY`، `PAYMOB_PUBLIC_KEY` | فاضي | من لوحة Paymob |
| `PAYMOB_HMAC_SECRET` | فاضي | من لوحة Paymob. **إجباري**: من غيره الدفع مايتأكدش |
| `PAYMOB_AMOUNT_MULTIPLIER` | فاضي | `100` |
| `PAYMOB_CARD_INTEGRATION_ID` | فاضي | رقم integration الكارت |
| `PAYMOB_INSTAPAY_INTEGRATION_ID` و`PAYMOB_MOBILE_WALLET_INTEGRATION_ID` و`PAYMOB_FAWRY_INTEGRATION_ID` | فاضي | لو الطرق دي هتتدفع عن طريق Paymob |
| `APP_BASE_URL` | فاضي | عنوان الموقع، ولازم يبدأ بـ `https://`. Paymob بيرجّع عليه، واللينكات اللي في الإيميلات بتشاور عليه |
| `RESEND_API_KEY` | فاضي | مفتاح Resend |
| `EMAIL_FROM` | فاضي | مرسل على دومين متأكد منه في Resend، مثلًا `XO Nursery <no-reply@your-domain.com>` |
| `SMS_MISR_USERNAME`، `SMS_MISR_PASSWORD` | فاضي | من إعدادات حساب SMS Misr |
| `SMS_MISR_SENDER` | فاضي | الـ Sender Token من صفحة Sender ID في SMS Misr |
| `SMS_MISR_ENVIRONMENT` | — | `1` للحقيقي، و`2` لبيئة الاختبار بتاعتهم |
| `WHATSAPP_360DIALOG_API_KEY` | فاضي | مفتاح الرقم من 360dialog |
| `ANTHROPIC_API_KEY` | فاضي | مفتاح Anthropic |
| `ANTHROPIC_MODEL`، `ANTHROPIC_IMPORT_MODEL` | — | اختياري. الافتراضي `claude-haiku-5-5` للمساعد و`claude-sonnet-5-5` لاستيراد البيانات |
| `MESSAGING_MODE` | — | اختياري: `demo` بيمنع إرسال أي إيميل أو SMS أو واتساب حتى لو المفاتيح موجودة (مفيد لـ staging) |

`SUPABASE_URL` و`SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY` بيتحطوا تلقائيًا، مش محتاج تحطهم.

تفاصيل Paymob (الـ webhook، وصفحة الرجوع، والتجربة): [paymob-checkout.md](paymob-checkout.md).

## 2. متغيرات الواجهة (Vercel أو `.env`)

| المتغير | production |
|---|---|
| `VITE_SUPABASE_URL` | رابط مشروع Supabase بتاع production |
| `VITE_SUPABASE_ANON_KEY` | المفتاح العام (publishable) |
| `VITE_SUPABASE_LEGACY_ANON_KEY` | الـ anon key القديم (JWT) لو مفاتيح `sb_publishable_*` رجعت 401 مع الدوال |
| `VITE_SHOW_DEMO_ACCOUNTS` | **`false`**. لازم، علشان صفحة الدخول ماتعرضش الحسابات التجريبية |
| `VITE_VAPID_PUBLIC_KEY` | لإشعارات المتصفح (شوف الملحوظة في آخر الملف) |

## 3. إعدادات Supabase (من الـ Dashboard، مش متغيرات)

- **Authentication ← URL Configuration:** الـ Site URL دلوقتي `http://localhost:3000`. غيّره لعنوان الموقع، وضيف نفس العنوان في Redirect URLs. ده بيأثر على لينكات تأكيد الحساب واستعادة كلمة السر.
- **Authentication ← SMTP:** إيميلات Supabase نفسها (تأكيد الحساب، واستعادة كلمة السر) عليها حد إرسال صغير من غير SMTP خاص. ممكن تستخدم نفس حساب Resend.

## 4. متغيرات GitHub Actions (البيئة `production`)

الـ job اللي بيطبّق الـ migrations وبينشر الواجهة واقف من 12 أكتوبر علشان دول ناقصين:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PRODUCTION_DB_PASSWORD`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

لحد ما يتحطوا، الـ migrations بتتطبق يدوي. كلها متطبقة لحد `20261021030000`.

الـ CI **مابينشرش** دوال السيرفر. بعد أي تعديل في `supabase/functions`:

```
npx supabase functions deploy <name> --project-ref <project-ref> --use-api
```

## 5. بيانات بتتكتب من لوحة الأدمن (مش متغيرات)

دي بيانات خاصة بكل حضانة، وبتتكتب من إعدادات الدفع:

- عنوان InstaPay (أو صورة الـ QR) واسم الحساب.
- أرقام استقبال المحافظ: فودافون كاش، واتصالات كاش، وغيرهم. **المحفظة اللي مالهاش رقم مابتظهرش لولي الأمر.**
- بيانات التحويل البنكي، وتعليمات الدفع.

## 6. دوال مش منشورة عن قصد

| الدالة | السبب |
|---|---|
| `payment-reminders` و`permission-deadline-reminder` | الشغل ده بتعمله مهام مجدولة جوه قاعدة البيانات (`payment-reminders-daily` و`permission-deadline-reminders-daily`). الدالتين نسخة قديمة، ومافيهمش أي تحقق من الصلاحيات |
| `emergency-broadcast` | مافيش أي جزء في التطبيق بيناديها، ومافيهاش تحقق من الصلاحيات |

الأحسن تتمسح. ولو احتجتها، لازم يتضاف لها تحقق من الصلاحيات قبل النشر، زي `email-dispatch`.

## 7. مين يقدر يبعت رسايل

كل من `email-dispatch` و`sms-dispatch` و`whatsapp-dispatch` بيطلب تسجيل دخول:

- **أدمن الفرع والمدير:** لحضانتهم بس. ولو الرسالة رايحة لحساب في التطبيق، لازم الحساب ده يكون في نفس الحضانة.
- **أدمن السلسلة:** لحضانات السلسلة. **أدمن XO:** لأي حضانة.
- **ولي الأمر:** يبعت لنفسه رمز التحقق بس (تغيير كلمة السر، وتأكيد الموبايل)، بحد أقصى 10 في اليوم لكل قناة.
- **أي حد تاني** (مدرس، أو حد مش مسجل دخول): مرفوض.

## 8. ملحوظات قبل الإطلاق

- **واتساب:** الرسالة النصية العادية بتوصل بس خلال 24 ساعة من آخر رسالة بعتها الشخص لرقم الحضانة. الرسائل اللي الحضانة بتبدأها (زي "فاتورة جديدة") محتاجة **templates متوافق عليها من Meta** في 360dialog، وبعدها تعديل بسيط في `_shared/messaging.ts` علشان يبعت الـ template بدل النص.
- **SMS Misr و360dialog:** الكود مكتوب حسب الـ API بتاعهم، واتجرب بطلبات وهمية بس (`supabase/functions/_shared/messaging.test.ts`). أول ما المفاتيح تتحط، ابعت رسالة تجربة لرقمك وراجع صف الرسالة في `message_deliveries`: لو فشلت، `status` بيبقى `failed` وسبب الفشل في `error`.
- **إشعارات المتصفح (push):** التطبيق بيسجل اشتراكات المتصفح، بس **لسه مافيش جزء بيبعت push فعلًا**، ولا متغير السيرفر بتاعه (VAPID private key) موجود. دي ميزة محتاجة تتكمّل، مش متغير بيتحط.
- **`SIGNUP_PAYMENT_TEST_MODE`:** لازم يبقى `false` أو ممسوح على production. وهو `true` أي دفع بالكارت محاكاة.

## قائمة يوم الإطلاق

1. Supabase Secrets: Paymob و`APP_BASE_URL`، و`SIGNUP_PAYMENT_TEST_MODE=false`، وResend، وSMS Misr، و360dialog، وAnthropic.
2. Supabase Auth: الـ Site URL والـ Redirect URLs، وSMTP.
3. Vercel: متغيرات `VITE_*`، و`VITE_SHOW_DEMO_ACCOUNTS=false`.
4. GitHub: الـ secrets الخمسة بتوع البيئة `production`.
5. لوحة الأدمن لكل حضانة: InstaPay، وأرقام المحافظ، والتحويل البنكي.
6. Paymob: الـ webhook يشاور على `https://<project-ref>.supabase.co/functions/v1/paymob-webhook`.
7. تجربة: دفعة كارت صغيرة، وإيميل، وSMS، وواتساب لرقمك. كل واحدة لازم تظهر في `message_deliveries` بـ `mode = live` و`status = sent`.
