import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight, Minus, Plus, Crown, Timer, TimerOff, Layers, Loader2,
  HelpCircle,
} from "lucide-react";
import ArenaBackdrop from "../components/ArenaBackdrop";
import BrandLogo from "../components/BrandLogo";
import QuestionTypeIcon from "../components/QuestionTypeIcon";
import { createMatch } from "../lib/matchApi";
import { sfx, unlockAudio } from "../lib/sounds";
import { useCustomTypes } from "../lib/useCustomBank";
import type { AnswerMode, DifficultyMode, QuestionType } from "../types/game";
import { TEAM_COLORS } from "../types/game";

const TEAM_COLOR_ORDER = ["maroon", "emerald", "royal", "gold"] as const;

const TYPE_OPTIONS: { id: QuestionType; label: string }[] = [
  { id: "multiple_choice", label: "اختيار من متعدد" },
  { id: "true_false", label: "صح أم خطأ" },
  { id: "image", label: "معالم بالصور" },
  { id: "memory", label: "اختبار الذاكرة" },
  { id: "flag", label: "أعلام الدول" },
  { id: "completion", label: "أكمل المثل" },
  { id: "ordering", label: "ترتيب" },
  { id: "riddle", label: "ألغاز" },
  { id: "acting", label: "مثّل المثل" },
];

const QUESTIONS_PER_TEAM_OPTIONS = [4, 6, 8, 10];
const TIMER_OPTIONS = [10, 15, 20, 30, 40, 50, 60];
const DIFFICULTY_OPTIONS: { id: DifficultyMode; label: string }[] = [
  { id: "easy", label: "سهل" },
  { id: "medium", label: "متوسط" },
  { id: "hard", label: "صعب" },
  { id: "mixed", label: "متنوع" },
];
const ANSWER_MODE_OPTIONS: { id: AnswerMode; label: string; hint: string }[] = [
  { id: "representative", label: "ممثل الفريق", hint: "شخص واحد من كل فريق يثبت الإجابة" },
  { id: "host", label: "المقدم فقط", hint: "الفرق تختار النوع والمقدم يثبت الإجابة" },
  { id: "anyone", label: "أي لاعب", hint: "أول لاعب من الفريق يضغط يثبت الإجابة" },
];

