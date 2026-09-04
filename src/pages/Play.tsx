import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Loader2, Users, XCircle, Crown, Lock, Hourglass, LogOut, WifiOff,
  HelpCircle, MessageSquare, ListChecks, Eye, Drama, Zap,
} from "lucide-react";
import {
  subscribeMatch, joinTeam, leaveMatch, submitAnswer, chooseType, useAssist as requestAssist, usePowerCard as requestPowerCard, typeProgress,
  trackQuestionVisibility, submitShowdownAnswer, finishShowdown,
} from "../lib/matchApi";
import type { Match, Player, PowerCardId, QuestionType } from "../types/game";
import { TEAM_COLORS, typeLabel, LEVEL_LABEL, viewSecondsFor, questionTimerSeconds, canPassQuestion } from "../types/game";
import ScoreBoard from "../components/ScoreBoard";
import { QuestionMeta } from "../components/QuestionCard";
import LinearTimer from "../components/LinearTimer";
import { sfx, unlockAudio } from "../lib/sounds";
import { useNow } from "../lib/useNow";
import { ANSWER_LETTERS } from "../lib/answers";
import QuestionTypeIcon from "../components/QuestionTypeIcon";
import PowerCardsWallet from "../components/PowerCardsWallet";
import PowerCardEvent from "../components/PowerCardEvent";
import ShowdownPanel from "../components/ShowdownPanel";

