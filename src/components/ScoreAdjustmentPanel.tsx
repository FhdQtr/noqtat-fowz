import { useRef, useState } from "react";
import type { Match } from "../types/game";
import { adjustTeamScore } from "../lib/matchApi";

export default function ScoreAdjustmentPanel({ match, matchCode }: { match: Match; matchCode: string }) {
  const [team, setTeam] = useState(match.teamOrder[0]);
  const [mode, setMode] = useState("add");
  const [amount, setAmount] = useState("200");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (busy || !Number.isSafeInteger(value) || value <= 0 || value > 100000 || !reason.trim()) return;
    const delta = mode === "add" ? value : -value;
    const description = `${mode === "violation" ? "مخالفة" : "تصحيح من الحكم"}: ${reason.trim()}`;
    const key = JSON.stringify([team, delta, description]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage("");
    try {
      if (!await adjustTeamScore(matchCode, team, delta, description, request.current.id)) throw new Error("rejected");
      request.current = null;
      setMessage("تم تعديل النقاط وإبلاغ الفرق.");
      setReason("");
    } catch { setMessage("تعذّر تعديل النقاط. أعد المحاولة."); }
    finally { setBusy(false); }
  };
  return <details className="glass-card my-4 p-4 font-cairo">
    <summary className="cursor-pointer font-bold text-gold-light">تعديل نقاط الفرق</summary>
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label>الفريق<select disabled={busy} value={team} onChange={(event) => setTeam(event.target.value)} className="input-night mt-1 w-full">
        {match.teamOrder.map((code) => <option key={code} value={code}>{match.teams[code].name}</option>)}
      </select></label>
      <label>الإجراء<select disabled={busy} value={mode} onChange={(event) => setMode(event.target.value)} className="input-night mt-1 w-full">
        <option value="add">زيادة نقاط</option><option value="deduct">خصم نقاط</option><option value="violation">مخالفة وخصم نقاط</option>
      </select></label>
      <label>عدد النقاط<input disabled={busy} required type="number" inputMode="numeric" min="1" max="100000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="input-night mt-1 w-full" /></label>
      <label>السبب، يظهر للفرق<input disabled={busy} required maxLength={130} value={reason} onChange={(event) => setReason(event.target.value)} className="input-night mt-1 w-full" placeholder="مثال: تصحيح نتيجة السؤال" /></label>
      <button disabled={busy} className="btn-gold disabled:opacity-40 sm:col-span-2">{busy ? "جاري حفظ التعديل…" : "اعتماد تعديل النقاط"}</button>
      {message ? <p role="status" className="sm:col-span-2">{message}</p> : null}
    </form>
  </details>;
}
