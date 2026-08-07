import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Loader2, Users, XCircle, Crown, Lock, Hourglass, LogOut, WifiOff,
  Flag, Image as ImageIcon, Check, ListOrdered, Lightbulb, Quote, HelpCircle, Brain,
  MessageSquare, ListChecks, Eye, Drama,
} from "lucide-react";
import {
  subscribeMatch, joinTeam, leaveMatch, submitAnswer, chooseType, useAssist, typeProgress,
} from "../lib/matchApi";
import type { Match, Player, QuestionType } from "../types/game";
import { TEAM_COLORS, typeLabel, LEVEL_LABEL, viewSecondsFor } from "../types/game";
import ScoreBoard from "../components/ScoreBoard";
import { QuestionMeta } from "../components/QuestionCard";
import TimerRing from "../components/TimerRing";
import { sfx, unlockAudio } from "../lib/sounds";
import { useNow } from "../lib/useNow";

const STORAGE_KEY = "nf_player";

const TYPE_ICON: Record<QuestionType, typeof Flag> = {
  multiple_choice: HelpCircle,
  true_false: Check,
  image: ImageIcon,
  memory: Brain,
  flag: Flag,
  completion: Quote,
  ordering: ListOrdered,
  riddle: Lightbulb,
  acting: Drama,
};

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
  const [chooseMsg, setChooseMsg] = useState("");
  const [connErr, setConnErr] = useState("");
  const prevPhase = useRef("");
  const prevQid = useRef<number | null>(null);

  useEffect(() => subscribeMatch(matchCode, setMatch, setConnErr), [matchCode]);

  const team = match?.teams?.[teamCode];
  const st = match?.state;
  const isMyTurn = st?.phase === "question" && st.targetTeam === teamCode;
  const isMyChoose = st?.phase === "choose" && st.targetTeam === teamCode;

  // قائد الفريق — لو معيّن، هو الوحيد اللي يختار النوع ويجاوب
  const allPlayers = Object.values(match?.players ?? {});
  const captainIdRaw = team?.captainId ?? null;
  const captain = captainIdRaw ? allPlayers.find((p) => p.id === captainIdRaw) ?? null : null;
  const captainId = captain ? captainIdRaw : null; // لو القائد غادر نعتبرها بدون قائد
  const captainName = captain?.name ?? null;
  const isCaptain = !captainId || captainId === player?.id;

  // ساعة حيّة لعدّاد معاينة الصور
  const now = useNow(
    st?.viewUntil && (st.phase === "question" || st.phase === "locked") ? 250 : null
  );

  // تصفير الاختيار مع كل سؤال جديد أو مرحلة جديدة
  useEffect(() => {
    if (!st) return;
    const qid = st.question?.id ?? null;
    if (prevPhase.current !== st.phase || prevQid.current !== qid) {
      if (st.phase === "question" && (prevPhase.current !== "question" || prevQid.current !== qid)) {
        setMyPick(null);
        setStatus("");
        if (st.targetTeam === teamCode) sfx.questionIn();
      }
      if (st.phase === "choose") setChooseMsg("");
      if (st.phase === "revealed") st.isCorrect ? sfx.correct() : sfx.wrong();
      if (st.phase === "ended") sfx.fanfare();
      prevPhase.current = st.phase;
      prevQid.current = qid;
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
    if (!player || !isMyTurn || myPick !== null || !isCaptain) return;
    setMyPick(i);
    unlockAudio();
    const res = await submitAnswer(matchCode, player.id, player.name, i);
    setStatus(res === "accepted" ? "accepted" : "late");
    if (res === "accepted") sfx.lock();
  };

  const pickType = async (t: QuestionType) => {
    if (!isCaptain) return;
    unlockAudio();
    const res = await chooseType(matchCode, t);
    if (res === "late") setChooseMsg("سبقك واحد من فريقك بالاختيار");
    else if (res === "cap") setChooseMsg("خلص رصيدكم من هذا النوع — اختاروا نوع ثاني");
    else if (res === "accepted") sfx.lock();
  };

  const askAssist = async () => {
    unlockAudio();
    const ok = await useAssist(matchCode, teamCode);
    if (ok) sfx.questionIn();
  };

  if (connErr)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="w-14 h-14 text-gold" />
        <p className="font-cairo font-bold text-xl">تعذّر الاتصال بالمسابقة</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          جرّب فتح الرابط في متصفح كروم أو سفاري <span className="text-gold">العادي</span> — مو المتصفح الخاص (المتخفي) أو متصفح داخل تطبيق — وتأكد من الإنترنت
        </p>
        <button onClick={() => window.location.reload()} className="btn-gold">إعادة المحاولة</button>
        <button onClick={() => nav("/")} className="btn-ghost-gold">العودة للرئيسية</button>
      </div>
    );
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

  const q = st!.question;
  const visual = q ? viewSecondsFor(q) !== null : false; // مشاهدة أولاً: ذاكرة/أعلام/فيديو
  const viewing = !!(st!.viewUntil && now < st!.viewUntil);
  const viewLeft = st!.viewUntil ? Math.max(0, Math.ceil((st!.viewUntil - now) / 1000)) : 0;

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

        {/* ═══ اختيار نوع السؤال ═══ */}
        {match.status === "playing" && st!.phase === "choose" && (
          isMyChoose && !isCaptain ? (
            <div className="text-center animate-fade-up">
              <Crown className="w-10 h-10 text-gold-light mx-auto mb-3 animate-pulse" />
              <p className="font-cairo text-lg">
                القائد <strong className="text-gold-light">{captainName}</strong> يختار نوع السؤال…
              </p>
              <p className="text-xs text-muted-foreground mt-1">تناقشوا معه وقلوا له وش تبون</p>
            </div>
          ) : isMyChoose ? (
            <div className="w-full flex flex-col gap-4 animate-fade-up">
              <div className="text-center">
                <span className="inline-flex items-center gap-2 rounded-full px-5 py-2 border-2 font-cairo font-black animate-pulse-gold"
                  style={{ borderColor: c.hex, color: c.light, background: `${c.hex}22` }}>
                  <Crown className="w-4 h-4" />
                  دوركم — اختاروا نوع السؤال!
                </span>
                <p className="text-xs text-muted-foreground mt-2">أول واحد يضغط من فريقكم يحدد — كل نوع يصعب ونقاطه تزيد كل ما كررتوه</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {match.enabledTypes.map((t) => {
                  const pr = typeProgress(match, teamCode, t);
                  const Icon = TYPE_ICON[t] ?? HelpCircle;
                  return (
                    <button
                      key={t}
                      onClick={() => pickType(t)}
                      disabled={!pr.available}
                      className="glass-card p-4 flex flex-col items-center gap-1.5 transition-all hover:!border-gold/70 active:scale-[0.97] disabled:opacity-35"
                      style={{ borderColor: `${c.hex}66` }}
                    >
                      <Icon className="w-7 h-7 text-gold-light" />
                      <span className="font-cairo font-bold text-sm">{typeLabel(t)}</span>
                      <span className="text-xs text-muted-foreground">
                        {LEVEL_LABEL[pr.nextLevel]} · {pr.nextPoints} نقطة
                      </span>
                      <span className={`text-[11px] font-cairo font-bold ${pr.available ? "text-emerald2-light" : "text-maroon-light"}`}>
                        {pr.available ? `باقي ${pr.left}` : "اكتمل"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {chooseMsg && (
                <div className="flex items-center justify-center gap-2 text-maroon-light font-cairo animate-scale-in text-sm">
                  <XCircle className="w-4 h-4" />
                  {chooseMsg}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center animate-fade-up">
              <Hourglass className="w-10 h-10 text-gold-light mx-auto mb-3 animate-pulse" />
              <p className="font-cairo text-lg text-muted-foreground">
                {st!.targetTeam && match.teams[st!.targetTeam]
                  ? <>فريق <strong style={{ color: TEAM_COLORS[match.teams[st!.targetTeam].color].light }}>{match.teams[st!.targetTeam].name}</strong> يختار نوع السؤال…</>
                  : "استعدوا للسؤال القادم…"}
              </p>
            </div>
          )
        )}

        {/* السؤال */}
        {q && st!.phase !== "lobby" && st!.phase !== "choose" && (
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

                {/* معاينة الصورة (ذاكرة/أعلام) */}
                {visual && viewing && q.image && (
                  <div className="glass-card p-4 flex flex-col items-center gap-3">
                    <div className="relative overflow-hidden rounded-2xl border-2 border-gold/50 w-full">
                      <img src={q.image} alt="احفظوا الصورة" className="w-full object-cover aspect-[3/2]" />
                    </div>
                    <p className="font-cairo font-black text-gold-light text-lg animate-pulse">
                      احفظوا الصورة! باقي {viewLeft} ثواني
                    </p>
                  </div>
                )}

                {/* الفيديو يُعرض على الشاشة الكبيرة فقط */}
                {q.video && viewing && (
                  <div className="glass-card !border-gold/60 p-6 flex flex-col items-center gap-3 text-center">
                    <Eye className="w-10 h-10 text-gold-light animate-pulse" />
                    <p className="font-cairo font-black text-xl text-gold-light">
                      المقطع يُعرض على الشاشة الكبيرة — ركزوا!
                    </p>
                    <p className="text-sm text-muted-foreground">بعد انتهاء المقطع يظهر السؤال هنا</p>
                  </div>
                )}

                {/* بعد المعاينة أو سؤال عادي */}
                {(!visual || !viewing) && (
                  <>
                    {q.type === "acting" ? (
                      <div className="glass-card !border-gold/60 p-6 flex flex-col items-center gap-3 text-center animate-fade-up">
                        <Drama className="w-10 h-10 text-gold-light animate-pulse" />
                        <p className="font-cairo font-black text-xl text-gold-light">
                          الممثّل قدامكم يمثّل — خمّنوا المثل!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          قولوا تخمينكم بصوت عالي والمقدم يحكم
                        </p>
                      </div>
                    ) : (
                    <TimerRing
                      startedAt={st!.questionStartedAt ?? 0}
                      total={match.timer}
                      active={st!.phase === "question" && match.timer > 0}
                    >
                      <div className="glass-card p-5">
                        <QuestionMeta q={q} />
                        {/* صورة السؤال (خمّن الصورة / المعالم) تظهر للفريق صاحب الدور */}
                        {q.image && (!visual || viewing) && (
                          <div className="mt-4 overflow-hidden rounded-xl border-2 border-gold/40">
                            <img src={q.image} alt="صورة السؤال" className="w-full object-cover aspect-[3/2]" />
                          </div>
                        )}
                        <h2 className="mt-4 text-center font-cairo font-extrabold text-lg leading-relaxed">
                          {q.question}
                        </h2>
                      </div>
                    </TimerRing>
                    )}

                    {/* التمثيل: بلا خيارات — تخمين شفهي */}
                    {q.type === "acting" ? null : /* الأعلام: شفهي أولاً أو مساعدة الخيارات */
                    q.type === "flag" && !st!.assistUsed ? (
                      <div className="glass-card !border-gold/60 p-5 flex flex-col items-center gap-4 text-center">
                        <MessageSquare className="w-8 h-8 text-gold-light" />
                        <p className="font-cairo font-bold leading-relaxed">
                          قولوا الإجابة <span className="text-gold-light">شفهياً</span> للمقدم وخذوا الدرجة كاملة
                        </p>
                        <p className="text-xs text-muted-foreground">ما تعرفون؟ استخدموا المساعدة — الإجابة الصحيحة بربع النقاط فقط</p>
                        <button onClick={askAssist} className="btn-ghost-gold flex items-center gap-2">
                          <ListChecks className="w-5 h-5" />
                          اختيار من الإجابات (ربع النقاط)
                        </button>
                      </div>
                    ) : (
                      <>
                        {!isCaptain && (
                          <p className="text-center text-sm font-cairo text-gold-light/90 animate-fade-up">
                            تناقشوا مع بعض — القائد <strong>{captainName}</strong> هو اللي يثبّت الإجابة
                          </p>
                        )}
                        <div className={`grid gap-3 ${q.options.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {q.options.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => answer(i)}
                              disabled={myPick !== null || !isCaptain}
                              className={`rounded-xl border-2 px-4 py-4 font-cairo font-bold text-base transition-all active:scale-[0.97] ${
                                myPick === i
                                  ? "border-gold bg-gold/20 text-gold-light"
                                  : "border-gold-faint/40 bg-night-700/70 [@media(hover:hover)]:hover:border-gold/70 [@media(hover:hover)]:hover:bg-gold/10"
                              } disabled:opacity-60`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}

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
              <div className="text-center animate-fade-up w-full">
                {st!.phase === "locked" ? (
                  <>
                    <Lock className="w-10 h-10 text-gold-light mx-auto mb-3" />
                    <p className="font-cairo text-lg">
                      فريق <strong style={{ color: TEAM_COLORS[match.teams[st!.targetTeam!].color].light }}>{match.teams[st!.targetTeam!].name}</strong> جاوب — بانتظار الكشف…
                    </p>
                  </>
                ) : st!.phase === "revealed" ? (
                  <div className={`glass-card p-6 w-full text-center animate-scale-in ${
                    st!.isCorrect ? "!border-emerald2/60 animate-correct-glow" : "!border-maroon/60 animate-shake"
                  }`}>
                    <p className={`font-cairo font-black text-2xl ${st!.isCorrect ? "text-emerald2-light" : "text-maroon-light"}`}>
                      {st!.isCorrect ? "إجابة صحيحة" : "إجابة خاطئة"}
                    </p>
                    {/* الإجابة الصحيحة تظهر فقط إذا انتهى السؤال بإجابة صحيحة — عند الخطأ تبقى سرّية لأن السؤال ممكن ينتقل */}
                    {st!.isCorrect && q.type !== "acting" && q.options.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        الإجابة: <span className="text-emerald2-light font-bold">{q.options[q.answer]}</span>
                      </p>
                    )}
                  </div>
                ) : q.type === "acting" ? (
                  <div className="glass-card !border-gold/40 p-6 w-full text-center animate-fade-up">
                    <Drama className="w-10 h-10 text-gold-light mx-auto mb-3 animate-pulse" />
                    <p className="font-cairo font-bold text-lg">
                      فريق{" "}
                      <strong style={{ color: TEAM_COLORS[match.teams[st!.targetTeam!].color].light }}>
                        {match.teams[st!.targetTeam!].name}
                      </strong>{" "}
                      يمثّل مثل ويخمّنونه…
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">المثل سرّي — ما يظهر إلا بجهاز الممثّل</p>
                  </div>
                ) : (
                  /* ═══ باقي الفرق تشوف السؤال (قراءة فقط) — جهزوا إجابتكم لو انسرق! ═══ */
                  <div className="w-full flex flex-col gap-4 animate-fade-up">
                    <p className="text-center text-sm font-cairo text-muted-foreground">
                      السؤال عند فريق{" "}
                      <strong style={{ color: TEAM_COLORS[match.teams[st!.targetTeam!].color].light }}>
                        {match.teams[st!.targetTeam!].name}
                      </strong>
                      {" "}— لو غلطوا ممكن يجيكم!
                    </p>
                    <div className="glass-card p-5 opacity-90">
                      <QuestionMeta q={q} />
                      {q.image && (!visual || viewing) && (
                        <img src={q.image} alt="" className="mt-3 w-full rounded-xl object-cover aspect-[3/2] border border-gold-faint/40" />
                      )}
                      <h2 className="mt-4 text-center font-cairo font-extrabold text-lg leading-relaxed">
                        {q.question}
                      </h2>
                    </div>
                    {!(q.type === "flag" && !st!.assistUsed) && q.options.length > 0 && (
                      <div className={`grid gap-3 ${q.options.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className="rounded-xl border-2 border-gold-faint/25 bg-night-700/40 px-4 py-4 font-cairo font-bold text-base text-foreground/70 select-none"
                          >
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-center text-xs text-muted-foreground/70">قراءة فقط — ما تقدرون تجاوبون الحين</p>
                  </div>
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
