import { Check, X, Image as ImageIcon, Flag, ListOrdered, Lightbulb, Quote, HelpCircle, Brain } from "lucide-react";
import type { Question } from "../types/game";
import { TYPE_LABEL, LEVEL_LABEL, CATEGORY_LABEL } from "../types/game";

const TYPE_ICON: Record<string, typeof Flag> = {
  flag: Flag,
  image: ImageIcon,
  ordering: ListOrdered,
  riddle: Lightbulb,
  completion: Quote,
  multiple_choice: HelpCircle,
  true_false: Check,
  memory: Brain,
};

const LETTERS = ["أ", "ب", "ج", "د"];

export function QuestionMeta({ q }: { q: Question }) {
  const Icon = TYPE_ICON[q.type] ?? HelpCircle;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-tajawal">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-faint/50 bg-night-700/70 px-3 py-1 text-gold-light">
        <Icon className="w-3.5 h-3.5" />
        {TYPE_LABEL[q.type]}
      </span>
      <span className="rounded-full border border-gold-faint/40 bg-night-700/70 px-3 py-1 text-muted-foreground">
        {CATEGORY_LABEL[q.category] ?? q.category}
      </span>
      <span
        className={`rounded-full px-3 py-1 border ${
          q.level === "easy"
            ? "border-emerald2/50 text-emerald2-light"
            : q.level === "medium"
            ? "border-gold/50 text-gold-light"
            : "border-maroon-light/60 text-maroon-light"
        }`}
      >
        {LEVEL_LABEL[q.level]}
      </span>
    </div>
  );
}

/** عرض السؤال (مع صورة إن وجدت) — showImage=false يخفي الصورة (أسئلة الذاكرة/الأعلام بعد انتهاء المعاينة) */
export function QuestionBody({
  q,
  big = false,
  reveal = false,
  showImage = true,
}: {
  q: Question;
  big?: boolean;
  reveal?: boolean;
  showImage?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      {q.image && showImage && (
        <div
          className={`relative overflow-hidden rounded-2xl border-2 border-gold/40 shadow-2xl ${
            big ? "w-full max-w-lg" : "w-full max-w-xs"
          }`}
          style={{ boxShadow: "0 12px 44px rgba(0,0,0,0.55), 0 0 30px rgba(212,175,55,0.12)" }}
        >
          <img
            src={q.image}
            alt="صورة السؤال"
            className={`w-full object-cover ${q.type === "flag" ? "aspect-[3/2]" : big ? "aspect-[16/10]" : "aspect-[3/2]"}`}
            loading="eager"
          />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />
        </div>
      )}
      <h2
        className={`font-cairo font-extrabold text-center leading-relaxed ${
          big ? "text-2xl sm:text-4xl" : "text-lg sm:text-xl"
        }`}
      >
        {q.question}
      </h2>
      {reveal && (
        <div className="text-sm text-muted-foreground">
          الإجابة الصحيحة: <span className="text-emerald2-light font-bold">{q.options[q.answer]}</span>
        </div>
      )}
    </div>
  );
}

/** خيارات العرض (شاشة TV / كشف) — غير تفاعلية */
export function OptionsDisplay({
  q,
  chosen = null,
  reveal = false,
  big = false,
}: {
  q: Question;
  chosen?: number | null;
  reveal?: boolean;
  big?: boolean;
}) {
  return (
    <div className={`grid gap-3 w-full ${q.options.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
      {q.options.map((opt, i) => {
        const isCorrect = reveal && i === q.answer;
        const isWrongChoice = reveal && chosen === i && i !== q.answer;
        const isChosen = chosen === i;
        return (
          <div
            key={i}
            className={`relative flex items-center gap-3 rounded-xl border-2 px-4 transition-all duration-300 ${
              big ? "py-4 sm:py-5 text-lg sm:text-2xl" : "py-3 text-sm sm:text-base"
            } font-cairo font-bold ${
              isCorrect
                ? "border-emerald2-light bg-emerald2/25 text-emerald2-light scale-[1.02]"
                : isWrongChoice
                ? "border-maroon-light bg-maroon/30 text-white animate-shake"
                : isChosen
                ? "border-gold bg-gold/15 text-gold-light"
                : "border-gold-faint/40 bg-night-700/60 text-foreground"
            }`}
          >
            <span
              className={`shrink-0 inline-flex items-center justify-center rounded-lg font-black ${
                big ? "w-10 h-10 text-xl" : "w-7 h-7 text-sm"
              } ${
                isCorrect
                  ? "bg-emerald2 text-white"
                  : isWrongChoice
                  ? "bg-maroon text-white"
                  : "bg-night-600 text-gold-light border border-gold-faint/50"
              }`}
            >
              {q.type === "true_false" ? (i === 0 ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />) : LETTERS[i]}
            </span>
            <span className="flex-1">{opt}</span>
            {isCorrect && <Check className="w-6 h-6 shrink-0" />}
            {isWrongChoice && <X className="w-6 h-6 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}
