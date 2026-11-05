import { useNavigate, useParams } from "react-router";
import {
  Tv, Users, Crown, Eye, Repeat2, SkipForward,
  Loader2, LogOut, Timer, CheckCircle2, XCircle, WifiOff,
  MessageSquare, EyeOff, Drama, Zap, ListChecks, PlayCircle,
} from "lucide-react";
import {
  revealAnswer, judgeVerbal,
  passToNextTeam, advanceTurn, endMatch, setCaptain,
  setAnswerMode, submitHostAnswer, startQuestionTimer, useAssist as requestAssist,
  isShowdownDue,
} from "../lib/matchApi";
import { TEAM_COLORS, viewSecondsFor, questionPoints, canPassQuestion, usesVerbalChoices } from "../types/game";
import ScoreBoard from "../components/ScoreBoard";
import { QuestionMeta, QuestionBody, OptionsDisplay } from "../components/QuestionCard";
import { unlockAudio } from "../lib/sounds";
import { ANSWER_LETTERS } from "../lib/answers";
import PowerCardEvent from "../components/PowerCardEvent";
import ShowdownPanel from "../components/ShowdownPanel";
import { useShowdownFinish } from "../lib/useShowdownFinish";
import PunishmentPanel from "../components/PunishmentPanel";
import ScoreAdjustmentPanel from "../components/ScoreAdjustmentPanel";
import { useAsyncAction } from "../lib/useAsyncAction";

import { PUBLIC_GAME_ORIGIN } from "../lib/links";
import { useHostRoom } from "./host/useHostRoom";
import HostLobby from "./host/HostLobby";
import HostResults from "./host/HostResults";
import AnswerModeControls from "./host/AnswerModeControls";