export default function HostSetup() {
  const nav = useNavigate();
  const customTypes = useCustomTypes();
  const [hostName, setHostName] = useState("");
  const [teamCount, setTeamCount] = useState(2);
  const [teamNames, setTeamNames] = useState<string[]>(["", ""]);
  const [questionsPerTeam, setQuestionsPerTeam] = useState(8);
  const [timer, setTimer] = useState(0);
  const [difficulty, setDifficulty] = useState<DifficultyMode>("medium");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("representative");
  const [types, setTypes] = useState<QuestionType[]>(TYPE_OPTIONS.map((t) => t.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // الأنواع المعروضة = الأساسية + أنواع المقدم المخصصة (تُفعَّل تلقائياً أول ما تظهر)
  const allTypeOptions = [
    ...TYPE_OPTIONS,
    ...customTypes.map((t) => ({ id: t.id, label: t.name })),
  ];
  const customIds = customTypes.map((t) => t.id);
  useEffect(() => {
    if (customIds.length)
      setTypes((prev) => (customIds.every((id) => prev.includes(id)) ? prev : [...prev, ...customIds.filter((id) => !prev.includes(id))]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customIds.join(",")]);

  const setCount = (n: number) => {
    const c = Math.min(4, Math.max(2, n));
    setTeamCount(c);
    setTeamNames((prev) => {
      const next = [...prev];
      while (next.length < c) next.push("");
      return next.slice(0, c);
    });
  };

  const toggleType = (t: QuestionType) => {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const create = async () => {
    if (types.length === 0) {
      setErr("اختر نوع سؤال واحد على الأقل");
      return;
    }
    setBusy(true);
    setErr("");
    unlockAudio();
    try {
      // مهلة أمان: لو الاتصال طوّل نظهر رسالة بدل تعليق أبدي على «جاري الإنشاء»
      const code = await Promise.race([
        createMatch({
          hostName,
          teamNames: teamNames.map((n, i) => n.trim() || `فريق ${["العنابي", "الأخضر", "الأزرق", "الذهبي"][i]}`),
          questionsPerTeam,
          timer,
          difficulty,
          answerMode,
          enabledTypes: types,
        }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("الاتصال بالسيرفر أخذ وقتًا أطول من المعتاد — تأكد من الإنترنت أو جرّب شبكة ثانية")), 20000)
        ),
      ]);
      sfx.correct();
      nav(`/host/${code}`);
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8">
      <ArenaBackdrop strength="soft" />

      <div className="w-full max-w-xl">
        <div className="mb-5 flex items-center justify-between gap-3">
        <button onClick={() => nav("/")} className="flex items-center gap-2 text-muted-foreground hover:text-gold-light transition-colors">
          <ArrowRight className="w-4 h-4" />
          <span className="text-sm">رجوع</span>
        </button>
        <BrandLogo compact className="max-w-[170px]" />
        </div>

        <div className="glass-card p-6 sm:p-8 animate-fade-up">
          <div className="flex items-center gap-3 mb-6">
            <Crown className="w-7 h-7 text-gold-light" />
            <div><h1 className="text-2xl font-black font-cairo text-gold-gradient">جهّز الميدان</h1><p className="mt-1 text-xs text-muted-foreground">دقائق بسيطة وتبدأ المواجهة</p></div>
          </div>

          {/* اسم المقدم */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">اسمك (الحكم)</label>
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="مثال: فهد"
            className="input-night mb-6"
            maxLength={20}
          />

          {/* عدد الفرق */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">عدد الفرق</label>
          <div className="flex items-center gap-4 mb-5">
            <button onClick={() => setCount(teamCount - 1)} className="btn-ghost-gold !p-2.5" disabled={teamCount <= 2}>
              <Minus className="w-5 h-5" />
            </button>
            <span className="text-4xl font-black font-cairo text-gold-gradient w-12 text-center">{teamCount}</span>
            <button onClick={() => setCount(teamCount + 1)} className="btn-ghost-gold !p-2.5" disabled={teamCount >= 4}>
              <Plus className="w-5 h-5" />
            </button>
            <span className="text-xs text-muted-foreground">من ٢ إلى ٤ فرق</span>
          </div>

          {/* أسماء الفرق */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {teamNames.map((name, i) => {
              const c = TEAM_COLORS[TEAM_COLOR_ORDER[i]];
              return (
                <div key={i} className="relative">
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full"
                    style={{ background: c.light, boxShadow: `0 0 8px ${c.light}` }}
                  />
                  <input
                    value={name}
                    onChange={(e) =>
                      setTeamNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
                    }
                    placeholder={`فريق ${c.label}`}
                    className="input-night !pr-10"
                    maxLength={16}
                  />
                </div>
              );
            })}
          </div>

          {/* عدد الأسئلة لكل فريق */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">عدد الأسئلة لكل فريق</label>
          <div className="flex gap-2 mb-6">
            {QUESTIONS_PER_TEAM_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setQuestionsPerTeam(n)}
                className={`flex-1 rounded-xl py-2.5 font-cairo font-bold border transition-all ${
                  questionsPerTeam === n
                    ? "bg-gold/20 border-gold text-gold-light"
                    : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="-mt-4 mb-6 text-xs text-muted-foreground">
            المجموع: {questionsPerTeam * teamCount} سؤال · كل فريق له {questionsPerTeam} أسئلة
          </p>

          {/* مستوى المسابقة */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">مستوى الأسئلة</label>
          <div className="grid grid-cols-4 gap-2 mb-6">
            {DIFFICULTY_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setDifficulty(id)}
                className={`rounded-xl py-2.5 font-cairo font-bold border transition-all ${
                  difficulty === id
                    ? "bg-gold/20 border-gold text-gold-light"
                    : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* من يثبت الإجابة */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">من يثبت الإجابة؟</label>
          <div className="grid gap-2 mb-6">
            {ANSWER_MODE_OPTIONS.map(({ id, label, hint }) => (
              <button
                key={id}
                onClick={() => setAnswerMode(id)}
                className={`rounded-xl px-4 py-3 text-right font-cairo border transition-all ${
                  answerMode === id
                    ? "bg-gold/20 border-gold text-gold-light"
                    : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
                }`}
              >
                <span className="block font-bold">{label}</span>
                <span className="block mt-0.5 text-xs opacity-75">{hint}</span>
              </button>
            ))}
          </div>

          {/* المؤقت */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">وقت الإجابة لكل سؤال</label>
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTimer(0)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 font-cairo font-bold border transition-all ${
                timer === 0 ? "bg-gold/20 border-gold text-gold-light" : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
              }`}
            >
              <TimerOff className="w-4 h-4" />
              بدون وقت
            </button>
            <div
              className={`flex-1 flex items-center gap-2 rounded-xl border px-3 transition-all ${
                timer > 0 ? "bg-gold/20 border-gold" : "border-gold-faint/40"
              }`}
            >
              <Timer className={`w-4 h-4 shrink-0 ${timer > 0 ? "text-gold-light" : "text-muted-foreground"}`} />
              <select
                value={timer > 0 ? timer : 30}
                onClick={() => { if (timer === 0) setTimer(30); }}
                onFocus={() => { if (timer === 0) setTimer(30); }}
                onChange={(e) => setTimer(Number(e.target.value))}
                className={`w-full bg-transparent py-2.5 font-cairo font-bold outline-none cursor-pointer ${
                  timer > 0 ? "text-gold-light" : "text-muted-foreground"
                } [&>option]:bg-night-800`}
              >
                {TIMER_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s} ثانية</option>
                ))}
              </select>
            </div>
          </div>

          {/* أنواع الأسئلة */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            أنواع الأسئلة
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {allTypeOptions.map(({ id, label }) => {
              const on = types.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleType(id)}
                  className={`flex min-w-[132px] flex-1 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-cairo font-bold border transition-all ${
                    on
                      ? "bg-gold/20 border-gold text-gold-light"
                      : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
                  }`}
                >
                  {id.startsWith("ct_") ? <HelpCircle className="h-8 w-8 p-1.5" /> : <QuestionTypeIcon type={id} className="h-9 w-9" />}
                  {label}
                </button>
              );
            })}
          </div>
          {customTypes.length > 0 && (
            <p className="text-xs text-gold-light/70 mb-1">
              أنواعك المخصصة من لوحة التحكم تظهر هنا تلقائياً.
            </p>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed mb-8">
            في كل دور يختار الفريق نوع سؤاله من الأنواع المفعّلة. مستوى السؤال يتبع اختيارك أعلاه،
            وتزيد قيمة النوع كلما كرره الفريق، مع حد أقصى يحافظ على تنوع المسابقة.
          </p>

          {err && (
            <div className="text-maroon-light text-sm font-bold bg-maroon/15 border border-maroon/40 rounded-xl px-4 py-2.5 mb-4">
              {err}
            </div>
          )}

          <button onClick={create} disabled={busy} className="btn-gold shine w-full text-lg flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crown className="w-5 h-5" />}
            {busy ? "جاري تجهيز الميدان…" : "ابدأ الميدان"}
          </button>
        </div>
      </div>
    </div>
  );
}
