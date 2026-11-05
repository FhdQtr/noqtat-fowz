import type { AnswerMode } from "../../types/game";

const ANSWER_MODE_LABELS: Record<AnswerMode, { label: string; hint: string }> = {
  representative: { label: "ممثل الفريق", hint: "شخص محدد من كل فريق يثبت الإجابة" },
  host: { label: "المقدم فقط", hint: "الفرق تختار النوع والمقدم يثبت الإجابة" },
  anyone: { label: "أي لاعب", hint: "أول لاعب يضغط يثبت الإجابة" },
};

export default function AnswerModeControls({
  value,
  disabled,
  compact = false,
  onChange,
}: {
  value: AnswerMode;
  disabled: boolean;
  compact?: boolean;
  onChange: (mode: AnswerMode) => void;
}) {
  return (
    <div className={`glass-card ${compact ? "p-3" : "p-4"}`}>
      <p className="mb-2 text-xs font-bold text-gold-light">من يثبت الإجابة؟</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(Object.keys(ANSWER_MODE_LABELS) as AnswerMode[]).map((mode) => {
          const option = ANSWER_MODE_LABELS[mode];
          const active = value === mode;
          return (
            <button
              key={mode}
              onClick={() => onChange(mode)}
              disabled={disabled || active}
              className={`rounded-xl border px-3 py-2 text-right font-cairo transition-colors ${
                active
                  ? "border-gold bg-gold/20 text-gold-light"
                  : "border-gold-faint/40 text-muted-foreground hover:border-gold/60"
              }`}
            >
              <span className="block text-sm font-bold">{option.label}</span>
              {!compact && <span className="mt-0.5 block text-[11px] opacity-75">{option.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
