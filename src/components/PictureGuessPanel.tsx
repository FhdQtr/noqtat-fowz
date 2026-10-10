import { useEffect, useState } from "react";
import type { Match } from "../types/game";
import { getPictureGuessView, judgePictureGuess, startPictureGuessTimer, type PictureGuessView } from "../lib/matchApi";
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

export default function PictureGuessPanel({ match, matchCode, teamCode, host = false }: Props) {
  const q = match.state.question;
  const duel = match.state.showdown;
  const now = useServerNow(duel ? 250 : null);
  const [view, setView] = useState<PictureGuessView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const id = q?.id;
  const revealed = match.state.phase === "showdown_revealed";
  const waiting = !duel?.opensAt;
  const expired = Boolean(duel?.opensAt && now >= duel.closesAt);
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
  const pictures = view?.questionId === q.id ? view.pictures : {};
  const cards = host ? match.teamOrder : teamCode ? [teamCode] : [];
  const act = async (winner?: string) => {
    if (!matchCode || busy || revealed) return;
    setBusy(true); setError("");
    try {
      const accepted = winner === undefined
        ? await startPictureGuessTimer(matchCode, q.id)
        : await judgePictureGuess(matchCode, q.id, winner, winner ? "win" : "none");
      if (!accepted) setError("لم تُسجّل العملية؛ تحقق من حالة التحدي.");
    } catch { setError("تعذّر تسجيل العملية. أعد المحاولة."); }
    finally { setBusy(false); }
  };

  return <section className="glass-card w-full max-w-4xl border-gold/60 p-5 font-cairo">
    <h2 className="text-center text-xl font-black text-gold-light">تحدي الصور</h2>
    <p role="status" className="mt-3 text-center text-lg font-black text-gold-light">
      {revealed ? "انتهى التحدي" : waiting ? "بانتظار بدء الوقت من الحكم" : expired ? "انتهى الوقت، بانتظار نتيجة الحكم" : `${Math.max(0, Math.ceil((duel.closesAt - now) / 1000))} ثانية`}
    </p>
    {privateAccess && !view && !error ? <p className="mt-4 text-center" role="status">جاري تحميل الصور…</p> : null}
    <div className={`mt-5 grid gap-4 ${host ? "sm:grid-cols-2" : "grid-cols-1"}`}>
      {cards.map((code) => {
        const picture = pictures[code];
        if (!picture) return null;
        return <article key={code} className="rounded-2xl border border-gold-faint/50 p-3">
          <h3 className="mb-2 font-black">صورة فريق {match.teams[code].name}</h3>
          <img src={picture.image} alt={host ? picture.name : "صورة فريقكم"} className="aspect-square w-full rounded-xl bg-white object-contain p-4" />
          {host ? <p className="mt-2 text-center font-bold text-gold-light">{picture.name}</p> : null}
        </article>;
      })}
    </div>
    {!privateAccess ? <p className="my-6 text-center text-muted-foreground">الصور سرية على أجهزة الفرق والحكم.</p> : null}
    {host && waiting && !revealed ? <button disabled={busy || match.teamOrder.some((code) => !pictures[code])} onClick={() => void act()} className="btn-gold mt-5 w-full disabled:opacity-40">ابدأ الوقت · دقيقتان</button> : null}
    {host && expired && !revealed ? <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {match.teamOrder.map((code) => <button key={code} disabled={busy} onClick={() => void act(code)} className="btn-gold disabled:opacity-40">فريق {match.teams[code].name} فاز</button>)}
      <button disabled={busy} onClick={() => void act("")} className="btn-ghost-gold disabled:opacity-40">ما أحد فاز</button>
    </div> : null}
    {error ? <div role="alert" className="mt-4 text-center text-maroon-light"><p>{error}</p>{!view && privateAccess ? <button onClick={() => setRetry((v) => v + 1)} className="btn-ghost-gold mt-2">إعادة تحميل الصورة</button> : null}</div> : null}
    {revealed ? <p role="status" className="mt-5 text-center font-black text-gold-light">
      {duel.winnerTeam ? `فريق ${match.teams[duel.winnerTeam]?.name} فاز، +${duel.points} نقطة` : "ما أحد فاز"}
    </p> : null}
  </section>;
}
