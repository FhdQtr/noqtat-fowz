# Design — الميدان Next

نظام التصميم المقفل للنسخة الحديثة من «الميدان». هذا النظام يلغي بصرياً الهوية السابقة بالكامل: لا عنابي، لا ذهبي، لا سدو، لا جلد، ولا زخارف مرتبطة بقطر. تبقى وظائف اللعبة ومساراتها ومحتواها كما هي.

## Genre

Modern-minimal product UI with a restrained playful game layer. واجهة عربية RTL حديثة، دقيقة، سريعة، ومبنية لتعمل على الجوال وشاشات العرض.

## Macrostructure family

- Marketing / entry: **Map / Diagram**؛ «ميدان جديد» هو مركز الخريطة، ومسارات الفريق والجمهور والفردي نقاط مرتبطة حوله.
- App / game: **Workbench**؛ السؤال هو سطح العمل الرئيسي، والوقت والنتيجة والأدوات تحيط به دون مزاحمته.
- Content / admin: **Component Playground**؛ وظائف الإدارة موزعة إلى أدوات واضحة بحالات كاملة.

## Theme — Cobalt

- `--color-paper`: oklch(98% 0.008 255)
- `--color-paper-2`: oklch(95% 0.016 255)
- `--color-paper-3`: oklch(91% 0.025 255)
- `--color-ink`: oklch(20% 0.035 264)
- `--color-ink-2`: oklch(48% 0.035 264)
- `--color-rule`: oklch(87% 0.025 255)
- `--color-accent`: oklch(58% 0.22 264)
- `--color-focus`: oklch(62% 0.23 264)

ألوان النجاح والتحذير والخطأ وظيفية فقط، ولا تستخدم كزينة.

## Typography

- Display: system Arabic UI, weight 750–850, normal style.
- Body: system Arabic UI, weight 400–650.
- Numerals: platform sans with tabular figures.
- Display tracking: `-0.025em` للعناوين الكبيرة، وصفر للنصوص العربية الصغيرة.
- الأحجام سائلة بـ`clamp()` والمسافات بوحدات `rem` حتى تستجيب لتكبير النص.

## Spacing

مقياس 4 نقاط بأسماء دلالية في `tokens.css`. المكونات لا تضيف قرارات بصرية خام خارج الرموز.

## Apple interaction foundations

- Response: رد بصري يبدأ عند pointer-down، دون تأخير مصطنع.
- Direct manipulation: الـsheet يتبع الإصبع 1:1 ويحترم موضع الالتقاط.
- Interruptibility: السحب والحركة قابلان للمقاطعة وإعادة التوجيه من القيمة المرئية الحالية.
- Velocity handoff: سرعة السحب تنتقل إلى spring عند الإفلات.
- Spatial consistency: الدخول والخروج من المسار نفسه، والواجهات تنشأ من مصدرها.
- Materials: الشريط والـsheet فقط يستخدمان translucency؛ بقية الأسطح معتمة وسريعة.
- Multimodal feedback: الصوت والاهتزاز واللون يتزامنون مع اعتماد الإجابة.
- Accessibility: reduced-motion وreduced-transparency وmore-contrast حالات أصلية في النظام.

## Motion

- Press feedback: `scale(.98)` خلال 80–100ms.
- State continuity: transform/opacity فقط، باستثناء مؤشرات التقدم الوظيفية.
- Timer: `requestAnimationFrame` يحدّث transform أو stroke مباشرة دون إعادة تصيير السؤال كل إطار.
- Sheet: spring فيزيائي بلا قفل للإدخال، مع rubber-banding وحدود متوقعة من سرعة السحب.
- Reduced motion: crossfade لا يتجاوز 150ms، بلا انتقال مكاني.

## Components and states

كل عنصر تفاعلي يدعم: default، hover، focus-visible، active، disabled، loading، error، success. أهداف اللمس لا تقل عن 44×44 CSS px، ولا تعتمد أي حالة على اللون وحده.

## CTA voice

- Primary: أزرق كهربائي، شكل هندسي مستدير باعتدال، عنوان مباشر من سطر واحد.
- Secondary: سطح أبيض بحد واضح وحبر داكن.
- CTA الرئيسية: «ميدان جديد».

## Per-page allowances

- الرئيسية تستخدم رسماً مكانياً خفيفاً بـCSS/SVG يوضح مسارات اللعب.
- شاشات اللعب لا تستخدم صوراً زخرفية؛ الوظيفة والسؤال هما المشهد.
- شاشة الجمهور تكبّر السؤال والإجابات وتخفض كثافة الأدوات.
- الإدارة أكثر كثافة، لكنها تشارك النظام نفسه.

## What pages MUST share

- الشعار النصي الحديث وعلامة الميدان الهندسية.
- الورق البارد والحبر الداكن والأزرق الكهربائي.
- حالات الأزرار والحقول والإجابات والوقت.
- أشكال التركيز وأهداف اللمس وسلوك تقليل الحركة.
- التذييل: «فكرة وتصميم: فهد القحطاني».

## Performance budget

- لا صور خلفية أو `background-attachment: fixed`.
- لا `transition-all` ولا blur دائم فوق مساحة كبيرة.
- لا loop زخرفي أو parallax أو cursor follower.
- الحركة على compositor، والمؤقت لا يعيد تصيير شجرة السؤال كل إطار.
- الصور التعليمية فقط تُحمّل عند الحاجة وبأبعاد ثابتة.

## Exports

المصدر التنفيذي هو `tokens.css`. تُربط متغيرات Tailwind وshadcn بالرموز نفسها داخل CSS لضمان عدم انقسام الهوية.
