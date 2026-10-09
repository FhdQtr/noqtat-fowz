import { useEffect, useState } from "react";
import { ImageIcon, RotateCw, Timer, Trophy } from "lucide-react";
import type { Match } from "../types/game";
import { getPictureGuessView, judgePictureGuess, type PictureGuessView } from "../lib/matchApi";
import { useServerNow } from "../lib/useServerNow";

interface Props {
  match: Match;
  matchCode?: string;
  teamCode?: string;
  host?: boolean;
  finishError?: string;
  finishing?: boolean;
  onRetryFinish?: () => void;
}

export default function PictureGuessPanel({ match, matchCode, teamCode, host = false, finishError, finishing, onRetryFinish }: Props) {
  const q = match.state.question;
  const duel = match.state.showdown;
  const now = useServerNow(duel ? 250 : null);
  const [view, setView] = useState<PictureGuessView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const id = q?.id;
  const revealed = match.state.phase === "showdown_revealed";
  const open = Boolean(duel && !revealed && now >= duel.opensAt && now < duel.closesAt);
  const expired = Boolean(duel && !revealed && now >= duel.closesAt);
  const privateAccess = Boolean(matchCode && (host || teamCode));

  useEffect(() => {
    setView(null); setError("");
    if (!privateAccess || !matchCode || id == null) return;
    let cancelled = false;
    void getPictureGuessView(matchCode, id).then((data) => {
      if (!cancelled && data.questionId === id) setView(data);
      else if (!cancelled) setError("تعذّر تحميل الصورة. أعد المحاولة.");
    }).catch(() => { if (!cancelled) setError("تعذّر تحميل الصورة. أعد المحاولة."); });
    return () => { cancelled = true; };
  }, [id, matchCode, privateAccess, retry]);

  if (!duel || !q) return null;
  const winner = duel.winnerTeam ? match.teams[duel.winnerTeam] : null;
  const feedback = duel.lastFeedback;
  const pictures = view?.questionId === q.id ? view.pictures : {};
  const cards = host ? match.teamOrder : teamCode ? [teamCode] : [];
  const judge = async (code: string, result: "yes" | "no" | "win") => {
    if (!matchCode || !open || busy) return;
    const target = pictures[code]?.targetTeam;
    if (result === "win" && !window.confirm(`تأكيد: فريق ${match.teams[code].name} خمن صورة ${target ? match.teams[target]?.name : "الفريق المنافس"} صح؟ سيحصل على ${duel.points} نقطة وينتهي التحدي.`)) return;
    setBusy(true); setError("");
    try {
      if (!await judgePictureGuess(matchCode, q.id, code, result)) setError("لم تُسجّل النتيجة؛ ربما انتهى الوقت أو تغيّر التحدي.");
    } catch { setError("تعذّر تسجيل النتيجة. أعد المحاولة."); }
    finally { setBusy(false); }
  };

  return <section className="glass-card w-full max-w-4xl border-gold/60 p-5 font-cairo">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-black text-gold-light"><ImageIcon className="h-6 w-6" />تحدي الصور #{duel.number}</h2>
      <span className="flex items-center gap-2 font-bold"><Trophy className="h-5 w-5 text-gold-light" />{duel.points} نقطة</span>
    </div>
    <p className="mt-3 text-center font-bold">اسألوا: «هل هو…؟» وخمّنوا صورة الفريق المنافس</p>
    <p className="mt-2 flex items-center justify-center gap-2 text-lg font-black text-gold-light"><Timer className="h-5 w-5" />
      {revealed ? "انتهى التحدي" : now < duel.opensAt ? `يبدأ بعد ${Math.max(0, Math.ceil((duel.opensAt - now) / 1000))} ثوانٍ` : expired ? "انتهى الوقت، جاري تثبيت النتيجة…" : `${Math.max(0, Math.ceil((duel.closesAt - now) / 1000))} ثانية`}
    </p>
    {privateAccess && !view && !error ? <p className="mt-4 text-center" role="status">جاري تحميل الصور الخاصة…</p> : null}
    <div className={`mt-5 grid gap-4 ${host ? "sm:grid-cols-2" : "grid-cols-1"}`}>
      {cards.map((code) => {
        const picture = pictures[code];
        if (!picture) return null;
        return <article key={code} className="rounded-2xl border border-gold-faint/50 p-3">
          <h3 className="mb-2 font-black">{host ? `صورة فريق ${match.teams[code].name}` : "هذه صورتكم، لا تكشفونها للمنافس"}</h3>
          <img src={picture.image} alt={host ? picture.name : "صورة فريقكم"} className="aspect-square w-full rounded-xl bg-white object-contain p-4" />
          {host ? <>
            <p className="mt-2 font-bold text-gold-light">{picture.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">فريق {match.teams[code].name} يحاول تخمين صورة {match.teams[picture.targetTeam]?.name}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button disabled={!open || busy} onClick={() => void judge(code, "yes")} className="btn-ghost-gold disabled:opacity-40">استفساره: صح</button>
              <button disabled={!open || busy} onClick={() => void judge(code, "no")} className="btn-ghost-gold disabled:opacity-40">استفساره: غلط</button>
            </div>
            <button disabled={!open || busy} onClick={() => void judge(code, "win")} className="btn-gold mt-2 w-full disabled:opacity-40">خمن صورة المنافس صح، منح النقاط</button>
          </> : <p className="mt-3 text-sm text-muted-foreground">خمنوا صورة {match.teams[picture.targetTeam]?.name}. الحكم يسجل الصح والغلط والفائز.</p>}
        </article>;
      })}
    </div>
    {!privateAccess ? <p className="my-6 text-center text-muted-foreground">الصور سرية على أجهزة الفرق. الحكم يشوف الصورتين، وأول فريق يخمّن صورة منافسه صح يفوز.</p> : null}
    {feedback && feedback.result !== "win" ? <p role="status" className="mt-4 rounded-xl border border-gold/40 p-3 text-center font-bold">جواب استفسار فريق {match.teams[feedback.teamCode]?.name}: {feedback.result === "yes" ? "صح" : "غلط"}</p> : null}
    {error ? <div role="alert" className="mt-4 text-center text-maroon-light"><p>{error}</p>{!view && privateAccess ? <button onClick={() => setRetry((v) => v + 1)} className="btn-ghost-gold mt-2">إعادة تحميل الصورة</button> : null}</div> : null}
    {expired && onRetryFinish ? <div className="mt-4 text-center"><p role="status">{finishError}</p><button onClick={onRetryFinish} disabled={finishing} className="btn-ghost-gold mt-2"><RotateCw className="inline h-4 w-4" /> تثبيت انتهاء الوقت</button></div> : null}
    {revealed ? <p role="status" className={`mt-5 rounded-xl border p-4 text-center font-black ${winner ? "border-emerald2 text-emerald2-light" : "border-maroon text-maroon-light"}`}>
      {winner ? `فريق ${winner.name} خمن الصورة صح، +${duel.points} نقطة` : "محد جاوب صح، نكمل المسابقة بدون نقاط للتحدي"}
    </p> : null}
  </section>;
}
