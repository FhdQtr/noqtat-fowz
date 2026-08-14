# الميدان | الميدان يا حميدان

منصة مسابقات عربية مباشرة للمجالس والتجمعات. يدير المقدم الميدان، وتدخل الفرق من جوالاتها بأكواد مستقلة، وتظهر الأسئلة والنتائج على شاشة الجمهور.

## المزايا

- من فريقين إلى أربعة فرق، مع قائد اختياري لكل فريق.
- أكثر من ١٠٠٠ سؤال في ٩ أنواع، مع تصاعد الصعوبة والنقاط.
- شاشة مقدم، شاشة جمهور، وجوالات اللاعبين متزامنة لحظياً.
- أسئلة صور وذاكرة وأعلام وفيديو وتمثيل، مع السرقة والمساعدة.
- «ساحة الحسم» تلقائياً عند تعادل المتصدرين.
- بطاقتان تكتيكيتان لكل فريق: مضاعفة النقاط ووقت إضافي +١٥ ثانية.
- تحدي فردي من ١٠٠ سؤال بإجابات محفوظة على الخادم.
- بنك خاص للمقدم، استيراد جماعي، ونسخ احتياطي.
- هوية «الميدان» وأيقونات أصلية مصممة خصيصاً للمشروع.

## التقنية

- React 19 + TypeScript + Vite 7
- Tailwind CSS 3.4
- Firebase Authentication + Realtime Database + Cloud Functions v2
- تحميل كسول لكل شاشة لتقليل حجم البداية

## التشغيل محلياً

```bash
npm install
npm run dev
```

لفحص بنك الأسئلة وبناء نسخة الإنتاج:

```bash
npm run check
```

## الأمان وFirebase

التغييرات الحساسة لا تُكتب من المتصفح. إنشاء الغرفة، اختيار السؤال، تثبيت الإجابة، احتساب النقاط، والحسم تنفذها Cloud Function وتتحقق من هوية المقدم واللاعب. الإجابة الصحيحة تحفظ في `matchSecrets` ولا تظهر في حالة المباراة العامة قبل حسمها.

1. فعّل Anonymous وEmail/Password من Firebase Authentication.
2. ثبّت Firebase CLI وسجّل الدخول إلى مشروع `noqtat-fowz-d13aa`.
3. ثبّت حزم الوظائف:

```bash
cd functions
npm install
cd ..
```

4. انشر الوظائف والقواعد والاستضافة:

```bash
npm run build
firebase deploy --only functions,database,hosting
```

ينسخ `firebase.json` بنك الأسئلة إلى حزمة الوظائف آلياً قبل النشر. لا تنشر `database.rules.json` وحده قبل نشر الوظيفة، لأن القواعد تمنع أي كتابة مباشرة من المتصفح.

## حساب المدير

أنشئ حساب Email/Password للمدير من Firebase Console، ثم امنحه custom claim باسم `admin` باستخدام بيانات خدمة Firebase/ADC:

```bash
cd functions
npm run set-admin -- admin@example.com
```

بعدها يسجل المدير من `/admin`. بنك الأسئلة المخصص لا يمكن قراءته أو تعديله إلا بحساب يحمل صلاحية `admin`.

## App Check

بعد تسجيل تطبيق الويب في Firebase App Check، اضبط متغير بيئة الوظائف `ENFORCE_APP_CHECK=true` ثم أعد نشر الوظائف. أبقِه معطلاً أثناء إعداد المحاكي فقط.

## أهم الملفات

- `src/pages/Home.tsx` — واجهة الميدان الرئيسية
- `src/pages/HostSetup.tsx` — تجهيز المسابقة
- `src/pages/HostRoom.tsx` — تحكم المقدم
- `src/pages/TvScreen.tsx` — شاشة الجمهور
- `src/pages/Play.tsx` — جهاز اللاعب
- `src/pages/Challenge.tsx` — التحدي الفردي
- `src/lib/matchApi.ts` — واجهة Cloud Functions
- `functions/index.js` — منطق اللعب الموثوق
- `database.rules.json` — قواعد قاعدة البيانات المقفلة
- `scripts/validate-questions.mjs` — فحص بنك الأسئلة

صُنع بواسطة فهد القحطاني — Fhd.AlQahtani
