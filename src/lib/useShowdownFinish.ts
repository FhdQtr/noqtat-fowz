import { useCallback, useEffect, useRef, useState } from "react";
import type { Match } from "../types/game";
import { finishShowdown } from "./matchApi";
import { useServerNow } from "./useServerNow";

/** One sequential retry loop per participant, using the same clock as the panel. */
export function useShowdownFinish(code: string, match: Match | null | undefined, enabled = true) {
  const closesAt = match?.state.phase === "showdown" ? match.state.showdown?.closesAt : null;
  const questionId = match?.state.question?.id;
  const serverNow = useServerNow(enabled && closesAt ? 250 : null);
  const expired = Boolean(enabled && closesAt && serverNow >= closesAt + 300);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const retry = useCallback(() => retryRef.current?.(), []);

  useEffect(() => {
    setError("");
    setPending(false);
    if (!expired || questionId == null) return;
    let cancelled = false;
    let inFlight = false;
    let completed = false;
    let attempts = 0;
    let timer: number | undefined;
    const finish = async () => {
      if (cancelled || inFlight || completed) return;
      window.clearTimeout(timer);
      inFlight = true;
      setPending(true);
      try {
        completed = await finishShowdown(code, questionId);
        if (!cancelled) setError(completed ? "" : "لم تصل النتيجة بعد. تجري إعادة المحاولة تلقائيًا.");
      } catch {
        if (!cancelled) setError("تعذّر جلب النتيجة. تحقق من الاتصال واضغط إعادة حساب النتيجة.");
      } finally {
        inFlight = false;
        if (!cancelled) {
          setPending(false);
          if (!completed) timer = window.setTimeout(() => void finish(), Math.min(5000, 1500 * ++attempts));
        }
      }
    };
    const retryNow = () => { void finish(); };
    const onVisible = () => { if (document.visibilityState === "visible") retryNow(); };
    retryRef.current = retryNow;
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", onVisible);
    retryNow();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      retryRef.current = null;
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, expired, questionId]);

  return { error, pending, retry };
}
