import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Crown, Loader2, Timer, Users, XCircle, RotateCw, WifiOff } from "lucide-react";
import { subscribeMatch } from "../lib/matchApi";
import type { Match } from "../types/game";
import { TEAM_COLORS, LEVEL_POINTS } from "../types/game";
import ScoreBoard from "../components/ScoreBoard";
import QrCode from "../components/QrCode";
import GoldConfetti from "../components/GoldConfetti";
import { QuestionMeta, QuestionBody, OptionsDisplay } from "../components/QuestionCard";
import { sfx } from "../lib/sounds";

export default function TvScreen() {
  const { code = "" } = useParams();
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [portrait, setPortrait] = useState(false);
  const [connErr, setConnErr] = useState("");
  const prevPhase = useRef("");

  useEffect(() => subscribeMatch(code, setMatch, setConnErr), [code]);

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const players = useMemo(() => Object.values(match?.players ?? {}), [match]);

  useEffect(() => {
    if (!match || match.timer === 0 || match.state.phase !== "question" || !match.state.questionStartedAt) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, match.timer - Math.floor((Date.now() - match.state.questionStartedAt!) / 1000));
      setTimeLeft(left);
      if (left <= 5 && left > 0) sfx.tickFinal();
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [match]);

  useEffect(() => {
    if (!match) return;
    const ph = match.state.phase;
    if (prevPhase.current !== ph) {
      if (ph === "question") sfx.questionIn();
      if (ph === "locked") sfx.lock();
      if (ph === "revealed") match.state.isCorrect ? sfx.correct() : sfx.wrong();
      if (ph === "ended") sfx.fanfare();
      prevPhase.current = ph;
    }
    // صوت دخول لاعب
  }, [match]);
  const prevPlayers = useRef(0);
  useEffect(() => {
    if (players.length > prevPlayers.current) sfx.join();
    prevPlayers.current = players.length;
  }, [players.length]);

  if (connErr)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-night px-6 text-center">
        <WifiOff className="w-16 h-16 text-gold" />
        <p className="font-cairo font-bold text-2xl">تعذّر الاتصال بالمسابقة</p>
        <p className="text-sm text-muted-foreground">تأكد من الإنترنت ثم أعد تحميل الصفحة</p>
        <button onClick={() => window.location.reload()} className="btn-gold">إعادة المحاولة</button>
      </div>
    );
  if (match === undefined)
    return (
      <div className="min-h-dvh flex items-center justify-center bg-night">
        <Loader2 className="w-12 h-12 text-gold animate-spin" />
      </div>
    );
  if (match === null)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-night">
        <XCircle className="w-16 h-16 text-maroon-light" />
        <p className="font-cairo font-bold text-2xl">كود المسابقة غير صحيح</p>
      </div>
    );

  const st = match.state;
  const teams = match.teamOrder.map((c) => match.teams[c]).filter(Boolean);

  return (
    <div className="relative min-h-dvh overflow-hidden flex flex-col select-none">
      {/* خلفية المسرح */}
      <div className="fixed inset-0 -z-10">
        <img src="/img/stage-bg.jpg" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/60 via-night/55 to-night/80" />
      </div>

      {portrait && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-night-800/90 border border-gold/50 px-4 py-1.5 text-xs text-gold-light">
          <RotateCw className="w-3.5 h-3.5" />
          للأفضل: أدر الشاشة عرضياً
        </div>
      )}

      {/* الترويسة */}
      <header className="flex items-center justify-between gap-4 px-6 pt-4">
        <div className="flex items-center gap-3">
          <img src="/img/logo.png" alt="" className="w-12 h-12 drop-shadow-[0_0_14px_rgba(212,175,55,0.5)]" />
          <span className="font-black font-cairo text-2xl text-gold-gradient hidden sm:block">نقطة فوز</span>
        </div>
        <ScoreBoard match={match} highlight={st.targetTeam} big />
        <div className="w-28 text-left">
          {match.status === "playing" && (
            <span className="text-sm text-muted-foreground font-cairo">
              سؤال {st.round} / {match.totalRounds}
            </span>
          )}
        </div>
      </header>

      {/* المحتوى */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-8">
        {/* ═══ اللوبي ═══ */}
        {match.status === "lobby" && (
          <div className="flex flex-col items-center gap-6 animate-fade-up w-full">
            <h1 className="text-3xl sm:text-5xl font-black font-cairo text-gold-gradient drop-shadow-lg">
              امسح الكود وادخل مع فريقك
            </h1>
            <div className="flex flex-wrap justify-center gap-8">
              {teams.map((t) => {
                const c = TEAM_COLORS[t.color];
                const members = players.filter((p) => p.teamCode === t.code);
                return (
                  <div key={t.code} className="flex flex-col items-center gap-3 animate-scale-in">
                    <div
                      className="rounded-2xl px-6 py-2 border-2 font-cairo font-black text-2xl"
                      style={{ borderColor: c.hex, color: c.light, background: `${c.hex}22` }}
                    >
                      {t.name}
                    </div>
                    <QrCode value={`${location.origin}/play/${t.code}`} size={150} />
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      {members.length > 0 ? members.map((m) => m.name).join("، ") : "بانتظار اللاعبين…"}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground font-cairo animate-pulse">بانتظار المقدم يبدأ المسابقة…</p>
          </div>
        )}

        {/* ═══ بين الأسئلة ═══ */}
        {match.status === "playing" && (st.phase === "lobby" || !st.question) && (
          <div className="text-center animate-fade-up">
            <p className="text-muted-foreground text-xl mb-4">استعدوا… السؤال القادم لفريق</p>
            {st.targetTeam === null && match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]] && (
              <div
                className="inline-flex items-center gap-4 rounded-3xl px-12 py-6 border-2 animate-pulse-gold"
                style={{
                  borderColor: TEAM_COLORS[match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]].color].hex,
                  background: `${TEAM_COLORS[match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]].color].hex}22`,
                }}
              >
                <Crown className="w-10 h-10" style={{ color: TEAM_COLORS[match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]].color].light }} />
                <span
                  className="text-5xl font-black font-cairo"
                  style={{ color: TEAM_COLORS[match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]].color].light }}
                >
                  {match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]].name}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ═══ السؤال ═══ */}
        {st.question && st.phase !== "lobby" && st.phase !== "ended" && (
          <div className="w-full max-w-5xl flex flex-col items-center gap-5 animate-fade-up">
            <div className="flex items-center gap-4 flex-wrap justify-center">
              <QuestionMeta q={st.question} />
              <span className="rounded-full bg-gold/20 border border-gold/60 px-4 py-1 text-sm font-cairo font-bold text-gold-light">
                {st.passCount > 0 ? LEVEL_POINTS[st.question.level] / 2 : LEVEL_POINTS[st.question.level]} نقطة
                {st.passCount > 0 && " · سؤال مسروق"}
              </span>
              {timeLeft !== null && (
                <span className={`inline-flex items-center gap-2 rounded-full px-5 py-1.5 border-2 font-cairo font-black text-2xl ${
                  timeLeft <= 5 ? "border-maroon-light text-maroon-light animate-pulse" : "border-gold/60 text-gold-light"
                }`}>
                  <Timer className="w-5 h-5" />
                  {timeLeft}
                </span>
              )}
            </div>

            {st.targetTeam && match.teams[st.targetTeam] && (
              <div
                className="rounded-full px-8 py-2 border-2 font-cairo font-black text-2xl animate-scale-in"
                style={{
                  borderColor: TEAM_COLORS[match.teams[st.targetTeam].color].hex,
                  color: TEAM_COLORS[match.teams[st.targetTeam].color].light,
                  background: `${TEAM_COLORS[match.teams[st.targetTeam].color].hex}28`,
                }}
              >
                {st.phase === "locked"
                  ? `فريق ${match.teams[st.targetTeam].name} جاوب!`
                  : `السؤال لفريق ${match.teams[st.targetTeam].name}`}
              </div>
            )}

            <div className="glass-card w-full p-6 sm:p-8">
              <QuestionBody q={st.question} big reveal={st.phase === "revealed"} />
              <div className="mt-7">
                <OptionsDisplay
                  q={st.question}
                  big
                  chosen={st.phase === "revealed" ? st.answer?.choice ?? null : null}
                  reveal={st.phase === "revealed"}
                />
              </div>
            </div>

            {st.phase === "revealed" && (
              <div className={`text-3xl font-black font-cairo animate-scale-in ${
                st.isCorrect ? "text-emerald2-light" : "text-maroon-light"
              }`}>
                {st.isCorrect ? "إجابة صحيحة!" : st.answer ? "إجابة خاطئة!" : "انتهى الوقت بدون إجابة"}
              </div>
            )}
          </div>
        )}

        {/* ═══ النهاية ═══ */}
        {st.phase === "ended" && <TvEnding match={match} />}
      </main>
    </div>
  );
}