const STORAGE_KEY = "al_midan_player";

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
  const [choosingType, setChoosingType] = useState<QuestionType | null>(null);
  const [cardMsg, setCardMsg] = useState("");
  const [connErr, setConnErr] = useState("");
  const [showdownSubmitting, setShowdownSubmitting] = useState(false);
  const [showdownMsg, setShowdownMsg] = useState("");
  const prevPhase = useRef("");
  const prevQid = useRef<number | null>(null);

  useEffect(() => subscribeMatch(matchCode, setMatch, setConnErr), [matchCode]);

  const team = match?.teams?.[teamCode];
  const st = match?.state;
  const isMyTurn = st?.phase === "question" && st.targetTeam === teamCode;
  const isMyChoose = st?.phase === "choose" && st.targetTeam === teamCode;
  const activeQuestionId = st?.phase === "question" || st?.phase === "showdown"
    ? st.question?.id ?? null
    : null;
  const showdownClosesAt = st?.phase === "showdown" ? st.showdown?.closesAt ?? null : null;

  // لا نعتمد على بقاء شاشة المقدم نشطة لإنهاء المواجهة بعد انتهاء الوقت.
  useEffect(() => {
    if (!player || !showdownClosesAt) return;
    let cancelled = false;
    let timer: number | undefined;
    const finish = async () => {
      if (cancelled) return;
      try {
        const completed = await finishShowdown(matchCode);
        if (!completed && !cancelled) timer = window.setTimeout(finish, 700);
      } catch {
        if (!cancelled) timer = window.setTimeout(finish, 1000);
      }
    };
    timer = window.setTimeout(finish, Math.max(0, showdownClosesAt - Date.now() + 500));
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [matchCode, player, showdownClosesAt]);

  useEffect(() => {
    if (!player || activeQuestionId === null) return;
    return trackQuestionVisibility(matchCode, player.id, activeQuestionId);
  }, [activeQuestionId, matchCode, player]);

  // ممثل الفريق يثبت الإجابة فقط؛ اختيار نوع السؤال متاح لكل أعضاء الفريق.
  const allPlayers = Object.values(match?.players ?? {});
  const captainIdRaw = team?.captainId ?? null;
  const captain = captainIdRaw ? allPlayers.find((p) => p.id === captainIdRaw) ?? null : null;
  const captainId = captain ? captainIdRaw : null; // لو القائد غادر نعتبرها بدون قائد
  const captainName = captain?.name ?? null;
  const answerMode = match?.answerMode ?? "anyone";
  const modeAllowsAnswer = answerMode === "host"
    ? false
    : answerMode === "representative"
      ? captainId === player?.id
      : true;
  // كرت «أنت اللي بتجاوب» يتقدم على وضع ممثل الفريق: المختار وحده يثبت الإجابة.
  const canAnswer = st?.forcedPlayerId
    ? st.forcedPlayerId === player?.id
    : modeAllowsAnswer;

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
      if (st.phase === "choose") {
        setChooseMsg("");
        setChoosingType(null);
      }
      if (st.phase === "revealed") {
        if (st.isCorrect) sfx.correct();
        else sfx.wrong();
      }
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
    if (!player || !isMyTurn || myPick !== null || !canAnswer) return;
    setMyPick(i);
    unlockAudio();
    const res = await submitAnswer(matchCode, player.id, player.name, i);
    setStatus(res === "accepted" ? "accepted" : "late");
    if (res === "accepted") sfx.lock();
  };

  const answerShowdown = async (choice: number) => {
    if (!player || showdownSubmitting || st?.showdown?.answers?.[teamCode]) return;
    setShowdownSubmitting(true);
    setShowdownMsg("");
    unlockAudio();
    const result = await submitShowdownAnswer(matchCode, player.id, choice);
    if (result.status === "early") setShowdownMsg("المواجهة لم تبدأ بعد");
    else if (result.status === "late") setShowdownMsg("سبقك لاعب من فريقك أو انتهت المواجهة");
    else if (result.status === "error") setShowdownMsg("تعذّر إرسال الإجابة، اضغط مرة ثانية");
    else sfx.lock();
    setShowdownSubmitting(false);
  };

  const pickType = async (t: QuestionType) => {
    if (choosingType) return;
    setChoosingType(t);
    setChooseMsg("جاري اختيار السؤال…");
    unlockAudio();
    let accepted = false;
    try {
      const res = await chooseType(matchCode, t);
      if (res === "late") setChooseMsg("سبقك واحد من فريقك بالاختيار");
      else if (res === "cap") setChooseMsg("خلص رصيدكم من هذا النوع — اختاروا نوع ثاني");
      else if (res === "empty") setChooseMsg("لا توجد أسئلة متاحة من هذا النوع والمستوى");
      else if (res === "error") setChooseMsg("تعذّر تحميل السؤال — اضغط مرة أخرى");
      else if (res === "accepted") {
        accepted = true;
        setChooseMsg("تم اختيار السؤال");
        sfx.lock();
      }
    } finally {
      // بعد قبول الطلب نبقي الأزرار مقفلة حتى تصل حالة السؤال من Firebase.
      // هذا يمنع النقر الثاني في بعض أجهزة أندرويد عند بطء التحديث اللحظي.
      if (!accepted) setChoosingType(null);
    }
  };

  const askAssist = async () => {
    unlockAudio();
    const ok = await requestAssist(matchCode, teamCode);
    if (ok) sfx.questionIn();
  };

  const activateCard = async (card: PowerCardId, targetPlayerId?: string) => {
    setCardMsg("");
    unlockAudio();
    const result = await requestPowerCard(matchCode, teamCode, card, targetPlayerId);
    if (result.accepted) {
      sfx.correct();
      setCardMsg("تم تفعيل الكرت");
    } else setCardMsg("تعذّر استخدام البطاقة الآن");
    return result;
  };

  if (connErr)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="w-14 h-14 text-gold" />
        <p className="font-cairo font-bold text-xl">تعذّر الاتصال بالمسابقة</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          جرّب فتح الرابط في متصفح كروم أو سفاري <span className="text-gold">العادي</span> — مو المتصفح الخاص (المتخفي) أو متصفح داخل تطبيق — وتأكد من الإنترنت
        </p>
        <p className="max-w-sm break-all rounded-lg border border-gold/20 bg-black/25 px-3 py-2 text-[11px] text-gold-light/80" dir="ltr">
          {connErr || "unknown-connection-error"}
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
          <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-30" />
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
          <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-30" />
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
  const timerTotal = questionTimerSeconds(match) + (st!.extraTimeUsed ? 15 : 0);
  const timerRunning = st!.phase === "question" && !!st!.questionStartedAt && !viewing;
  const actingTimerWaiting = q?.type === "acting" && st!.phase === "question" && !st!.questionStartedAt;
  const canPassAfterWrong = canPassQuestion(match);

  // ═══ الشاشة الرئيسية للاعب ═══
  return (
    <div className="min-h-dvh flex flex-col">
      <PowerCardEvent match={match} />
      {st!.phase !== "showdown" && st!.phase !== "showdown_revealed" ? (
        <PowerCardsWallet match={match} teamCode={teamCode} onUse={activateCard} />
      ) : null}
      {/* شريط النتائج */}
      <header className="sticky top-0 z-30 bg-night/90 backdrop-blur-md border-b border-gold-faint/30 px-3 py-2.5">
        <ScoreBoard match={match} highlight={st!.targetTeam} />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-5 max-w-lg mx-auto w-full">
        {match.tieBreaker?.active && (
          <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/60 bg-gold/15 px-4 py-3 font-cairo font-black text-gold-light animate-pulse-gold">
            <Zap className="h-5 w-5" /> ساحة الحسم — كل نقطة تصنع الفارق
          </div>
        )}
        {(st!.phase === "showdown" || st!.phase === "showdown_revealed") ? (
          <div className="flex w-full flex-col items-center gap-3">
            <ShowdownPanel match={match} teamCode={teamCode} submitting={showdownSubmitting} onAnswer={answerShowdown} />
            {showdownMsg ? <p className="text-center text-sm font-cairo font-bold text-maroon-light">{showdownMsg}</p> : null}
          </div>
        ) : null}
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
          isMyChoose ? (
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
                  return (
                    <button
                      key={t}
                      onClick={() => pickType(t)}
                      disabled={!pr.available || choosingType !== null}
                      className="glass-card p-4 flex flex-col items-center gap-1.5 transition-all hover:!border-gold/70 active:scale-[0.97] disabled:opacity-35 touch-manipulation"
                      style={{ borderColor: `${c.hex}66` }}
                    >
                      {choosingType === t
                        ? <Loader2 className="h-10 w-10 animate-spin text-gold-light" />
                        : t.startsWith("ct_")
                          ? <HelpCircle className="h-10 w-10 p-2 text-gold-light" />
                          : <QuestionTypeIcon type={t} className="h-12 w-12" />}
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
        {q && st!.phase !== "lobby" && st!.phase !== "choose" && st!.phase !== "showdown" && st!.phase !== "showdown_revealed" && (
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

                {cardMsg && <div className="arena-panel p-3 text-center text-xs font-bold text-gold-light">{cardMsg}</div>}

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
                        {actingTimerWaiting ? (
                          <p className="rounded-full border border-gold/50 bg-gold/10 px-4 py-2 font-cairo font-bold text-gold-light">
                            استعدوا — المقدم سيبدأ مؤقت الدقيقتين
                          </p>
                        ) : (
                          <div className="w-full">
                            <LinearTimer
                              startedAt={st!.questionStartedAt ?? 0}
                              total={timerTotal}
                              active={timerRunning}
                              big
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                    <>
                    {/* المؤقت: خط مستقيم + عد تنازلي — واضح للكل */}
                    {timerTotal > 0 && st!.questionStartedAt && (
                      <LinearTimer
                        startedAt={st!.questionStartedAt ?? 0}
                        total={timerTotal}
                        active={timerRunning}
                        big
                      />
                    )}
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
                    </>
                    )}

                    {/* التمثيل: بلا خيارات — تخمين شفهي */}
                    {q.type === "acting" ? null : /* الأعلام: شفهي أولاً أو مساعدة الخيارات */
                    q.type === "flag" && !st!.assistUsed ? (
                      <div className="glass-card !border-gold/60 p-5 flex flex-col items-center gap-4 text-center">
                        <MessageSquare className="w-8 h-8 text-gold-light" />
                        <p className="font-cairo font-bold leading-relaxed">
                          قولوا الإجابة <span className="text-gold-light">شفهياً</span> للمقدم وخذوا الدرجة كاملة
                        </p>
                        <p className="text-xs text-muted-foreground">ما تعرفون؟ اطلبوا الخيارات الأربعة بنصف قيمة السؤال</p>
                        <button onClick={askAssist} className="btn-ghost-gold flex items-center gap-2">
                          <ListChecks className="w-5 h-5" />
                          إظهار 4 خيارات (نصف النقاط)
                        </button>
                      </div>
                    ) : (
                      <>
                        {st!.forcedPlayerId === player.id ? (
                          <p className="rounded-2xl border border-gold/60 bg-gold/15 px-4 py-3 text-center font-cairo font-black text-gold-light animate-pulse-gold">
                            أنت المختار! الإجابة من جهازك أنت فقط 😂
                          </p>
                        ) : !canAnswer ? (
                          <p className="text-center text-sm font-cairo text-gold-light/90 animate-fade-up">
                            {st!.forcedPlayerId
                              ? <>الفريق المنافس اختار <strong>{st!.forcedPlayerName}</strong> يجاوب بروحه — ممنوع تساعدونه 😂</>
                              : answerMode === "host"
                              ? "تناقشوا مع بعض — المقدم هو الذي يثبت الإجابة"
                              : <>تناقشوا مع بعض — ممثل الفريق <strong>{captainName ?? "لم يُعيّن"}</strong> هو الذي يثبت الإجابة</>}
                          </p>
                        ) : null}
                        {st!.forcedPlayerId && !canAnswer ? null : (
                          <div className="m-answer-grid" data-count={q.options.length} data-size="regular">
                            {q.options.map((opt, i) => (
                              <button
                                key={i}
                                onClick={() => answer(i)}
                                disabled={myPick !== null || !canAnswer}
                                className="m-answer-option m-answer-option--interactive"
                                data-state={myPick === i ? "selected" : "default"}
                                aria-pressed={myPick === i}
                              >
                                <span className="m-answer-option__label" aria-hidden="true">{ANSWER_LETTERS[i]}</span>
                                <span className="m-answer-option__text">{opt}</span>
                              </button>
                            ))}
                          </div>
                        )}
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
                      {st!.isCorrect
                        ? "إجابة صحيحة"
                        : canPassAfterWrong
                          ? "إجابة خاطئة — السؤال ينتقل لفريق آخر"
                          : "إجابة خاطئة — انتهى السؤال بلا نقاط"}
                    </p>
                    {/* نخفي الحل أثناء إمكانية النقل، ونظهره عند انتهاء محاولات الفرق. */}
                    {(st!.isCorrect || !canPassAfterWrong) && q.type !== "acting" && q.options.length > 0 && (
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
                    {actingTimerWaiting ? (
                      <p className="mt-4 font-cairo font-bold text-gold-light">بانتظار المقدم يبدأ دقيقتين</p>
                    ) : (
                      <div className="mt-4">
                        <LinearTimer
                          startedAt={st!.questionStartedAt ?? 0}
                          total={timerTotal}
                          active={timerRunning}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  /* ═══ باقي الفرق تشوف السؤال (قراءة فقط) — جهزوا إجابتكم لو انسرق! ═══ */
                  <div className="w-full flex flex-col gap-4 animate-fade-up">
                    {timerTotal > 0 && st!.phase === "question" && st!.questionStartedAt && (
                      <LinearTimer
                        startedAt={st!.questionStartedAt ?? 0}
                        total={timerTotal}
                        active={timerRunning}
                      />
                    )}
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
                      <div className="m-answer-grid" data-count={q.options.length} data-size="regular">
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className="m-answer-option"
                            data-state="readonly"
                          >
                            <span className="m-answer-option__label" aria-hidden="true">{ANSWER_LETTERS[i]}</span>
                            <span className="m-answer-option__text">{opt}</span>
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
