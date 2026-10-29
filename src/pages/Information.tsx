import type { ReactNode } from 'react';
import { Link } from 'react-router';
import ArenaBackdrop from '../components/ArenaBackdrop';
import BrandLogo from '../components/BrandLogo';

function InformationLayout({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-h-dvh px-4 py-8">
    <ArenaBackdrop strength="soft" />
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link to="/" className="inline-flex min-h-11 items-center text-gold-light">العودة للرئيسية</Link>
        <BrandLogo compact className="max-w-[170px]" />
      </header>
      <main className="glass-card p-6 sm:p-8 space-y-6 leading-relaxed">
        <h1 className="text-2xl font-black text-gold-light">{title}</h1>
        {children}
      </main>
      <nav aria-label="مساعدة الميدان" className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-gold-light">
        <Link className="inline-flex min-h-11 items-center" to="/host">جهّز الميدان</Link>
        <Link className="inline-flex min-h-11 items-center" to="/help">طريقة اللعب</Link>
        <Link className="inline-flex min-h-11 items-center" to="/privacy">البيانات وعمر الجلسة</Link>
      </nav>
    </div>
  </div>;
}

export function HelpPage() {
  return <InformationLayout title="طريقة اللعب">
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gold-light">ثلاثة أدوار، لكل جهاز مهمته</h2>
      <ol className="list-decimal list-inside space-y-2">
        <li>المقدم: يجهّز الميدان ويشارك دعوات الفرق، ثم يدير الأسئلة والكشف والنقاط من جهازه. لا تعرض لوحة المقدم للجمهور؛ فيها الأجوبة.</li>
        <li>الفرق: جوال واحد على الأقل لكل فريق، والدخول بدعوة الفريق قبل البداية. يختار الفريق القسم من جواله حتى في وضع «المقدم فقط»؛ هذا الوضع يغيّر من يثبت الإجابة، ولا يلغي حاجة الفريق للجوال.</li>
        <li>الجمهور: افتح رابط شاشة الجمهور على تلفزيون أو كمبيوتر. كود العرض ليس دعوة للانضمام إلى فريق؛ احتفظ بروابط الدعوة الخاصة لدى أصحابها.</li>
      </ol>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gold-light">الدور والوقت والنقاط</h2>
      <p>اختاروا القسم، ثبّتوا الجواب، ثم يكشف المقدم النتيجة وينقل الدور. يمكنه الحكم الشفهي والتخطي؛ وتصحيح النقاط يحمل سببًا معلنًا.</p>
      <p>المؤقت العادي إرشادي ولا يقفل الإجابة عند الصفر. مواجهة الجميع مختلفة: نافذة وصولها ملزمة على الخادم. قيمة القسم قد تزيد عند تكراره، لكنها ليست تصنيفًا لصعوبة السؤال.</p>
      <p>للبطاقات رصيد مكتسب مستقل عن نقاط الفوز؛ تُعرض تكلفة البطاقة قبل تأكيدها. عند تعادل المتصدرين تفتح ساحة الحسم. لا تتغير قيمة النقاط لمجرد اختيار إعداد البداية السريعة.</p>
      <p>«سؤال وعقاب» اختياري؛ اتفقوا على تحديات آمنة يقبلها المشاركون، أو عطّلوه من الأقسام قبل الإنشاء.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gold-light">التنويع وحدود المخزون</h2>
      <p>السحب من القسم بلا تكرار حتى استنفاد دورته، مع استبعاد ما استُخدم في آخر 10 مسابقات مستهلكة للمقدم نفسه. إنشاء لوبي فارغ لا يقدّم هذا السجل. تغيير الجهاز أو التصفح الخاص أو حذف هوية المتصفح قد يفصل سجلّك؛ لا توجد هنا ضمانة استمرارية بين الأجهزة.</p>
      <p>عند نفاد المخزون لا نعيد سؤالًا حديثًا بصمت. تظهر حالة توقف وخيار فحص المخزون للمقدم؛ يمكنه إنهاء الميدان أو تجهيز مسابقة بأقسام أوسع. إنشاء مسابقة جديدة بنفس الإعداد ليس ضمانًا لحل النفاد.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gold-light">إذا انقطع الاتصال</h2>
      <p>انتظر عودة الاتصال على الجهاز نفسه، وراقب تنبيه المزامنة. إذا ظهر زر إعادة إرسال الجواب، استخدمه لإعادة الاختيار نفسه بدل تغيير الجواب. لا تبدأ غرفة بديلة قبل التحقق من الغرفة الحالية.</p>
      <p>إذا تعذر الرجوع، احتفظ بكود الميدان ووصف الخطوة ورسالة الخطأ لمراجعتها مع المقدم. لا تشارك روابط التحكم أو دعوات الفرق أو أي رمز دخول في لقطة عامة.</p>
    </section>
  </InformationLayout>;
}

export function PrivacyPage() {
  return <InformationLayout title="البيانات وعمر الجلسة">
    <p>هذه ملاحظات تشغيلية عن النسخة، وليست شهادة امتثال قانوني أو وعدًا بحذف جميع البيانات. استخدموا أسماء فرق وأسماء مستعارة، ولا تكتبوا معلومات حساسة في الأسئلة أو أسماء اللاعبين.</p>
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gold-light">ما يظهر وما يُحفظ</h2>
      <p>تُحفظ هوية Firebase للمشارك وربط الفريق وأسماء اللاعبين وحالة المسابقة والأسئلة المستخدمة والإجابات والنقاط. يستطيع من لديه رابط أو كود العرض مشاهدة بيانات اللعب المعروضة، بما فيها أسماء الفرق واللاعبين؛ الغرفة الخاصة لا تعني أن شاشة الجمهور سرية.</p>
      <p>مفاتيح الدعوات وصلاحيات المقدم والأجوبة قبل الكشف محفوظة في مسارات خاصة بالخادم. لا تشارك جهاز المقدم أو رابطه. يحتفظ المتصفح بهوية الدخول وبيانات استعادة اللاعب وتفضيل الصوت؛ مسحها أو استخدام التصفح الخاص قد يمنع استعادة الدور أو استمرار سجل منع التكرار.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gold-light">مهل الغرف ليست حذفًا شاملًا</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>لوبي لم يبدأ: مهلة 10 دقائق من الإنشاء.</li>
        <li>ميدان بدأ: مهلة 8 ساعات من البدء، وليست من آخر ضغطة.</li>
        <li>ميدان انتهى: مهلة ساعة من النهاية.</li>
      </ul>
      <p>يستهدف التنظيف المجدول إزالة الغرف المنتهية وأسرارها وبيانات الوصول المرتبطة بها بعد هذه المهل. التنفيذ الفعلي يعتمد على تشغيل وظيفة التنظيف، وقد يتأخر؛ هذه المهل ليست وعدًا بحذف جميع البيانات أو كل نسخة احتياطية.</p>
      <p>سجل منع التكرار المرتبط بهوية المقدم يستمر بعد الغرفة. لا توجد في هذه النسخة مهلة حذف شاملة مؤكدة لكل سجلات الهوية والاستخدام ودعوات الفرق والجلسات الفردية؛ انتهاء الغرفة أو مغادرة اللاعب ليس طلب محو شاملًا.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gold-light">الخدمات الخارجية</h2>
      <p>تستخدم المنصة Firebase للدخول وبيانات اللعب، وVercel للاستضافة. تتضمن الواجهة تكامل تحليلات Vercel مع إخفاء أكواد الجلسات من مسار الصفحة وإزالة الاستعلامات قبل إرسال الحدث؛ وجود التكامل لا يثبت وصول التحليلات في كل بيئة. تُحمّل الخطوط من Google Fonts، وقد تتصل الأسئلة المخصصة بمصدر الصورة أو الفيديو المعروض.</p>
    </section>
  </InformationLayout>;
}

export function MissingPage() {
  return <InformationLayout title="الصفحة غير موجودة">
    <p>الرابط غير معروف. إذا كنت تحاول دخول فريق، استخدم دعوة الفريق التي أعطاها لك المقدم، لا كود شاشة الجمهور.</p>
    <p>لم ننقلك إلى الرئيسية تلقائيًا حتى يبقى الخطأ واضحًا. يمكنك الرجوع للرئيسية أو فتح طريقة اللعب أدناه.</p>
  </InformationLayout>;
}
