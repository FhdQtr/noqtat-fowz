import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight, Minus, Plus, Crown, Timer, TimerOff, Layers, Loader2,
  Flag, Image as ImageIcon, Check, ListOrdered, Lightbulb, Quote, HelpCircle,
} from "lucide-react";
import { createMatch } from "../lib/matchApi";
import { sfx, unlockAudio } from "../lib/sounds";
import type { QuestionType } from "../types/game";
import { TEAM_COLORS } from "../types/game";

const TEAM_COLOR_ORDER = ["maroon", "emerald", "royal", "gold"] as const;

const TYPE_OPTIONS: { id: QuestionType; label: string; icon: typeof Flag }[] = [
  { id: "multiple_choice", label: "اختيار من متعدد", icon: HelpCircle },
  { id: "true_false", label: "صح أم خطأ", icon: Check },
  { id: "image", label: "معالم بالصور", icon: ImageIcon },
  { id: "flag", label: "أعلام الدول", icon: Flag },
  { id: "completion", label: "أكمل المثل", icon: Quote },
  { id: "ordering", label: "ترتيب", icon: ListOrdered },
  { id: "riddle", label: "ألغاز", icon: Lightbulb },
];

const ROUND_OPTIONS = [8, 12, 16, 20];

export default function HostSetup() {
  const nav = useNavigate();
  const [hostName, setHostName] = useState("");
  const [teamCount, setTeamCount] = useState(2);
  const [teamNames, setTeamNames] = useState<string[]>(["", ""]);
  const [totalRounds, setTotalRounds] = useState(12);
  const [timer, setTimer] = useState(0);
  const [types, setTypes] = useState<QuestionType[]>(TYPE_OPTIONS.map((t) => t.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
      const code = await createMatch({
        hostName,
        teamNames: teamNames.map((n, i) => n.trim() || `فريق ${["العنابي", "الأخضر", "الأزرق", "الذهبي"][i]}`),
        totalRounds,
        timer,
        enabledTypes: types,
      });
      sfx.correct();
      nav(`/host/${code}`);
    } catch (e) {
      console.error(e);
      setErr(`خطأ: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8">
      <div className="fixed inset-0 -z-10">
        <img src="/img/hero-bg.jpg" alt="" className="w-full h-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/80 via-night/90 to-night" />
      </div>

      <div className="w-full max-w-xl">
        <button onClick={() => nav("/")} className="flex items-center gap-2 text-muted-foreground hover:text-gold-light transition-colors mb-6">
          <ArrowRight className="w-4 h-4" />
          <span className="text-sm">رجوع</span>
        </button>

        <div className="glass-card p-6 sm:p-8 animate-fade-up">
          <div className="flex items-center gap-3 mb-6">
            <Crown className="w-7 h-7 text-gold-light" />
            <h1 className="text-2xl font-black font-cairo text-gold-gradient">إعداد المسابقة</h1>
          </div>

          {/* اسم المقدم */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">اسمك (المقدم)</label>
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

          {/* عدد الأسئلة */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">عدد الأسئلة</label>
          <div className="flex gap-2 mb-6">
            {ROUND_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setTotalRounds(n)}
                className={`flex-1 rounded-xl py-2.5 font-cairo font-bold border transition-all ${
                  totalRounds === n
                    ? "bg-gold/20 border-gold text-gold-light"
                    : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* المؤقت */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90">وقت الإجابة</label>
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTimer(0)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 font-cairo font-bold border transition-all ${
                timer === 0 ? "bg-gold/20 border-gold text-gold-light" : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
              }`}
            >
              <TimerOff className="w-4 h-4" />
              بدون مؤقت
            </button>
            <button
              onClick={() => setTimer(30)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 font-cairo font-bold border transition-all ${
                timer === 30 ? "bg-gold/20 border-gold text-gold-light" : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
              }`}
            >
              <Timer className="w-4 h-4" />
              ٣٠ ثانية
            </button>
          </div>

          {/* أنواع الأسئلة */}
          <label className="block text-sm font-bold mb-2 text-gold-light/90 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            أنواع الأسئلة
          </label>
          <div className="flex flex-wrap gap-2 mb-8">
            {TYPE_OPTIONS.map(({ id, label, icon: Icon }) => {
              const on = types.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleType(id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-cairo font-bold border transition-all ${
                    on
                      ? "bg-gold/20 border-gold text-gold-light"
                      : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>

          {err && (
            <div className="text-maroon-light text-sm font-bold bg-maroon/15 border border-maroon/40 rounded-xl px-4 py-2.5 mb-4">
              {err}
            </div>
          )}

          <button onClick={create} disabled={busy} className="btn-gold shine w-full text-lg flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crown className="w-5 h-5" />}
            {busy ? "جاري الإنشاء…" : "أنشئ المسابقة"}
          </button>
        </div>
      </div>
    </div>
  );
}
