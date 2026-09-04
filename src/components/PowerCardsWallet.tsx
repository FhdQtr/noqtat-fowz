import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, CircleAlert, Clock3, CopyPlus, Hourglass, LockKeyhole, Snowflake, Swords,
  UserRoundCheck, WalletCards, X, Zap,
} from "lucide-react";
import type { Match, PowerCardId } from "../types/game";
import { POWER_CARD_LABEL, powerCardCost, TEAM_COLORS } from "../types/game";

const CARD_ORDER: PowerCardId[] = [
  "extraTime", "swapQuestion", "pickPlayer", "doublePoints", "freeze", "steal",
];

const CARD_COPY: Record<PowerCardId, { hint: string; moment: string; detail: string }> = {
  extraTime: { hint: "+١٥ ثانية لسؤالكم", moment: "بعد ظهور سؤال فريقكم وقبل تثبيت الإجابة", detail: "يضيف ١٥ ثانية إلى وقت السؤال الحالي. لا يعمل إذا كانت المسابقة بلا مؤقت أو في قسم مثّل المثل." },
  swapQuestion: { hint: "سؤال جديد بنفس القيمة", moment: "بعد ظهور سؤال فريقكم وقبل اختيار أي إجابة", detail: "يلغي السؤال الظاهر ويعطي فريقكم سؤالًا جديدًا من النوع والمستوى والقيمة نفسها." },
  pickPlayer: { hint: "اختار لاعبًا واحدًا يجاوب", moment: "أثناء سؤال الفريق الخصم وقبل أن يجيب", detail: "تختارون لاعبًا واحدًا من الخصم ليجيب وحده. يعمل في وضع «أي لاعب» عندما يكون في الفريق لاعبان أو أكثر." },
  doublePoints: { hint: "ضاعف نقاط السؤال القادم", moment: "في دور فريقكم وقبل اختيار نوع السؤال", detail: "إذا كانت إجابتكم صحيحة تحصلون على ضعف نقاط السؤال. رصيد الكروت يحصل على القيمة الأصلية فقط." },
  freeze: { hint: "امنع الخصم من استخدام كروته", moment: "في دور الخصم وقبل أن يختار نوع السؤال", detail: "يمنع الفريق صاحب الدور من استخدام أي كرت خلال سؤاله القادم." },
  steal: { hint: "اسرق السؤال بكامل نقاطه", moment: "بعد إجابة الخصم الخاطئة وقبل نقل السؤال", detail: "ينقل السؤال إلى فريقكم بكامل قيمته. لا يعمل في أسئلة صح أو خطأ ولا بعد أن يكون فريقكم قد حاول الإجابة." },
};

const CARD_ICON = {
  extraTime: Clock3,
  swapQuestion: CopyPlus,
  pickPlayer: UserRoundCheck,
  doublePoints: Zap,
  freeze: Snowflake,
  steal: Swords,
} satisfies Record<PowerCardId, typeof Clock3>;

interface Props {
  match: Match;
  teamCode: string;
  onUse: (card: PowerCardId, targetPlayerId?: string) => Promise<{ accepted: boolean; reason?: string }>;
}

type CardStatus = "ready" | "waiting" | "locked" | "used";