function TvEnding({ match }: { match: Match }) {
  const teams = match.teamOrder.map((c) => match.teams[c]).sort((a, b) => b.score - a.score);
  const isTie = teams.length > 1 && teams[0].score === teams[1].score;
  return (
    <div className="flex flex-col items-center gap-5 animate-fade-up">
      <GoldConfetti count={130} />
      <img src="/img/trophy.png" alt="" className="w-52 h-52 object-contain animate-float-slow drop-shadow-[0_0_60px_rgba(212,175,55,0.7)]" />
      <h1 className="text-4xl sm:text-6xl font-black font-cairo text-gold-gradient drop-shadow-lg text-center">
        {isTie ? "تعادل مثير!" : `${teams[0]?.name} بطل المسابقة`}
      </h1>
      <div className="flex gap-4 flex-wrap justify-center">
        {teams.map((t, i) => {
          const c = TEAM_COLORS[t.color];
          return (
            <div key={t.code} className="glass-card px-6 py-4 text-center" style={{ borderColor: `${c.hex}88` }}>
              <div className="text-xs text-muted-foreground">المركز {i + 1}</div>
              <div className="font-cairo font-black text-xl" style={{ color: c.light }}>{t.name}</div>
              <div className="font-cairo font-black text-3xl text-gold-gradient">{t.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
