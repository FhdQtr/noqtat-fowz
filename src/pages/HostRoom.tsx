import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Tv, Play, Users, Crown, ChevronLeft, Eye, Repeat2, SkipForward,
  Trophy, Loader2, LogOut, Timer, CheckCircle2, XCircle, Share2, Trash2,
} from "lucide-react";
import {
  subscribeMatch, startMatch, pushQuestion, revealAnswer,
  passToNextTeam, advanceTurn, endMatch, deleteMatch,
} from "../lib/matchApi";
import type { Match } from "../types/game";
import { TEAM_COLORS, LEVEL_POINTS } from "../types/game";
import ScoreBoard from "../components/ScoreBoard";
import QrCode from "../components/QrCode";
import GoldConfetti from "../components/GoldConfetti";
import { QuestionMeta, QuestionBody, OptionsDisplay } from "../components/QuestionCard";
import { sfx, unlockAudio } from "../lib/sounds";

export default function HostRoom() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const prevPhase = useRef<string>("");

  useEffect(() => subscribeMatch(code, setMatch), [code]);

  const players = useMemo(() => Object.values(match?.players ?? {}), [match]);

  // مؤقت السؤال (اختياري)
  useEffect(() => {
    if (!match || match.timer === 0 || match.state.phase !== "question" || !match.state.questionStartedAt) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - match.state.questionStartedAt!) / 1000);
      const left = Math.max(0, match.timer - elapsed);
      setTimeLeft(left);
      if (left <= 5 && left > 0) sfx.tick();
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [match]);

  // مؤثرات عند تغير المرحلة
  useEffect(() => {
    if (!match) return;
    const ph = match.state.phase;
    if (prevPhase.current !== ph) {
      if (ph === "locked") sfx.lock();
      if (ph === "revealed") match.state.isCorrect ? sfx.correct() : sfx.wrong();
      if (ph === "ended") sfx.fanfare();
      prevPhase.current = ph;
    }
  }, [match]);

  if (match === undefined)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gold animate-spin" />
      </div>
    );
  if (match === null)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <XCircle className="w-14 h-14 text-maroon-light" />
        <p className="font-cairo font-bold text-xl">المسابقة غير موجودة</p>
        <button onClick={() => nav("/")} className="btn-ghost-gold">العودة للرئيسية</button>
      </div>
    );

  const st = match.state;
  const teams = match.teamOrder.map((c) => match.teams[c]).filter(Boolean);
  const nextTeam = match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]];
  const winners = st.phase === "ended" ? [...teams].sort((a, b) => b.score - a.score) : [];
  const isTie = winners.length > 1 && winners[0].score === winners[1].score;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    unlockAudio();
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const shareTv = () => {
    const url = `${location.origin}/tv/${code}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ═══════════ شاشة النهاية ═══════════
  if (st.phase === "ended")
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 relative">
        <GoldConfetti />
        <div className="fixed inset-0 -z-10">
          <img src="/img/stage-bg.jpg" alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-night/80" />
        </div>
        <img src="/img/trophy.png" alt="الكأس" className="w-44 h-44 object-contain animate-float-slow drop-shadow-[0_0_44px_rgba(212,175,55,0.6)]" />
        <h1 className="mt-4 text-3xl sm:text-5xl font-black font-cairo text-gold-gradient text-center">
          {isTie ? "تعادل مثير!" : `الفائز: ${winners[0]?.name}`}
        </h1>
        {!isTie && winners[0] && (
          <p className="mt-2 text-gold-light font-cairo text-xl">{winners[0].score} نقطة</p>
        )}
        <div className="mt-8 glass-card p-6 w-full max-w-md">
          {winners.map((t, i) => {
            const c = TEAM_COLORS[t.color];
            return (
              <div key={t.code} className="flex items-center gap-3 py-2.5 border-b border-gold-faint/20 last:border-0">
                <span className="w-8 text-center font-black font-cairo text-gold-light">{i + 1}</span>
                <span className="w-3.5 h-3.5 rounded-full" style={{ background: c.light }} />
                <span className="flex-1 font-cairo font-bold">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.correctCount} صح · {t.wrongCount} غلط</span>
                <span className="font-black font-cairo text-gold-gradient text-xl">{t.score}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <button onClick={() => nav("/host")} className="btn-gold flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            مسابقة جديدة
          </button>
          <button onClick={() => nav("/")} className="btn-ghost-gold">الرئيسية</button>
          <button onClick={() => act(() => deleteMatch(code))} className="btn-ghost-gold !border-maroon/50 !text-maroon-light flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            حذف الغرفة
          </button>
        </div>
      </div>
    );

  // ═══════════ اللوبي (قبل البدء) ═══════════
  if (match.status === "lobby")
    return (
      <div className="min-h-dvh px-4 py-6 flex flex-col items-center">
        <div className="fixed inset-0 -z-10">
          <img src="/img/hero-bg.jpg" alt="" className="w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-night/85" />
        </div>

        <p className="text-sm text-muted-foreground">كود المسابقة</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-4xl sm:text-5xl font-black font-cairo tracking-[0.3em] text-gold-gradient" dir="ltr">{code}</span>
          <button onClick={shareTv} className="btn-ghost-gold !p-2" title="نسخ رابط شاشة العرض">
            {copied ? <CheckCircle2 className="w-5 h-5 text-emerald2-light" /> : <Share2 className="w-5 h-5" />}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          <button onClick={() => window.open(`/tv/${code}`, "_blank")} className="btn-gold flex items-center gap-2">
            <Tv className="w-5 h-5" />
            افتح شاشة العرض (التلفزيون)
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">كل لاعب يمسح QR حق فريقه ويدخل مباشرة</p>

        {/* بطاقات الفرق مع QR */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
          {teams.map((t) => {
            const c = TEAM_COLORS[t.color];
            const members = players.filter((p) => p.teamCode === t.code);
            return (
              <div
                key={t.code}
                className="glass-card p-5 flex flex-col items-center animate-fade-up"
                style={{ borderColor: `${c.hex}88` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-4 h-4 rounded-full" style={{ background: c.light, boxShadow: `0 0 10px ${c.light}` }} />
                  <h3 className="font-cairo font-black text-xl" style={{ color: c.light }}>{t.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3" dir="ltr">{t.code}</p>
                <QrCode value={`${location.origin}/play/${t.code}`} size={130} label="امسح للدخول" />
                <div className="mt-4 w-full">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <Users className="w-3.5 h-3.5" />
                    <span>{members.length} لاعب</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {members.map((p) => (
                      <span key={p.id} className="rounded-full px-3 py-1 text-xs font-bold font-cairo animate-scale-in"
                        style={{ background: `${c.hex}33`, color: c.light, border: `1px solid ${c.hex}66` }}>
                        {p.name}
                      </span>
                    ))}
                    {members.length === 0 && <span className="text-xs text-muted-foreground/60">بانتظار اللاعبين…</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => act(() => startMatch(code))}
          disabled={busy || players.length === 0}
          className="btn-gold shine mt-10 text-lg px-10 flex items-center gap-2"
        >
          <Play className="w-5 h-5" />
          {players.length === 0 ? "بانتظار دخول اللاعبين…" : "ابدأ المسابقة"}
        </button>
      </div>
    );

  // ═══════════ أثناء اللعب — تحكم المقدم ═══════════
  return (
    <div className="min-h-dvh px-4 py-5 flex flex-col max-w-3xl mx-auto w-full">
      <div className="fixed inset-0 -z-10">
        <img src="/img/stage-bg.jpg" alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-night/88" />
      </div>

      {/* الشريط العلوي */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-muted-foreground">
          سؤال <span className="text-gold-light font-bold">{st.round}</span> من {match.totalRounds}
        </div>
        <ScoreBoard match={match} highlight={st.targetTeam} />
        <div className="flex gap-2">
          <button onClick={() => window.open(`/tv/${code}`, "_blank")} className="btn-ghost-gold !p-2" title="شاشة العرض">
            <Tv className="w-4 h-4" />
          </button>
          <button onClick={() => act(() => endMatch(code))} className="btn-ghost-gold !p-2 !border-maroon/50 !text-maroon-light" title="إنهاء">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* بين الأسئلة */}
      {(st.phase === "lobby" || !st.question) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-up">
          {nextTeam && (
            <div className="text-center">
              <p className="text-muted-foreground mb-2">السؤال القادم لفريق</p>
              <div
                className="inline-flex items-center gap-3 rounded-2xl px-8 py-4 border-2 animate-pulse-gold"
                style={{ borderColor: TEAM_COLORS[nextTeam.color].hex, background: `${TEAM_COLORS[nextTeam.color].hex}22` }}
              >
                <Crown className="w-6 h-6" style={{ color: TEAM_COLORS[nextTeam.color].light }} />
                <span className="text-2xl font-black font-cairo" style={{ color: TEAM_COLORS[nextTeam.color].light }}>
                  {nextTeam.name}
                </span>
              </div>
            </div>
          )}
          <button
            onClick={() => act(() => pushQuestion(code, match))}
            disabled={busy}
            className="btn-gold shine text-xl px-12 py-4 flex items-center gap-3"
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <ChevronLeft className="w-6 h-6" />}
            نزّل السؤال
          </button>
        </div>
      )}

      {/* السؤال المعروض */}
      {st.question && st.phase !== "lobby" && (
        <div className="flex-1 flex flex-col gap-5 animate-fade-up">
          {/* شريط الدور */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {st.targetTeam && match.teams[st.targetTeam] && (
              <div
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 border font-cairo font-bold"
                style={{
                  borderColor: TEAM_COLORS[match.teams[st.targetTeam].color].hex,
                  color: TEAM_COLORS[match.teams[st.targetTeam].color].light,
                  background: `${TEAM_COLORS[match.teams[st.targetTeam].color].hex}22`,
                }}
              >
                <Crown className="w-4 h-4" />
                الدور: {match.teams[st.targetTeam].name}
                {st.passCount > 0 && <span className="text-xs opacity-80">(مسروق · نصف النقاط)</span>}
              </div>
            )}
            {timeLeft !== null && (
              <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 border font-cairo font-black ${
                timeLeft <= 5 ? "border-maroon-light text-maroon-light animate-pulse" : "border-gold-faint/60 text-gold-light"
              }`}>
                <Timer className="w-4 h-4" />
                {timeLeft}
              </div>
            )}
            <span className="text-xs text-muted-foreground">
              قيمة السؤال: {LEVEL_POINTS[st.question.level]} نقطة
            </span>
          </div>

          <div className="glass-card p-6">
            <QuestionMeta q={st.question} />
            <div className="mt-5">
              <QuestionBody q={st.question} reveal={st.phase === "revealed"} />
            </div>
            <div className="mt-6">
              <OptionsDisplay
                q={st.question}
                chosen={st.answer?.choice ?? null}
                reveal={st.phase === "revealed"}
              />
            </div>
          </div>

          {/* حالة الإجابة */}
          {st.phase === "question" && (
            <div className="text-center text-muted-foreground animate-pulse font-cairo">
              بانتظار إجابة فريق {match.teams[st.targetTeam!]?.name}…
              {timeLeft === 0 && <span className="block text-maroon-light font-bold mt-1">انتهى الوقت — انقل السؤال أو اكشف الإجابة</span>}
            </div>
          )}
          {st.phase === "locked" && st.answer && (
            <div className="glass-card !border-gold/60 p-4 flex items-center justify-center gap-3 animate-scale-in flex-wrap">
              <CheckCircle2 className="w-5 h-5 text-gold-light" />
              <span className="font-cairo">
                <strong className="text-gold-light">{st.answer.playerName}</strong> اختار:
                <strong className="text-gold-light"> «{st.question.options[st.answer.choice]}»</strong>
              </span>
            </div>
          )}
          {st.phase === "revealed" && (
            <div className={`glass-card p-4 text-center font-cairo font-black text-xl animate-scale-in ${
              st.isCorrect ? "!border-emerald2/70 text-emerald2-light" : "!border-maroon/70 text-maroon-light"
            }`}>
              {st.isCorrect
                ? `إجابة صحيحة! +${st.passCount > 0 ? LEVEL_POINTS[st.question.level] / 2 : LEVEL_POINTS[st.question.level]} نقطة`
                : st.answer
                ? "إجابة خاطئة"
                : "ما جاوب أحد"}
            </div>
          )}

          {/* أزرار التحكم */}
          <div className="flex flex-wrap gap-3 justify-center pb-4">
            {st.phase === "locked" && (
              <button onClick={() => act(() => revealAnswer(code, match))} disabled={busy} className="btn-gold shine flex items-center gap-2 text-lg px-8">
                <Eye className="w-5 h-5" />
                اكشف النتيجة
              </button>
            )}
            {st.phase === "question" && (
              <div className="flex gap-2 opacity-80">
                <button onClick={() => act(() => passToNextTeam(code, match))} disabled={busy} className="btn-ghost-gold !text-sm !px-4 !py-2 flex items-center gap-2">
                  <Repeat2 className="w-4 h-4" />
                  انقل للفريق التالي
                </button>
                <button onClick={() => act(() => advanceTurn(code, match))} disabled={busy} className="btn-ghost-gold !text-sm !px-4 !py-2 flex items-center gap-2">
                  <SkipForward className="w-4 h-4" />
                  تخطي السؤال
                </button>
              </div>
            )}
            {st.phase === "revealed" && (
              <>
                {!st.isCorrect && (
                  <button onClick={() => act(() => passToNextTeam(code, match))} disabled={busy} className="btn-maroon flex items-center gap-2 text-lg px-6">
                    <Repeat2 className="w-5 h-5" />
                    انقل السؤال لفريق ثاني
                  </button>
                )}
                <button onClick={() => act(() => advanceTurn(code, match))} disabled={busy} className="btn-gold shine flex items-center gap-2 text-lg px-8">
                  <SkipForward className="w-5 h-5" />
                  {st.round >= match.totalRounds ? "إعلان الفائز" : "السؤال التالي"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
