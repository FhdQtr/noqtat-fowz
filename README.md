# نقطة فوز | مسابقة المجالس

موقع مسابقات جماعية للمجالس — مقدم واحد يدير المسابقة، من ٢ إلى ٤ فرق، وكل لاعب يدخل بكود فريقه (QR) ويجاوب من جواله. يشمل تحدي المعرفة الفردي (١٠٠ سؤال).

## التقنيات
- React 18 + TypeScript + Vite 7
- Tailwind CSS 3.4 + shadcn/ui
- Firebase (Realtime Database + الدخول المجهول)
- qrcode لتوليد رموز الفرق

## التشغيل محلياً
```bash
npm install
npm run dev
```

## البناء للإنتاج
```bash
npm run build
```
الناتج في مجلد `dist/`.

## النشر على Vercel
1. ارفع الملفات على مستودع GitHub.
2. في Vercel: Import Project → يكتشف Vite تلقائياً.
3. ملف `vercel.json` مرفق ويحتوي إعادة توجيه SPA (ضروري لروابط مثل `/play/CODE-XXX`).

## إعداد Firebase
- المشروع: `noqtat-fowz-d13aa`
- Realtime Database (منطقة asia-southeast1)
- فعّل تسجيل الدخول المجهول (Anonymous) من Authentication
- قواعد قاعدة البيانات:
```json
{ "rules": { ".read": "auth != null", ".write": "auth != null" } }
```

## بنية المشروع
- `src/pages/Home.tsx` — الرئيسية
- `src/pages/HostSetup.tsx` — إعداد المسابقة (المقدم)
- `src/pages/HostRoom.tsx` — غرفة المقدم (QR الفرق + التحكم)
- `src/pages/TvScreen.tsx` — شاشة العرض للتلفزيون (عرض)
- `src/pages/Play.tsx` — شاشة اللاعب
- `src/pages/Challenge.tsx` — تحدي المعرفة الفردي
- `src/lib/matchApi.ts` — منطق المسابقة على Firebase
- `src/data/questions.json` — بنك الأسئلة (أكثر من ١٠٠٠ سؤال)

صنع بواسطة فهد القحطاني | Fhd.AlQahtani
