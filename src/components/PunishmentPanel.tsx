import { useEffect, useState } from "react";
import { Drama, Loader2, ShieldCheck, Swords, Timer, Wallet } from "lucide-react";
import type { Match } from "../types/game";
import { TEAM_COLORS } from "../types/game";
import { advanceTurn, getHostAnswer, runPunishmentAction } from "../lib/matchApi";
import { useServerNow } from "../lib/useServerNow";

export default function PunishmentPanel({ match, matchCode, teamCode, host = false, canControl = false }: {
  match: Match; matchCode: string; teamCode?: string; host?: boolean; canControl?: boolean;
}) {
  const p = match.state.punishment!;
  const q = match.state.question!;
  const [target, setTarget] = useState(match.teamOrder.find((code) => code !== p.byTeam) ?? "");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<"perform" | "deduct" | null>(null);
  const [hostAnswer, setHostAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = useServerNow(p.stage === "prepare" ? 250 : null);
  const left = now ? Math.max(0, Math.ceil((p.prepareUntil - now) / 1000)) : 60;
  const byTeam = match.teams[p.byTeam];
  const opponent = p.targetTeam ? match.teams[p.targetTeam] : null;
  const edit = canControl && teamCode === p.byTeam && p.stage === "prepare";
  const chooseOutcome = canControl && teamCode === p.targetTeam && p.stage === "failed" && !p.selectedMode;
  useEffect(() => {
    if (!host || p.stage !== "answering") return;
    let alive = true;
    void getHostAnswer(matchCode).then((value) => { if (alive) setHostAnswer(value); }).catch(() => { if (alive) setError("تعذّر تحميل الإجابة؛ أعد تحميل الصفحة قبل الحكم"); });
    return () => { alive = false; };
  }, [host, matchCode, q.id, p.stage]);
  const act = async (action: Parameters<typeof runPunishmentAction>[1], details: Record<string, unknown> = {}) => {
    setBusy(true); setError("");
    try { await runPunishmentAction(matchCode, action, q.id, details); }
    catch (cause) { setError((cause as { message?: string }).message || "تعذّر تثبيت الطلب، أعد المحاولة"); }
    finally { setBusy(false); }
  };
  return <section className="glass-card w-full max-w-4xl p-6 sm:p-9 border-2 !border-gold/60 flex flex-col items-center gap-5 text-center">
    <span className="inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-5 py-2 font-cairo font-black text-gold-light"><Swords className="h-6 w-6" /> سؤال وعقاب</span>
    <p className="font-cairo font-black text-xl" style={{ color: TEAM_COLORS[byTeam.color].light }}>فريق {byTeam.name} يتحدى {opponent ? `فريق ${opponent.name}` : "فريقًا منافسًا"}</p>
    {p.stage === "prepare" ? <>
      <div className="flex items-center gap-3 text-4xl font-black text-gold-light"><Timer className="h-8 w-8" /> {left} <small className="text-sm">ثانية لتجهيز السؤال والعقاب</small></div>
      {edit ? <form className="grid gap-4 w-full max-w-xl text-right" onSubmit={(event) => { event.preventDefault(); void act("preparePunishment", { targetTeam: target, prompt, answerText: answer, mode }); }}>
        {match.teamOrder.length > 2 ? <label>الفريق المنافس<select className="input-night mt-2" value={target} onChange={(event) => setTarget(event.target.value)}>{match.teamOrder.filter((code) => code !== p.byTeam).map((code) => <option key={code} value={code}>{match.teams[code].name}</option>)}</select></label> : null}
        <label>السؤال<textarea required className="input-night mt-2" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={500} /></label>
        <label>الإجابة الصحيحة للمقدم فقط<input required className="input-night mt-2" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={300} /></label>
        <fieldset className="rounded-2xl border border-gold/30 p-4">
          <legend className="px-2 font-bold text-gold-light">إذا أخطأ المنافس، ماذا يحصل؟</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className={`cursor-pointer rounded-xl border-2 p-4 text-center ${mode === "perform" ? "border-gold bg-gold/15 text-gold-light" : "border-white/15 text-muted-foreground"}`}>
              <input className="sr-only" type="radio" name="penalty-mode" value="perform" checked={mode === "perform"} onChange={() => setMode("perform")} required />
              <Drama className="mx-auto mb-2 h-8 w-8" />عقاب
            </label>
            <label className={`cursor-pointer rounded-xl border-2 p-4 text-center ${mode === "deduct" ? "border-maroon-light bg-maroon/20 text-white" : "border-white/15 text-muted-foreground"}`}>
              <input className="sr-only" type="radio" name="penalty-mode" value="deduct" checked={mode === "deduct"} onChange={() => setMode("deduct")} required />
              <Wallet className="mx-auto mb-2 h-8 w-8" />خصم ٢٠٠ نقطة
            </label>
          </div>
        </fieldset>
        <p className="text-sm text-muted-foreground">الإجابة الصحيحة تنجّي المنافس. عند الخطأ يُطبّق اختياركم: العقاب المتفق عليه أو خصم ٢٠٠ نقطة تلقائيًا.</p>
        <button className="btn-gold" disabled={busy || left === 0 || !mode}>{busy ? "جاري إرسال التحدي…" : "إرسال السؤال للخصم"}</button>
      </form> : <p className="text-muted-foreground">{left ? "الفريق يجهّز سؤاله وعقابه من جهاز الممثل…" : "انتهت دقيقة التجهيز؛ المقدم ينهي هذه الجولة"}</p>}
    </> : <>
      <h2 className="font-cairo font-black text-2xl sm:text-4xl leading-relaxed">{q.question}</h2>
      {p.penalty || p.selectedMode === "deduct" ? <div className="w-full rounded-2xl border border-maroon-light/40 bg-maroon/15 p-5"><p className="text-sm text-muted-foreground mb-2">العقاب المحدد قبل السؤال</p><strong className="font-cairo text-xl">{p.selectedMode === "deduct" ? "خصم ٢٠٠ نقطة عند الإجابة الخاطئة" : p.penalty}</strong></div> : null}
      {p.stage === "answering" ? <p className="text-gold-light font-bold">المنافس يجيب بصوت واضح، والمقدم يحكم</p> : null}
      {host && p.stage === "answering" ? <>
        <div className="w-full rounded-xl border border-gold/30 p-4 text-gold-light"><ShieldCheck className="inline h-5 w-5 ml-2" /> الإجابة الخاصة بالمقدم: {hostAnswer ?? "جاري التحميل…"}</div>
        <div className="flex flex-wrap justify-center gap-3"><button disabled={busy || !hostAnswer} className="btn-gold" onClick={() => void act("judgePunishment", { correct: true })}>إجابة صحيحة — نجوا من العقاب</button><button disabled={busy || !hostAnswer} className="btn-ghost-gold" onClick={() => void act("judgePunishment", { correct: false })}>إجابة خاطئة / لم يجيبوا</button></div>
      </> : null}
      {p.stage === "failed" ? <>
        <p className="font-cairo text-xl font-black text-maroon-light">{p.selectedMode === "perform" ? "حان وقت العقاب" : "الإجابة خاطئة — اختاروا العقاب أو خصم النقاط"}</p>
        {!p.selectedMode && p.requestedMode ? <p className="text-gold-light">اختيار المنافس: {p.requestedMode === "perform" ? "تنفيذ العقاب" : "خصم 200 نقطة"} · بانتظار تأكيد المقدم</p> : null}
        {host || chooseOutcome ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <button className="btn-ghost-gold flex items-center justify-center gap-2" disabled={busy} onClick={() => void act(host ? "resolvePunishment" : "requestPunishmentOutcome", { mode: "perform" })}><Drama className="h-6 w-6" />{host ? "تأكيد إتمام العقاب" : "ننفذ العقاب"}</button>
          {!p.selectedMode ? <button className="btn-gold flex items-center justify-center gap-2" disabled={busy} onClick={() => void act(host ? "resolvePunishment" : "requestPunishmentOutcome", { mode: "deduct" })}><Wallet className="h-6 w-6" />{host ? "تأكيد خصم 200 نقطة" : "نختار خصم 200 نقطة"}</button> : null}
        </div> : null}
      </> : null}
      {p.stage === "resolved" ? <p className="font-cairo font-black text-2xl text-gold-light">{p.mode === "cancelled" ? "أُنهيت الجولة بدون عقاب أو خصم" : match.state.isCorrect ? "إجابة صحيحة — نجوا من العقاب!" : p.mode === "deduct" ? "تم خصم 200 نقطة من المنافس" : "تم تنفيذ العقاب"}</p> : null}
    </>}
    {host && ["prepare", "answering"].includes(p.stage) ? <button className="btn-ghost-gold !text-sm" disabled={busy} onClick={() => void act("cancelPunishment")}>إنهاء الجولة دون عقاب أو خصم</button> : null}
    {host && p.stage === "resolved" ? <button className="btn-gold" disabled={busy} onClick={() => { setBusy(true); void advanceTurn(matchCode, match).catch(() => setError("تعذّر الانتقال للسؤال التالي")).finally(() => setBusy(false)); }}>متابعة المسابقة</button> : null}
    {busy ? <Loader2 className="h-5 w-5 animate-spin text-gold" /> : null}
    {error ? <p role="alert" className="font-bold text-maroon-light">{error}</p> : null}
  </section>;
}
