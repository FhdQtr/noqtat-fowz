interface Props {
  host?: boolean;
  tv?: boolean;
  paused: boolean;
  busyInventory?: boolean;
  pending?: boolean;
  onRecheck?: () => void;
  onEnd?: () => void;
}

export default function SelectionRecovery({ host = false, tv = false, paused, busyInventory = false, pending = false, onRecheck, onEnd }: Props) {
  if (!host && !paused) return null;
  if (tv) return (
    <section className="arena-panel w-full max-w-4xl space-y-6 p-8 text-center" aria-label="توفر أسئلة الميدان" role="status" aria-live="polite">
      <p className="font-cairo text-3xl font-black text-gold-light lg:text-5xl">{busyInventory ? "حجز مؤقت للأسئلة" : "اللعب متوقف — لا يوجد قسم متاح الآن"}</p>
      <p className="text-xl leading-relaxed text-foreground lg:text-3xl">لن نكرر سؤالًا حديثًا: نحترم دورة القسم واستبعاد آخر 10 مسابقات.</p>
      <p className="text-xl leading-relaxed text-foreground lg:text-3xl">المقدم يعيد فحص المخزون أو يختار إعدادًا آخر في ميدان جديد. النقاط الحالية محفوظة والنتيجة غير مكتملة.</p>
    </section>
  );
  return (
    <section className="arena-panel w-full max-w-lg space-y-3 p-4 text-center" aria-label="توفر أسئلة الميدان">
      {paused && (
        <div role="status" aria-live="polite" className="space-y-2">
          <p className="font-cairo font-black text-gold-light">{busyInventory ? "حجز مؤقت للأسئلة" : "اللعب متوقف — لا يوجد قسم متاح الآن"}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {busyInventory ? "ميدان آخر للمقدم يحجز المخزون مؤقتًا. انتظر قليلًا ثم أعد الفحص؛ لم يُستهلك سؤال جديد."
              : "لن نكرر سؤالًا حديثًا: نحترم دورة القسم واستبعاد آخر 10 مسابقات وحدود الأقسام. إعادة الفحص لا تمسح التاريخ ولا تغيّر النقاط."}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {host ? "أعد فحص المخزون بعد توفر محتوى مؤهل. إن ظل غير كافٍ، يمكنك إنهاء الميدان الحالي ثم اختيار أقسام أكثر أو أسئلة أقل في ميدان جديد. النتيجة الحالية غير مكتملة."
              : "المقدم يستطيع إعادة فحص المخزون أو إنهاء الميدان غير المكتمل وتغيير الإعداد في ميدان جديد. لا حاجة لتكرار النقر أو تغيير هوية جهازك."}
          </p>
        </div>
      )}
      {host && (
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" disabled={pending} onClick={onRecheck} className="btn-ghost-gold min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
            {pending ? "جاري الفحص…" : "إعادة فحص المخزون"}
          </button>
          {paused && onEnd && <button type="button" disabled={pending} onClick={onEnd} className="btn-ghost-gold min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">إنهاء الميدان الحالي</button>}
        </div>
      )}
    </section>
  );
}
