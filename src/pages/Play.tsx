import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Loader2, Users, XCircle, Crown, Lock, Hourglass, LogOut,
} from "lucide-react";
import { subscribeMatch, joinTeam, leaveMatch, submitAnswer } from "../lib/matchApi";
import type { Match, Player } from "../types/game";
import { TEAM_COLORS } from "../types/game";
import ScoreBoard from "../components/ScoreBoard";
import { QuestionMeta } from "../components/QuestionCard";
import { sfx, unlockAudio } from "../lib/sounds";

const STORAGE_KEY = "nf_player";

export default function Play() {
  const { teamCode = "" } = useParams();
  const nav = useNavigate();
  const matchCode = teamCode.split("-")[0]?.toUpperCase() ?? "";

  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [player, setPlayer] = useState<Player | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return saved?.teamCode === teamCode ? saved : null;
    } catch {
      return null;
    }
  });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [myPick, setMyPick] = useState<number | null>(null);
  const [status, setStatus] = useState<"" | "accepted" | "late">("");
  const prevPhase = useRef("");

  useEffect(() => subscribeMatch(matchCode, setMatch), [matchCode]);

  const team = match?.teams?.[teamCode];
  const st = match?.state;
  const isMyTurn = st?.phase === "question" && st.targetTeam === teamCode;

  // تصفير الاختيار مع كل سؤال جديد
  useEffect(() => {
    if (!st) return;
    if (prevPhase.current !== st.phase) {
      if (st.phase === "question") {
        setMyPick(null);
        setStatus("");
        if (st.targetTeam === teamCode) sfx.questionIn();
      }
      if (st.phase === "revealed") st.isCorrect ? sfx.correct() : sfx.wrong();
      if (st.phase === "ended") sfx.fanfare();
      prevPhase.current = st.phase;
    }
  }, [st, teamCode]);

  const players = useMemo(() => Object.values(match?.players ?? {}), [match]);
  const members = players.filter((p) => p.teamCode === teamCode);

  const join = async () => {
    if (!name.trim()) return;
    setBusy(true);
    unlockAudio();
    try {
      const p = await joinTeam(matchCode, teamCode, name);
      setPlayer(p);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      sfx.join();
    } finally {
      setBusy(false);
    }
  };

  const answer = async (i: number) => {
    if (!player || !isMyTurn || myPick !== null) return;
    setMyPick(i);
    unlockAudio();
    const res = await submitAnswer(matchCode, player.id, player.name, i);
    setStatus(res === "accepted" ? "accepted" : "late");
    if (res === "accepted") sfx.lock();
  };

  if (match === undefined)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gold animate-spin" />
      </div>
    );
  if (match === null || !team)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <XCircle className="w-14 h-14 text-maroon-light" />
        <p className="font-cairo font-bold text-xl">الكود غير صحيح أو المسابقة انتهت</p>
        <button onClick={() => nav("/")} className="btn-ghost-gold">العودة للرئيسية</button>
      </div>
    );

  const c = TEAM_COLORS[team.color];

  // ═══ شاشة الدخول ═══
  if (!player)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <div className="fixed inset-0 -z-10">
          <img src="/img/hero-bg.jpg" alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-night/85" />
        </div>
        <div className="glass-card w-full max-w-sm p-7 text-center animate-scale-in" style={{ borderColor: `${c.hex}88` }}>
          <span className="inline-block w-5 h-5 rounded-full mb-3" style={{ background: c.light, boxShadow: `0 0 16px ${c.light}` }} />
          <h1 className="text-2xl font-black font-cairo" style={{ color: c.light }}>
            فريق {team.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 mb-6">اكتب اسمك وادخل الساحة</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="اسمك…"
            className="input-night text-center mb-4"
            maxLength={20}
            autoFocus
          />
          <button onClick={join} disabled={busy || !name.trim()} className="btn-gold shine w-full flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crown className="w-5 h-5" />}
            ادخل المسابقة
          </button>
        </div>
      </div>
    );

  // ═══ النهاية ═══
  if (st!.phase === "ended") {
    const ranked = match.teamOrder.map((tc) => match.teams[tc]).sort((a, b) => b.score - a.score);
    const myRank = ranked.findIndex((t) => t.code === teamCode) + 1;
    const won = myRank === 1 && ranked[0].score > (ranked[1]?.score ?? -1);
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 text-center">
        <div className="fixed inset-0 -z-10">
          <img src="/img/stage-bg.jpg" alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-night/85" />
        </div>
        <img src="/img/trophy.png" alt="" className={`w-36 h-36 object-contain ${won ? "animate-float-slow drop-shadow-[0_0_40px_rgba(212,175,55,0.6)]" : "opacity-40 grayscale"}`} />
        <h1 className={`mt-4 text-3xl font-black font-cairo ${won ? "text-gold-gradient" : "text-foreground"}`}>
          {won ? "مبروك! فريقكم البطل" : `فريقكم بالمركز ${myRank}`}
        </h1>
        <p className="mt-2 text-gold-light font-cairo text-xl">{team.score} نقطة · {team.correctCount} إجابة صحيحة</p>
        <button
          onClick={async () => {
            await leaveMatch(matchCode, player.id);
            localStorage.removeItem(STORAGE_KEY);
            nav("/");
          }}
          className="btn-ghost-gold mt-8 flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          خروج
        </button>
      </div>
    );
  }

  // ═══ الشاشة الرئيسية للاعب ═══
  return (
    <div className="min-h-dvh flex flex-col">
      {/* شريط النتائج */}
      <header className="sticky top-0 z-30 bg-night/90 backdrop-blur-md border-b border-gold-faint/30 px-3 py-2.5">
        <ScoreBoard match={match} highlight={st!.targetTeam} />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-5 max-w-lg mx-auto w-full">
        {/* هوية اللاعب */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 rounded-full" style={{ background: c.light }} />
          <span className="font-cairo font-bold" style={{ color: c.light }}>{player.name}</span>
          <span className="text-muted-foreground">· فريق {team.name}</span>
        </div>

        {/* اللوبي */}
        {match.status === "lobby" && (
          <div className="glass-card w-full p-6 text-center animate-fade-up">
            <Users className="w-10 h-10 text-gold-light mx-auto mb-3" />
            <h2 className="font-cairo font-black text-xl">بانتظار بدء المسابقة</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">المقدم يجهز… جمعوا فريقكم</p>
            <div className="flex flex-wrap justify-center gap-2">
              {members.map((m) => (
                <span key={m.id} className="rounded-full px-3 py-1 text-xs font-bold font-cairo animate-scale-in"
                  style={{ background: `${c.hex}33`, color: c.light, border: `1px solid ${c.hex}66` }}>
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* بين الأسئلة */}
        {match.status === "playing" && (st!.phase === "lobby" || !st!.question) && (
          <div className="text-center animate-fade-up">
            <Hourglass className="w-10 h-10 text-gold-light mx-auto mb-3 animate-pulse" />
            <p className="font-cairo text-lg text-muted-foreground">استعدوا للسؤال القادم…</p>
          </div>
        )}

        {/* السؤال */}
        {st!.question && st!.phase !== "lobby" && (
          <>
            {isMyTurn ? (
              <div className="w-full flex flex-col gap-4 animate-fade-up">
                <div className="text-center">
                  <span className="inline-flex items-center gap-2 rounded-full px-5 py-2 border-2 font-cairo font-black animate-pulse-gold"
                    style={{ borderColor: c.hex, color: c.light, background: `${c.hex}22` }}>
                    <Crown className="w-4 h-4" />
                    دور فريقكم — جاوبوا!
                  </span>
                </div>
                <div className="glass-card p-5">
                  <QuestionMeta q={st!.question} />
                  <h2 className="mt-4 text-center font-cairo font-extrabold text-lg leading-relaxed">
                    {st!.question.question}
                  </h2>
                </div>
                <div className={`grid gap-3 ${st!.question.options.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {st!.question.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => answer(i)}
                      disabled={myPick !== null}
                      className={`rounded-xl border-2 px-4 py-4 font-cairo font-bold text-base transition-all active:scale-[0.97] ${
                        myPick === i
                          ? "border-gold bg-gold/20 text-gold-light"
                          : "border-gold-faint/40 bg-night-700/70 hover:border-gold/70 hover:bg-gold/10"
                      } disabled:opacity-50`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {status === "accepted" && (
                  <div className="flex items-center justify-center gap-2 text-gold-light font-cairo animate-scale-in">
                    <Lock className="w-4 h-4" />
                    انقفلت إجابتك — بانتظار المقدم يكشف
                  </div>
                )}
                {status === "late" && (
                  <div className="flex items-center justify-center gap-2 text-maroon-light font-cairo animate-scale-in">
                    <XCircle className="w-4 h-4" />
                    سبقك أحد من فريقك بالإجابة
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center animate-fade-up">
                {st!.phase === "locked" ? (
                  <>
                    <Lock className="w-10 h-10 text-gold-light mx-auto mb-3" />
                    <p className="font-cairo text-lg">
                      فريق <strong style={{ color: TEAM_COLORS[match.teams[st!.targetTeam!].color].light }}>{match.teams[st!.targetTeam!].name}</strong> جاوب — بانتظار الكشف…
                    </p>
                  </>
                ) : st!.phase === "revealed" ? (
                  <div className={`glass-card p-6 w-full text-center animate-scale-in ${
                    st!.isCorrect ? "!border-emerald2/60" : "!border-maroon/60"
                  }`}>
                    <p className={`font-cairo font-black text-2xl ${st!.isCorrect ? "text-emerald2-light" : "text-maroon-light"}`}>
                      {st!.isCorrect ? "إجابة صحيحة" : st!.answer ? "إجابة خاطئة" : "بدون إجابة"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      الإجابة: <span className="text-emerald2-light font-bold">{st!.question.options[st!.question.answer]}</span>
                    </p>
                  </div>
                ) : (
                  <>
                    <Hourglass className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-pulse" />
                    <p className="font-cairo text-lg text-muted-foreground">
                      السؤال عند فريق{" "}
                      <strong style={{ color: TEAM_COLORS[match.teams[st!.targetTeam!].color].light }}>
                        {match.teams[st!.targetTeam!].name}
                      </strong>
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">شاهدوا الشاشة الكبيرة</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* خروج */}
      <footer className="pb-4 flex justify-center">
        <button
          onClick={async () => {
            await leaveMatch(matchCode, player.id);
            localStorage.removeItem(STORAGE_KEY);
            nav("/");
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-maroon-light transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          مغادرة المسابقة
        </button>
      </footer>
    </div>
  );
}
