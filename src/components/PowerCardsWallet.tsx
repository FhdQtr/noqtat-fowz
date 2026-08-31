import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3, CopyPlus, LockKeyhole, Snowflake, Swords, UserRoundCheck,
  WalletCards, X, Zap,
} from "lucide-react";
import type { Match, PowerCardId } from "../types/game";
import { POWER_CARD_LABEL, powerCardCost, TEAM_COLORS } from "../types/game";

const CARD_ORDER: PowerCardId[] = [
  "extraTime", "swapQuestion", "pickPlayer", "doublePoints", "freeze", "steal",
];

const CARD_COPY: Record<PowerCardId, { hint: string; moment: string }> = {
  extraTime: { hint: "+١٥ ثانية لسؤالكم", moment: "أثناء سؤالكم" },
  swapQuestion: { hint: "سؤال جديد بنفس القيمة", moment: "قبل الإجابة" },
  pickPlayer: { hint: "اختار لاعبًا واحدًا يجاوب", moment: "أثناء سؤال الخصم" },
  doublePoints: { hint: "ضاعف نقاط السؤال القادم", moment: "قبل اختيار السؤال" },
  freeze: { hint: "امنع الخصم من استخدام كروته", moment: "قبل سؤال الخصم" },
  steal: { hint: "اسرق السؤال بكامل نقاطه", moment: "بعد خطأ الخصم" },
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

function timingReason(match: Match, teamCode: string, card: PowerCardId): string | null {
  const st = match.state;
  const mine = st.targetTeam === teamCode;
  if (st.cardUsedThisTurn) return "استُخدم كرت في هذا السؤال";
  if (st.cardsFrozenTeam === teamCode) return "كروتكم مجمّدة";
  if (card === "doublePoints") return st.phase === "choose" && mine ? null : "يُستخدم قبل اختيار السؤال";
  if (card === "extraTime") {
    if (st.phase !== "question" || !mine || st.answer) return "يُستخدم أثناء سؤالكم";
    if (st.question?.type === "acting" || !(st.questionDuration || match.timer)) return "غير متاح لهذا السؤال";
    return null;
  }
  if (card === "swapQuestion") return st.phase === "question" && mine && !st.answer ? null : "يُستخدم قبل الإجابة";
  if (card === "freeze") return st.phase === "choose" && !mine && !!st.targetTeam ? null : "يُستخدم قبل اختيار الخصم";
  if (card === "steal") {
    const attempted = new Set([...(st.attemptedTeams ?? []), ...(st.targetTeam ? [st.targetTeam] : [])]);
    return st.phase === "revealed" && st.isCorrect === false && !mine && st.question?.type !== "true_false" && !attempted.has(teamCode)
      ? null
      : "يظهر بعد إجابة الخصم الخطأ";
  }
  if (card === "pickPlayer") {
    const targetPlayers = Object.values(match.players ?? {}).filter((player) => player.teamCode === st.targetTeam);
    const answerable = st.question?.type !== "acting" && !(st.question?.type === "flag" && !st.assistUsed);
    return st.phase === "question" && !mine && !st.answer && match.answerMode === "anyone" && targetPlayers.length >= 2 && answerable
      ? null
      : "يحتاج فريق خصم فيه لاعبان أو أكثر";
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

  useEffect(() => {
    const gained = balance - previousBalance.current;
    previousBalance.current = balance;
    if (gained <= 0) return;
    setBalanceToast(`+${gained} في رصيد الكروت`);
    const timer = window.setTimeout(() => setBalanceToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [balance]);

  const confirmUse = async () => {
    if (!pending || (pending === "pickPlayer" && !targetPlayerId)) return;
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
          <button className="power-wallet-scrim" onClick={() => setOpen(false)} aria-label="إغلاق" />
          <section className="power-wallet-sheet">
            <header>
              <div className="power-wallet-title">
                <span><WalletCards /></span>
                <div><h2>كروت الميدان</h2><p>رصيدكم <strong>{balance}</strong> نقطة</p></div>
              </div>
              <button className="power-wallet-close" onClick={() => setOpen(false)} aria-label="إغلاق"><X /></button>
            </header>

            <div className="power-card-grid">
              {CARD_ORDER.map((card) => {
                const Icon = CARD_ICON[card];
                const cost = powerCardCost(card, questionsPerTeam);
                const used = team.powerCards?.[card] === false;
                const affordable = balance >= cost;
                const reason = timingReason(match, teamCode, card);
                const ready = !used && affordable && !reason;
                const progress = Math.min(100, Math.round(balance / cost * 100));
                return (
                  <button
                    type="button"
                    key={card}
                    className={`power-card ${ready ? "is-ready" : ""} ${used ? "is-used" : ""}`}
                    onClick={() => { if (ready) { setPending(card); setMessage(""); } }}
                    disabled={!ready}
                  >
                    <span className="power-card-icon"><Icon /></span>
                    <span className="power-card-copy">
                      <strong>{POWER_CARD_LABEL[card]}</strong>
                      <small>{CARD_COPY[card].hint}</small>
                    </span>
                    <span className="power-card-cost">{cost}</span>
                    <span className="power-card-progress"><i style={{ width: `${progress}%` }} /></span>
                    <span className="power-card-state">
                      {used ? "تم الاستخدام" : !affordable ? `باقي ${cost - balance}` : reason ?? "جاهز للاستخدام"}
                    </span>
                    {!affordable && !used ? <LockKeyhole className="power-card-lock" /> : null}
                  </button>
                );
              })}
            </div>

            {pending ? (
              <div className="power-card-confirm">
                <div>
                  <b>{POWER_CARD_LABEL[pending]}</b>
                  <p>{CARD_COPY[pending].moment} · سيتم خصم {powerCardCost(pending, questionsPerTeam)} من رصيد الكروت</p>
                </div>
                {pending === "pickPlayer" ? (
                  <div className="power-player-list">
                    {targetPlayers.map((target) => (
                      <button
                        type="button"
                        key={target.id}
                        className={targetPlayerId === target.id ? "is-selected" : ""}
                        onClick={() => setTargetPlayerId(target.id)}
                      >
                        {target.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="power-confirm-actions">
                  <button type="button" onClick={() => { setPending(null); setTargetPlayerId(""); }}>تراجع</button>
                  <button type="button" disabled={busy || (pending === "pickPlayer" && !targetPlayerId)} onClick={() => void confirmUse()}>
                    {busy ? "جاري التفعيل…" : "استخدم الكرت"}
                  </button>
                </div>
              </div>
            ) : null}
            {message ? <p className="power-wallet-message">{message}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