function timingReason(match: Match, teamCode: string, card: PowerCardId): string | null {
  const st = match.state;
  const mine = st.targetTeam === teamCode;
  if (st.cardUsedThisTurn) return "لا يمكن استخدامه لأن فريقًا استخدم كرتًا في هذا السؤال بالفعل.";
  if (st.cardsFrozenTeam === teamCode) return "لا يمكن استخدامه لأن كروت فريقكم مجمّدة في هذا السؤال.";
  if (card === "doublePoints") {
    if (st.phase !== "choose") return "هذا الكرت يُستخدم قبل ظهور السؤال فقط.";
    if (!mine) return "هذا الكرت يُستخدم في دور فريقكم فقط.";
    return null;
  }
  if (card === "extraTime") {
    if (st.phase !== "question") return "هذا الكرت يُستخدم بعد ظهور سؤال فريقكم.";
    if (!mine) return "لا يمكن زيادة وقت سؤال الفريق الخصم.";
    if (st.answer) return "لا يمكن زيادة الوقت بعد تثبيت الإجابة.";
    if (st.question?.type === "acting") return "قسم مثّل المثل له مؤقت خاص ولا يقبل زيادة الوقت.";
    if (!(st.questionDuration || match.timer)) return "هذه المسابقة تعمل بدون مؤقت، لذلك لا يمكن زيادة الوقت.";
    return null;
  }
  if (card === "swapQuestion") {
    if (st.phase !== "question") return "هذا الكرت يُستخدم بعد ظهور سؤال فريقكم.";
    if (!mine) return "لا يمكنكم تبديل سؤال الفريق الخصم.";
    if (st.answer) return "لا يمكن تبديل السؤال بعد تثبيت الإجابة.";
    return null;
  }
  if (card === "freeze") {
    if (st.phase !== "choose") return "التجميد يُستخدم قبل أن يختار الفريق الخصم نوع سؤاله.";
    if (mine) return "لا يمكنكم تجميد كروت فريقكم.";
    if (!st.targetTeam) return "لا يوجد فريق خصم مستهدف الآن.";
    return null;
  }
  if (card === "steal") {
    const attempted = new Set([...(st.attemptedTeams ?? []), ...(st.targetTeam ? [st.targetTeam] : [])]);
    if (st.phase !== "revealed" || st.isCorrect !== false) return "هذا الكرت يظهر بعد إجابة الفريق الخصم إجابة خاطئة.";
    if (mine) return "لا يمكن سرقة سؤال فريقكم نفسه.";
    if (st.question?.type === "true_false") return "أسئلة صح أو خطأ تنتهي مباشرة ولا يمكن سرقتها.";
    if (attempted.has(teamCode)) return "فريقكم حاول الإجابة على هذا السؤال سابقًا.";
    return null;
  }
  if (card === "pickPlayer") {
    const targetPlayers = Object.values(match.players ?? {}).filter((player) => player.teamCode === st.targetTeam);
    if (st.phase !== "question") return "هذا الكرت يُستخدم بعد ظهور سؤال الفريق الخصم.";
    if (mine) return "لا يمكنكم اختيار لاعب من فريقكم.";
    if (st.answer) return "لا يمكن اختيار لاعب بعد تثبيت الإجابة.";
    if (match.answerMode !== "anyone") return "يعمل هذا الكرت فقط عندما يكون نظام الإجابة «أي لاعب».";
    if (targetPlayers.length < 2) return "يحتاج الفريق الخصم إلى لاعبين اثنين على الأقل.";
    if (st.question?.type === "acting") return "لا يعمل هذا الكرت في قسم مثّل المثل.";
    if (st.question?.type === "flag" && !st.assistUsed) return "لا يعمل قبل إظهار خيارات سؤال العلم.";
    return null;
  }
  return "غير متاح الآن";
}

const FAILURE_MESSAGE: Record<string, string> = {
  balance: "رصيد الكروت غير كافٍ",
  used: "استخدمتم هذا الكرت سابقًا",
  frozen: "كروتكم مجمّدة في هذا السؤال",
  "turn-used": "تم استخدام كرت في هذا السؤال",
  empty: "لا يوجد سؤال بديل متاح",
  player: "اللاعب المختار غير متاح",
  busy: "سبقكم استخدام كرت آخر",
  timing: "انتهت فرصة استخدام هذا الكرت",
};