export default function HostRoom() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const { match, timeLeft, connErr, hostAnswer, invites, now } = useHostRoom(code);
  const { busy, error: actionError, run: runAction } = useAsyncAction();
  const players = Object.values(match?.players ?? {});
  const showdownFinish = useShowdownFinish(code, match);

  if (connErr)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="w-14 h-14 text-gold" />
        <p className="font-cairo font-bold text-xl">تعذّر الاتصال بالمسابقة</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          تأكد من الإنترنت، وإذا كنت فاتح الرابط في وضع التخفي أو متصفح داخل تطبيق، افتحه في متصفح عادي
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
  const chooseTeam =
    (st.targetTeam ? match.teams[st.targetTeam] : null) ??
    match.teams[match.teamOrder[match.turnIndex % match.teamOrder.length]];

  const visual = st.question ? viewSecondsFor(st.question) !== null : false;
  const viewing = !!(st.viewUntil && now < st.viewUntil);
  const viewLeft = st.viewUntil ? Math.max(0, Math.ceil((st.viewUntil - now) / 1000)) : 0;
  const showImage = !visual || viewing || st.phase === "revealed";
  const flagVerbal =
    usesVerbalChoices(st.question?.type) && st.phase === "question" && !st.assistUsed;
  // مثّل المثل: حكم شفهي دائماً (الفريق يخمّن والمقدم يحكم)
  const actingVerbal = st.question?.type === "acting" && st.phase === "question";
  const verbalJudge = flagVerbal || actingVerbal;
  const actingTimerWaiting = actingVerbal && !st.questionStartedAt;
  const hostCanSelect = match.answerMode === "host"
    && st.phase === "question"
    && st.question?.type !== "acting"
    && !(usesVerbalChoices(st.question?.type) && !st.assistUsed);
  const canPassAfterWrong = canPassQuestion(match);
  const awayPlayers = (st.phase === "question" || st.phase === "showdown") && st.question
    ? Object.entries(match.questionWatch ?? {}).flatMap(([playerId, watch]) => {
        if (watch.status !== "away" || watch.questionId !== st.question?.id) return [];
        const watchedPlayer = match.players?.[playerId];
        const watchedTeam = watchedPlayer ? match.teams[watchedPlayer.teamCode] : null;
        return watchedPlayer && watchedTeam ? [{ player: watchedPlayer, team: watchedTeam, awayAt: watch.awayAt ?? 0 }] : [];
      }).sort((left, right) => right.awayAt - left.awayAt)
    : [];

  const act = async (fn: () => Promise<unknown>) => {
    unlockAudio();
    await runAction(fn);
  };

  if (st.phase === "ended") return <HostResults match={match} code={code} />;
  if (match.status === "lobby") return <HostLobby match={match} code={code} invites={invites} />;

  // ═══════════ أثناء اللعب — تحكم المقدم ═══════════
  return (
    <div className="min-h-dvh px-4 py-5 flex flex-col max-w-3xl mx-auto w-full">
      {actionError && <p role="alert" className="mb-4 text-maroon-light font-bold">{actionError}</p>}
      <PowerCardEvent match={match} />
      <ScoreAdjustmentPanel match={match} matchCode={code} />
      <div className="fixed inset-0 -z-10">
        <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-night/88" />
      </div>

      {/* الشريط العلوي */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-muted-foreground">
          {st.phase === "showdown" || st.phase === "showdown_revealed" ? st.showdown?.kind === "picture_guess" ? "تحدي الصور" : "مواجهة الجميع" : <>سؤال <span className="text-gold-light font-bold">{st.round}</span> من {match.totalRounds}</>}
        </div>
        <ScoreBoard match={match} highlight={st.targetTeam} />
        <div className="flex gap-2">
          <button onClick={() => window.open(`${PUBLIC_GAME_ORIGIN}/tv/${code}${invites?.viewerKey ? `?key=${encodeURIComponent(invites.viewerKey)}` : ""}`, "_blank", "noopener,noreferrer")} className="btn-ghost-gold !p-2" title="شاشة العرض">
            <Tv className="w-4 h-4" />
          </button>
          <button onClick={() => act(() => endMatch(code))} className="btn-ghost-gold !p-2 !border-maroon/50 !text-maroon-light" title="إنهاء">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {match.tieBreaker?.active && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-gold/60 bg-gold/15 px-4 py-3 font-cairo font-black text-gold-light animate-pulse-gold">
          <Zap className="h-5 w-5" />
          ساحة الحسم — جولة فاصلة رقم {match.tieBreaker.cycle}
        </div>
      )}

      {awayPlayers.length > 0 ? (
        <div role="status" aria-live="assertive" className="mb-4 rounded-2xl border border-maroon-light/70 bg-maroon/20 px-4 py-3 shadow-[0_0_24px_rgba(176,32,71,0.18)] animate-scale-in">
          <div className="flex items-center gap-2 font-cairo font-black text-maroon-light">
            <EyeOff className="h-5 w-5" />
            تنبيه: مغادرة صفحة المسابقة أثناء السؤال
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {awayPlayers.map(({ player: awayPlayer, team: awayTeam }) => (
              <span key={awayPlayer.id} className="rounded-full border border-maroon-light/35 bg-black/20 px-3 py-1 text-sm font-cairo font-bold text-foreground">
                {awayPlayer.name} خرج من الصفحة · فريق {awayTeam.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className={st.phase === "showdown" || st.phase === "showdown_revealed" ? "hidden" : "mb-4"}>
        <AnswerModeControls
          value={match.answerMode ?? "anyone"}
          disabled={busy}
          compact
          onChange={(mode) => act(() => setAnswerMode(code, mode))}
        />
      </div>

      {(st.phase === "showdown" || st.phase === "showdown_revealed") ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-5">
          <ShowdownPanel match={match} matchCode={code} host size="regular" finishError={showdownFinish.error}
            finishing={showdownFinish.pending} onRetryFinish={showdownFinish.retry} />
          {st.phase === "showdown_revealed" ? (
            <button onClick={() => act(() => advanceTurn(code))} disabled={busy} className="btn-gold shine flex items-center gap-2 text-lg px-8">
              <SkipForward className="h-5 w-5" />
              {st.round >= match.totalRounds ? "إعلان الفائز" : "العودة للمسابقة"}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ممثلو الفرق — الحكم يقدر يغيّر الممثل في أي وقت */}
      <details className={`${st.phase === "showdown" || st.phase === "showdown_revealed" ? "hidden" : "mb-4"} glass-card !p-0 overflow-hidden`}>
        <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-cairo font-bold text-gold-light/90 flex items-center gap-2">
          <Crown className="w-3.5 h-3.5" />
          ممثلو الفرق — اضغط لتعيين أو تغيير من يثبت الإجابة
        </summary>
        <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-gold-faint/20">
          {teams.map((t) => {
            const c = TEAM_COLORS[t.color];
            const members = players.filter((p) => p.teamCode === t.code);
            return (
              <div key={t.code} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-cairo font-bold shrink-0" style={{ color: c.light }}>
                  {t.name}:
                </span>
                {members.length === 0 && <span className="text-[11px] text-muted-foreground/60">لا لاعبين</span>}
                {members.map((p) => {
                  const isCap = t.captainId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => act(() => setCaptain(code, t.code, isCap ? null : p.id))}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold font-cairo transition-all flex items-center gap-1 ${
                        isCap ? "ring-1 ring-gold" : "opacity-75 hover:opacity-100"
                      }`}
                      style={{
                        background: isCap ? "#d4af3730" : `${c.hex}2e`,
                        color: isCap ? "#f3dd9a" : c.light,
                        border: `1px solid ${isCap ? "#d4af37" : `${c.hex}55`}`,
                      }}
                    >
                      {isCap && <Crown className="w-2.5 h-2.5" />}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </details>

      {/* ═══ اختيار نوع السؤال ═══ */}
      {(st.phase === "choose" || st.phase === "lobby" || !st.question) && st.phase !== "showdown" && st.phase !== "showdown_revealed" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-up">
          {chooseTeam && (
            <div className="text-center">
              <p className="text-muted-foreground mb-2">الدور على فريق</p>
              <div
                className="inline-flex items-center gap-3 rounded-2xl px-8 py-4 border-2 animate-pulse-gold"
                style={{ borderColor: TEAM_COLORS[chooseTeam.color].hex, background: `${TEAM_COLORS[chooseTeam.color].hex}22` }}
              >
                <Crown className="w-6 h-6" style={{ color: TEAM_COLORS[chooseTeam.color].light }} />
                <span className="text-2xl font-black font-cairo" style={{ color: TEAM_COLORS[chooseTeam.color].light }}>
                  {chooseTeam.name}
                </span>
              </div>
              <p className="mt-3 text-sm text-gold-light/90 font-cairo font-bold">
                {match.answerMode === "representative"
                  ? "اختيار نوع السؤال متاح فقط لممثل الفريق من جهازه"
                  : "اختيار نوع السؤال متاح فقط لأعضاء الفريق من أجهزتهم"}
              </p>
            </div>
          )}

          {chooseTeam && (
            <div className="glass-card flex w-full max-w-lg flex-col items-center gap-3 px-6 py-8 text-center">
              <Users className="h-10 w-10 text-gold-light" />
              <p className="font-cairo text-lg font-black text-foreground">بانتظار اختيار الفريق…</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                عندما يختار أحد أعضاء {chooseTeam.name} نوع السؤال سيظهر السؤال هنا تلقائيًا
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ السؤال المعروض ═══ */}
      {st.question?.type === "punishment" && st.punishment ? <div className="max-w-4xl mx-auto mt-6"><PunishmentPanel key={st.question.id} match={match} matchCode={code} host /></div> : null}
      {st.question && st.question.type !== "punishment" && st.phase !== "lobby" && st.phase !== "choose" && st.phase !== "showdown" && st.phase !== "showdown_revealed" && (
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
                {st.passCount > 0 && <span className="text-xs opacity-80">({st.stealFullValue ? "سرقة الميدان · كامل النقاط" : "مسروق · نصف النقاط"})</span>}
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
              قيمة السؤال: {questionPoints(st)} نقطة
              {st.assistUsed ? " (نصف — ظهرت الخيارات)" : ""}
              {st.pointMultiplier === 2 ? " (بطاقة المضاعفة ×٢)" : ""}
            </span>
            {st.forcedPlayerName && st.phase === "question" ? (
              <span className="w-full text-center rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-cairo font-black text-gold-light">
                اللاعب الوحيد المسموح له بالإجابة: {st.forcedPlayerName}
              </span>
            ) : null}
          </div>

          {/* عدّاد المعاينة (صورة/مقطع) */}
          {visual && viewing && (
            <div className="glass-card !border-gold/60 p-3 flex items-center justify-center gap-3 animate-scale-in">
              <Eye className="w-5 h-5 text-gold-light" />
              <span className="font-cairo font-bold text-gold-light">
                {st.question?.video
                  ? "المقطع يُعرض على التلفزيون — اضغط التشغيل من شاشة العرض"
                  : `الصورة تُعرض — احفظوا! باقي ${viewLeft} ثواني`}
              </span>
            </div>
          )}
          {visual && !viewing && st.phase !== "revealed" && !st.question?.video && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <EyeOff className="w-4 h-4" />
              الصورة اختفت — على الفريق التذكّر
            </div>
          )}

          {/* مثّل المثل: المثل بارز للحكم — يورّيه للممثل فقط */}
          {st.question.type === "acting" && st.phase !== "revealed" && (
            <div className="glass-card !border-gold p-6 text-center animate-scale-in" style={{ boxShadow: "0 0 34px rgba(212,175,55,0.18)" }}>
              <div className="flex items-center justify-center gap-2 text-gold-light font-cairo font-bold mb-3">
                <Drama className="w-5 h-5" />
                ورِّ هالشاشة للممثّل فقط — لا أحد غيره يشوف
              </div>
              <p className="font-cairo font-black text-3xl sm:text-4xl leading-relaxed text-gold-gradient">
                «{st.question.question}»
              </p>
              {actingTimerWaiting ? (
                <button
                  onClick={() => act(() => startQuestionTimer(code))}
                  disabled={busy}
                  className="btn-gold shine mx-auto mt-5 flex items-center gap-2 text-lg"
                >
                  <PlayCircle className="h-5 w-5" />
                  ابدأ دقيقتين
                </button>
              ) : (
                <p className="mt-4 font-cairo font-bold text-gold-light">بدأ مؤقت الدقيقتين عند الجميع</p>
              )}
            </div>
          )}

          <div className="glass-card p-6">
            <QuestionMeta q={st.question} />
            <div className="mt-5">
              <QuestionBody q={st.question} reveal={st.phase === "revealed"} showImage={showImage} />
            </div>
            {/* المقدم يشوف الإجابة للحكم الشفهي في الأعلام */}
            {usesVerbalChoices(st.question.type) && st.phase !== "revealed" && (
              <p className="mt-3 text-center text-sm font-cairo font-bold text-emerald2-light">
                الإجابة الصحيحة: {hostAnswer?.questionId === st.question.id ? hostAnswer.answerText : "جاري التحميل…"}
              </p>
            )}
            {st.question.type === "brand" && hostAnswer?.questionId === st.question.id && hostAnswer.brandInfo && (
              <div className="mt-3 rounded-xl border border-gold/30 bg-gold/5 p-4 text-center text-sm leading-7">
                <p className="font-bold text-gold-light">للمقدم فقط: {hostAnswer.brandInfo.name}</p>
                <p>مجال الماركة: {hostAnswer.brandInfo.industry}</p>
                <p className="text-muted-foreground">أسماء مقبولة: {hostAnswer.brandInfo.acceptedNames.join("، ")}</p>
              </div>
            )}
            {/* خيارات الأعلام مخفية حتى يطلبوا المساعدة — والتمثيل بلا خيارات أصلاً */}
            {st.question.type !== "acting" &&
              !(usesVerbalChoices(st.question.type) && !st.assistUsed && st.phase !== "revealed") && (
              <div className="mt-6">
                {hostCanSelect ? (
                  <div className="m-answer-grid" data-count={st.question.options.length} data-size="regular">
                    {st.question.options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => act(() => submitHostAnswer(code, index))}
                        disabled={busy}
                        className="m-answer-option m-answer-option--interactive"
                        data-state="default"
                      >
                        <span className="m-answer-option__label" aria-hidden="true">{ANSWER_LETTERS[index]}</span>
                        <span className="m-answer-option__text">{option}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <OptionsDisplay
                    q={st.question}
                    chosen={st.answer?.choice ?? null}
                    reveal={st.phase === "revealed"}
                  />
                )}
              </div>
            )}
          </div>

          {/* حالة الإجابة */}
          {st.phase === "question" && !verbalJudge && (
            <div className="text-center text-muted-foreground animate-pulse font-cairo">
              بانتظار إجابة فريق {match.teams[st.targetTeam!]?.name}…
              {timeLeft === 0 && <span className="block text-maroon-light font-bold mt-1">انتهى الوقت — تخطَّ السؤال أو ثبّت الإجابة</span>}
            </div>
          )}
          {verbalJudge && (
            <div className="glass-card !border-gold/60 p-5 flex flex-col items-center gap-4 animate-fade-up">
              <div className="flex items-center gap-2 font-cairo font-bold text-gold-light">
                {actingVerbal ? <Drama className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                {actingVerbal
                  ? "الممثل يمثّل والفريق يخمّن — اسمعهم واحكم"
                  : "اسمع إجابة الفريق الشفهية واحكم عليها — الدرجة كاملة"}
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                <button
                  onClick={() => act(() => judgeVerbal(code, true))}
                  disabled={busy || viewing || actingTimerWaiting}
                  className="btn-gold shine flex items-center gap-2 text-lg px-8"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  أجابوا صح
                </button>
                <button
                  onClick={() => act(() => judgeVerbal(code, false))}
                  disabled={busy || viewing || actingTimerWaiting}
                  className="btn-maroon flex items-center gap-2 text-lg px-8"
                >
                  <XCircle className="w-5 h-5" />
                  أجابوا خطأ
                </button>
              </div>
              {flagVerbal && (
                <>
                  <button
                    onClick={() => act(() => requestAssist(code, st.targetTeam!))}
                    disabled={busy || viewing}
                    className="btn-ghost-gold flex items-center gap-2"
                  >
                    <ListChecks className="h-4 w-4" />
                    إظهار 4 خيارات (نصف النقاط)
                  </button>
                  <p className="text-xs text-muted-foreground">إذا طلب الفريق الخيارات تصبح قيمة السؤال نصف النقاط</p>
                </>
              )}
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
                ? `إجابة صحيحة! +${questionPoints(st)} نقطة`
                : canPassAfterWrong
                ? "إجابة خاطئة — يمكن نقل السؤال لفريق آخر"
                : "إجابة خاطئة — انتهى السؤال بلا نقاط"}
            </div>
          )}

          {/* أزرار التحكم */}
          <div className="flex flex-wrap gap-3 justify-center pb-4">
            {st.phase === "locked" && (
              <button onClick={() => act(() => revealAnswer(code))} disabled={busy} className="btn-gold shine flex items-center gap-2 text-lg px-8">
                <Eye className="w-5 h-5" />
                اكشف النتيجة
              </button>
            )}
            {st.phase === "question" && (
              <div className="flex gap-2 opacity-80">
                <button onClick={() => act(() => advanceTurn(code))} disabled={busy} className="btn-ghost-gold !text-sm !px-4 !py-2 flex items-center gap-2">
                  <SkipForward className="w-4 h-4" />
                  تخطي السؤال
                </button>
              </div>
            )}
            {st.phase === "revealed" && (
              <>
                {canPassAfterWrong && (
                  <button onClick={() => act(() => passToNextTeam(code))} disabled={busy} className="btn-maroon flex items-center gap-2 text-lg px-6">
                    <Repeat2 className="w-5 h-5" />
                    انقل السؤال لفريق ثاني
                  </button>
                )}
                <button onClick={() => act(() => advanceTurn(code))} disabled={busy} className="btn-gold shine flex items-center gap-2 text-lg px-8">
                  <SkipForward className="w-5 h-5" />
                  {isShowdownDue(match) ? match.challengeMode === "picture_guess" ? "تحدي الصور" : "مواجهة الجميع" : st.round >= match.totalRounds ? "إعلان الفائز" : "السؤال التالي"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
