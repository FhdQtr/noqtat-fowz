import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight, Heart, Timer, Crown, Loader2, RotateCcw, Home,
} from "lucide-react";
import type { Question } from "../types/game";
import { QuestionMeta, QuestionBody } from "../components/QuestionCard";
import GoldConfetti from "../components/GoldConfetti";
import { sfx, unlockAudio } from "../lib/sounds";
import { answerSoloChallenge, startSoloChallenge } from "../lib/matchApi";

const TOTAL = 100;
const Q_TIME = 20;

const RANKS = [
  { at: 100, label: "ألماسي", color: "#7dd3fc" },
  { at: 90, label: "بلاتيني", color: "#e5e4e2" },
  { at: 75, label: "ذهبي", color: "#d4af37" },
  { at: 55, label: "فضي", color: "#c0c0c0" },
  { at: 35, label: "برونزي", color: "#cd7f32" },
  { at: 0, label: "مبتدئ", color: "#9ca3af" },
];

function rankFor(n: number) {
  return RANKS.find((r) => n >= r.at)!;
}

export default function Challenge() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<"intro" | "play" | "over">("intro");
  const [run, setRun] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Q_TIME);
  const [chosen, setChosen] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [lastChance, setLastChance] = useState(true);
  const [extend, setExtend] = useState(true);
  const [reached, setReached] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const q = run[idx];

  const start = async () => {
    unlockAudio();
    setBusy(true);
    try {
      const next = await startSoloChallenge();
      sfx.correct();
      setRun(next.questions);
      setSessionId(next.sessionId);
      setIdx(0);
      setReached(0);
      setChosen(null);
      setReveal(false);
      setLastChance(true);
      setExtend(true);
      setTimeLeft(Q_TIME);
      setPhase("play");
    } finally {
      setBusy(false);
    }
  };

  const gameOver = (finalIdx: number) => {
    setReached(finalIdx);
    setPhase("over");
    if (finalIdx >= TOTAL) sfx.fanfare();
    else sfx.wrong();
  };

  const next = (wasWrong: boolean) => {
    if (wasWrong) {
      if (lastChance) {
        setLastChance(false);
      } else {
        gameOver(idx);
        return;
      }
    }
    if (idx + 1 >= Math.min(TOTAL, run.length)) {
      gameOver(idx + 1);
      return;
    }
    setIdx(idx + 1);
    setChosen(null);
    setReveal(false);
    setTimeLeft(Q_TIME);
  };

  const pick = async (i: number) => {
    if (chosen !== null || reveal) return;
    setChosen(i);
    setBusy(true);
    try {
      const result = await answerSoloChallenge(sessionId, idx, i);
      setRun((questions) => questions.map((question, questionIndex) => questionIndex === idx ? { ...question, answer: result.answer } : question));
      setReveal(true);
      if (result.correct) sfx.correct();
      else sfx.wrong();
      setTimeout(() => next(!result.correct), 1600);
    } finally {
      setBusy(false);
    }
  };

  // المؤقت
  useEffect(() => {
    if (phase !== "play" || reveal) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) return 0;
        if (t <= 6) sfx.tickFinal();
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase, idx, reveal]);

  useEffect(() => {
    if (phase !== "play" || timeLeft !== 0 || reveal || busy || !sessionId) return;
    setBusy(true);
    void answerSoloChallenge(sessionId, idx, -1).then((result) => {
      setRun((questions) => questions.map((question, questionIndex) => questionIndex === idx ? { ...question, answer: result.answer } : question));
      setReveal(true);
      sfx.wrong();
      setTimeout(() => next(true), 1600);
    }).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, reveal, busy, sessionId, idx]);

  const rank = rankFor(reached);

  // ═══ المقدمة ═══
  if (phase === "intro")
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <div className="fixed inset-0 -z-10">
          <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-night/85" />
        </div>
        <button onClick={() => nav("/")} className="absolute top-6 right-6 flex items-center gap-2 text-muted-foreground hover:text-gold-light">
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>
        <img src="/img/trophy.png" alt="" className="w-36 h-36 object-contain animate-float-slow drop-shadow-[0_0_36px_rgba(212,175,55,0.5)]" />
        <h1 className="mt-4 text-4xl font-black font-cairo text-gold-gradient">تحدي المعرفة</h1>
        <p className="mt-2 font-ruqaa text-gold-light/80 text-xl">١٠٠ سؤال… فرصة وحدة تنجيك</p>
        <div className="glass-card mt-8 p-6 w-full max-w-md space-y-3 text-sm">
          {[
            "١٠٠ سؤال متصاعدة الصعوبة كل ١٠ أسئلة",
            "٢٠ ثانية لكل سؤال",
            "فرصة واحدة للغلط (الفرصة الأخيرة)",
            "تمديد وقت مرة واحدة +١٥ ثانية",
            "وصَلت ١٠٠؟ أنت أسطورة ألماسية",
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-gold-faint/20 last:border-0 pb-2.5 last:pb-0">
              <span className="w-7 h-7 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center text-gold-light font-cairo font-black text-xs shrink-0">
                {i + 1}
              </span>
              <span>{t}</span>
            </div>
          ))}
        </div>
        <button onClick={() => void start()} disabled={busy} className="btn-gold shine mt-8 text-xl px-12 py-4 flex items-center gap-2">
          {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Crown className="w-6 h-6" />}
          {busy ? "جاري تجهيز الأسئلة…" : "ابدأ التحدي"}
        </button>
      </div>
    );

  // ═══ النهاية ═══
  if (phase === "over")
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 text-center">
        {reached >= TOTAL && <GoldConfetti count={130} />}
        <div className="fixed inset-0 -z-10">
          <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-night/85" />
        </div>
        <img src="/img/trophy.png" alt="" className={`w-40 h-40 object-contain ${reached >= 55 ? "animate-float-slow drop-shadow-[0_0_44px_rgba(212,175,55,0.6)]" : "opacity-50"}`} />
        <h1 className="mt-4 text-3xl sm:text-5xl font-black font-cairo" style={{ color: rank.color }}>
          {reached >= TOTAL ? "أسطورة ألماسية!" : `وصلت للسؤال ${reached}`}
        </h1>
        <p className="mt-2 text-xl font-cairo" style={{ color: rank.color }}>
          الرتبة: {rank.label}
        </p>
        <div className="mt-6 flex gap-2 flex-wrap justify-center">
          {RANKS.slice().reverse().map((r) => (
            <span key={r.label} className={`rounded-full px-3 py-1 text-xs font-cairo font-bold border ${
              reached >= r.at ? "border-current" : "border-muted opacity-40"
            }`} style={{ color: r.color }}>
              {r.label} {r.at}+
            </span>
          ))}
        </div>
        <div className="mt-10 flex gap-3 flex-wrap justify-center">
          <button onClick={() => void start()} disabled={busy} className="btn-gold flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            تحدي جديد
          </button>
          <button onClick={() => nav("/")} className="btn-ghost-gold flex items-center gap-2">
            <Home className="w-5 h-5" />
            الرئيسية
          </button>
        </div>
      </div>
    );

  // ═══ اللعب ═══
  if (!q)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gold animate-spin" />
      </div>
    );

  return (
    <div className="min-h-dvh flex flex-col px-4 py-5 max-w-2xl mx-auto w-full">
      {/* الشريط العلوي */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-cairo font-bold text-gold-light">
          سؤال {idx + 1} <span className="text-muted-foreground text-sm">/ {TOTAL}</span>
        </span>
        <div className="flex items-center gap-2">
          {lastChance && (
            <span className="inline-flex items-center gap-1 rounded-full bg-maroon/20 border border-maroon-light/50 px-3 py-1 text-xs text-maroon-light font-bold">
              <Heart className="w-3.5 h-3.5" fill="currentColor" />
              فرصة أخيرة
            </span>
          )}
          {extend && !reveal && (
            <button
              onClick={() => {
                setExtend(false);
                setTimeLeft((t) => t + 15);
                sfx.click();
              }}
              className="inline-flex items-center gap-1 rounded-full bg-gold/15 border border-gold/50 px-3 py-1 text-xs text-gold-light font-bold hover:bg-gold/25"
            >
              <Timer className="w-3.5 h-3.5" />
              +١٥ ثانية
            </button>
          )}
        </div>
      </div>

      {/* شريط التقدم */}
      <div className="h-2 rounded-full bg-night-700 overflow-hidden mb-5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(idx / TOTAL) * 100}%`,
            background: "linear-gradient(90deg, #a8862a, #e8c96a)",
          }}
        />
      </div>

      {/* المؤقت الدائري */}
      <div className="flex justify-center mb-4">
        <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-4 font-cairo font-black text-2xl ${
          timeLeft <= 5 ? "border-maroon-light text-maroon-light animate-pulse" : "border-gold/60 text-gold-light"
        }`}>
          {timeLeft}
        </div>
      </div>

      <div className="glass-card p-6 animate-fade-up" key={q.id}>
        <QuestionMeta q={q} />
        <div className="mt-5">
          <QuestionBody q={q} />
        </div>
        <div className="mt-6 grid gap-3">
          {q.options.map((opt, i) => {
            const isCorrect = reveal && i === q.answer;
            const isWrong = reveal && chosen === i && i !== q.answer;
            return (
              <button
                key={i}
                onClick={() => void pick(i)}
                disabled={reveal || busy}
                className={`rounded-xl border-2 px-4 py-3.5 font-cairo font-bold text-right transition-all active:scale-[0.98] ${
                  isCorrect
                    ? "border-emerald2-light bg-emerald2/25 text-emerald2-light"
                    : isWrong
                    ? "border-maroon-light bg-maroon/30 text-white animate-shake"
                    : chosen === i
                    ? "border-gold bg-gold/15 text-gold-light"
                    : "border-gold-faint/40 bg-night-700/60 hover:border-gold/60"
                } disabled:cursor-default`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {reveal && chosen !== q.answer && lastChance && (
        <p className="text-center mt-4 text-maroon-light font-cairo font-bold animate-scale-in">
          استُخدمت الفرصة الأخيرة — أي غلطة جاية تنهي التحدي
        </p>
      )}
    </div>
  );
}