export default function PowerCardsWallet({ match, teamCode, onUse }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PowerCardId | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [balanceToast, setBalanceToast] = useState("");
  const team = match.teams[teamCode];
  const balance = team.cardBalance ?? 0;
  const questionsPerTeam = match.questionsPerTeam ?? Math.ceil(match.totalRounds / Math.max(1, match.teamOrder.length));
  const targetPlayers = useMemo(
    () => Object.values(match.players ?? {}).filter((player) => player.teamCode === match.state.targetTeam),
    [match.players, match.state.targetTeam],
  );
  const nextCost = CARD_ORDER
    .filter((card) => team.powerCards?.[card] !== false)
    .map((card) => powerCardCost(card, questionsPerTeam))
    .filter((cost) => cost > balance)
    .sort((a, b) => a - b)[0];
  const color = TEAM_COLORS[team.color];
  const previousBalance = useRef(balance);
  const cardViews = CARD_ORDER.map((card) => {
    const cost = powerCardCost(card, questionsPerTeam);
    const used = team.powerCards?.[card] === false;
    const affordable = balance >= cost;
    const reason = timingReason(match, teamCode, card);
    const ready = !used && affordable && !reason;
    const status: CardStatus = used ? "used" : ready ? "ready" : affordable ? "waiting" : "locked";
    return { card, cost, used, affordable, reason, ready, status, progress: Math.min(100, Math.round(balance / cost * 100)) };
  }).sort((a, b) => {
    const rank: Record<CardStatus, number> = { ready: 0, waiting: 1, locked: 2, used: 3 };
    return rank[a.status] - rank[b.status] || CARD_ORDER.indexOf(a.card) - CARD_ORDER.indexOf(b.card);
  });
  const readyCount = cardViews.filter((view) => view.status === "ready").length;
  const waitingCount = cardViews.filter((view) => view.status === "waiting").length;
  const lockedCount = cardViews.filter((view) => view.status === "locked").length;
  const pendingView = pending ? cardViews.find((view) => view.card === pending) ?? null : null;
  const PendingIcon = pending ? CARD_ICON[pending] : null;

  useEffect(() => {
    const gained = balance - previousBalance.current;
    previousBalance.current = balance;
    if (gained <= 0) return;
    setBalanceToast(`+${gained} في رصيد الكروت`);
    const timer = window.setTimeout(() => setBalanceToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [balance]);

  const confirmUse = async () => {
    if (!pending || !pendingView?.ready || (pending === "pickPlayer" && !targetPlayerId)) return;
    setBusy(true);
    setMessage("");
    const result = await onUse(pending, targetPlayerId || undefined);
    setBusy(false);
    if (result.accepted) {
      setPending(null);
      setTargetPlayerId("");
      setOpen(false);
      return;
    }
    setMessage(FAILURE_MESSAGE[result.reason ?? ""] ?? "تعذّر استخدام الكرت الآن");
  };

  const inspectCard = (card: PowerCardId) => {
    setPending(card);
    setTargetPlayerId("");
    setMessage("");
  };

  const closeCardDetails = () => {
    setPending(null);
    setTargetPlayerId("");
    setMessage("");
  };

  const closeWallet = () => {
    closeCardDetails();
    setOpen(false);
  };

  return (
    <>
      {balanceToast ? <div className="power-balance-toast">{balanceToast}</div> : null}
      <button
        type="button"
        className="power-wallet-trigger"
        style={{ "--team-card-color": color.light } as React.CSSProperties}
        onClick={() => { setMessage(""); setOpen(true); }}
        aria-label={`فتح كروت الفريق، الرصيد ${balance}`}
      >
        <WalletCards aria-hidden="true" />
        <span><b>{balance}</b><small>رصيد الكروت</small></span>
        {nextCost ? <em>باقي {nextCost - balance}</em> : <em>جاهز</em>}
      </button>

      {open ? (
        <div className="power-wallet-layer" role="dialog" aria-modal="true" aria-label="كروت الميدان">
          <button className="power-wallet-scrim" onClick={closeWallet} aria-label="إغلاق" />
          <section className="power-wallet-sheet">
            <header>
              <div className="power-wallet-title">
                <span><WalletCards /></span>
                <div><h2>كروت الميدان</h2><p>رصيدكم <strong>{balance}</strong> نقطة</p></div>
              </div>
              <button className="power-wallet-close" onClick={closeWallet} aria-label="إغلاق"><X /></button>
            </header>

            <div className="power-wallet-summary" aria-label="ملخص حالة الكروت">
              <span className="is-ready"><CheckCircle2 /> جاهز الآن <b>{readyCount}</b></span>
              <span className="is-waiting"><Hourglass /> ينتظر وقته <b>{waitingCount}</b></span>
              <span className="is-locked"><LockKeyhole /> مقفل <b>{lockedCount}</b></span>
            </div>

            <div className="power-card-grid">
              {cardViews.map(({ card, cost, used, affordable, reason, status, progress }) => {
                const Icon = CARD_ICON[card];
                const StatusIcon = status === "ready" ? CheckCircle2 : status === "waiting" ? Hourglass : LockKeyhole;
                return (
                  <button
                    type="button"
                    key={card}
                    className={`power-card is-${status}`}
                    onClick={() => inspectCard(card)}
                    aria-haspopup="dialog"
                  >
                    <span className="power-card-icon"><Icon /></span>
                    <span className="power-card-copy">
                      <strong>{POWER_CARD_LABEL[card]}</strong>
                      <small>{CARD_COPY[card].hint}</small>
                    </span>
                    <span className="power-card-cost">{cost}</span>
                    <span className="power-card-badge"><StatusIcon />{status === "ready" ? "جاهز للاستخدام الآن" : status === "waiting" ? "رصيدكم يكفي، انتظر وقته" : used ? "تم استخدامه" : "لم يُفتح بعد"}</span>
                    <span className="power-card-progress" aria-label={`التقدم ${progress}%`}><i style={{ width: `${progress}%` }} /><b>{progress}%</b></span>
                    <span className="power-card-state">
                      {used ? "لن يعود في هذه المسابقة" : !affordable ? `باقي ${cost - balance} نقطة للفتح` : reason ?? "اضغط لاستخدام الكرت"}
                    </span>
                    {!affordable && !used ? <LockKeyhole className="power-card-lock" /> : null}
                  </button>
                );
              })}
            </div>

          </section>

          {pending && pendingView && PendingIcon ? (
            <div className="power-card-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="power-card-dialog-title">
              <button className="power-card-dialog-scrim" type="button" onClick={closeCardDetails} aria-label="إغلاق تفاصيل الكرت" />
              <section className={`power-card-dialog is-${pendingView.status}`}>
                <button className="power-card-dialog-close" type="button" onClick={closeCardDetails} aria-label="إغلاق"><X /></button>
                <span className="power-card-dialog-icon"><PendingIcon /></span>
                <p className="power-card-dialog-kicker">كرت الميدان</p>
                <h3 id="power-card-dialog-title">{POWER_CARD_LABEL[pending]}</h3>
                <p className="power-card-dialog-detail">{CARD_COPY[pending].detail}</p>
                <dl className="power-card-dialog-facts">
                  <div><dt>وقت الاستخدام</dt><dd>{CARD_COPY[pending].moment}</dd></div>
                  <div><dt>تكلفة الكرت</dt><dd>{pendingView.cost} نقطة</dd></div>
                  <div><dt>رصيدكم</dt><dd>{balance} نقطة</dd></div>
                </dl>

                {!pendingView.ready ? (
                  <div className="power-card-dialog-warning">
                    <CircleAlert />
                    <div><b>لا يمكن استخدام الكرت الآن</b><p>{pendingView.used ? "تم استخدام هذا الكرت سابقًا ولن يعود في المسابقة نفسها." : !pendingView.affordable ? `رصيدكم غير كافٍ. تحتاجون ${pendingView.cost - balance} نقطة إضافية لفتحه.` : pendingView.reason}</p></div>
                  </div>
                ) : (
                  <div className="power-card-dialog-ready"><CheckCircle2 /> الكرت متاح الآن. لن يُخصم الرصيد إلا بعد التأكيد.</div>
                )}

                {pending === "pickPlayer" && pendingView.ready ? (
                  <div className="power-player-list">
                    <p>اختر اللاعب الذي سيجيب وحده:</p>
                    {targetPlayers.map((target) => (
                      <button type="button" key={target.id} className={targetPlayerId === target.id ? "is-selected" : ""} onClick={() => setTargetPlayerId(target.id)}>
                        {target.name}
                      </button>
                    ))}
                  </div>
                ) : null}

                {message ? <p className="power-wallet-message">{message}</p> : null}
                <div className={`power-confirm-actions ${pendingView.ready ? "" : "is-single"}`}>
                  {pendingView.ready ? <button type="button" onClick={closeCardDetails}>تراجع</button> : null}
                  <button type="button" disabled={busy || (pending === "pickPlayer" && !targetPlayerId)} onClick={pendingView.ready ? () => void confirmUse() : closeCardDetails}>
                    {pendingView.ready ? (busy ? "جاري التفعيل…" : "تأكيد استخدام الكرت") : "إغلاق"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
