# Design — الميدان

نظام تصميم مقفل لتجربة «الميدان». كل واجهة تقرأ هذا الملف قبل أي تعديل بصري.
الهدف هو إحساس مجلس قطري راقٍ وواضح وسريع، لا واجهة ألعاب صاخبة ولا قالب زجاجي عام.

## Genre

Atmospheric product UI: خامات داكنة دافئة، عنابي قطري، ذهب معتّق، ونص عربي عالي الوضوح.

## Macrostructure family

- Marketing / entry: compact action hub؛ عنوان قصير ثم إجراء رئيسي واحد ثم مسارات الدخول.
- App / game: stage + controls؛ السؤال هو مركز الشاشة، والوقت والنتيجة حوله لا فوقه.
- Content / admin: dense workbench؛ تسلسل واضح، زخرفة أقل، وكثافة معلومات أعلى.

## Theme

- `--m-paper`: oklch(15% 0.012 58)
- `--m-paper-raised`: oklch(21% 0.021 45)
- `--m-ink`: oklch(94% 0.012 82)
- `--m-ink-soft`: oklch(80% 0.012 72)
- `--m-rule`: oklch(38% 0.035 48)
- `--m-maroon`: oklch(39% 0.135 12)
- `--m-gold`: oklch(80% 0.105 79)
- `--m-focus`: oklch(84% 0.14 88)

الأخضر والأحمر وظيفيان فقط: الوقت ونتيجة الإجابة. لا يستخدمان كزينة.

## Typography

- Display: Cairo, weight 800–900, normal style.
- Body: Tajawal, weight 400–700.
- Numerals: platform sans, tabular figures, fixed line box.
- Display tracking: `-0.02em` للعناوين الكبيرة، وصفر للنصوص.
- الأجوبة تبدأ من `1.0625rem` على الجوال وتكبر حسب المساحة، مع حد أدنى مريح للمس.

## Spacing

مقياس 4 نقاط موجود في `tokens.css`. يمنع إدخال مسافات مرئية جديدة داخل المكونات من دون رمز اسمي.

## Motion

- الحركة الوظيفية فقط: ضغط الزر، تقدّم الوقت، ظهور نتيجة الإجابة.
- مؤقت الزمن يستخدم `requestAnimationFrame` ويحدّث `transform` أو `strokeDashoffset` مباشرة؛ لا يعيد تصيير شجرة السؤال كل إطار.
- التغييرات البصرية القصيرة تستخدم `--m-ease-out` و`--m-duration-short`.
- عند `prefers-reduced-motion: reduce`: لا نبض ولا انتقال مكاني؛ تبقى دلالة اللون والرقم.

## Microinteractions stance

- استجابة الضغط تبدأ في `pointer-down` عبر `:active`.
- النجاح المرئي لا يحتاج رسالة إضافية؛ بطاقة الإجابة نفسها تتحول إلى حالة صحيحة أو خاطئة.
- الصوت والصورة يتزامنان مع لحظة اعتماد النتيجة.
- كل هدف لمس لا يقل عن 44×44 CSS px، والتركيز بلوحة المفاتيح ظاهر فوراً.

## CTA voice

- Primary CTA: عنابي عميق، فاصل ذهبي، عنوان من سطر واحد، ووصف قصير.
- Secondary CTA: فحم دافئ بحد نحاسي، دون توهج أو حركة زخرفية.
- النص الرئيسي المعتمد: «ميدان جديد».

## Per-page allowances

- الصفحة الرئيسية قد تستخدم شريط السدو والخامة الجلدية وصورة الشعار المعتمدة.
- شاشات اللعب تستخدم الخامة كخلفية فقط؛ المكونات الوظيفية أخف وأكثر تسطيحاً لرفع الأداء.
- شاشة الجمهور تكبّر السؤال والأجوبة ولا تضيف مؤثرات خلفية متحركة.

## What pages MUST share

- شعار «الميدان» وعبارة «الميدان يا حميدان».
- العنابي والذهبي ودرجات الفحم نفسها.
- شكل التركيز، ارتفاعات اللمس، وإيقاع الحواف.
- بطاقة إجابة واحدة مشتركة بين اللاعب والمقدم وشاشة الجمهور.
- التذييل: «فكرة وتصميم: فهد القحطاني» في الصفحة الرئيسية.

## What pages MAY differ on

- كثافة المعلومات بحسب الجهاز والدور.
- حجم السؤال والعداد بين الجوال وشاشة الجمهور.
- عدد أعمدة الإجابات بحسب طول الإجابة ومساحة الحاوية.

## Exports

### tokens.css

المصدر التنفيذي هو ملف `tokens.css` في جذر المشروع.

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: var(--m-paper);
  --color-ink: var(--m-ink);
  --color-accent: var(--m-maroon);
  --color-gold: var(--m-gold);
  --font-display: var(--m-font-display);
  --font-body: var(--m-font-body);
  --spacing-md: var(--m-space-md);
  --ease-out: var(--m-ease-out);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(15% 0.012 58)", "$type": "color" },
    "ink": { "$value": "oklch(94% 0.012 82)", "$type": "color" },
    "accent": { "$value": "oklch(39% 0.135 12)", "$type": "color" },
    "gold": { "$value": "oklch(80% 0.105 79)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Cairo", "$type": "fontFamily" },
    "body": { "$value": "Tajawal", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 15% 0.012 58;
  --foreground: 94% 0.012 82;
  --primary: 39% 0.135 12;
  --primary-foreground: 94% 0.012 82;
  --muted: 27% 0.024 45;
  --muted-foreground: 68% 0.012 55;
  --border: 38% 0.035 48;
  --input: 38% 0.035 48;
  --ring: 84% 0.14 88;
  --radius: 1.125rem;
}
```
