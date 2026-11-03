import { useCallback, useEffect, useRef, useState } from "react";

/** Serialize button actions and report failures without unhandled rejections. */
export function useAsyncAction(message = "تعذّر تنفيذ الطلب. تحقق من الاتصال وأعد المحاولة.") {
  const active = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      if (mounted.current) setError(message);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [message]);

  return { busy, error, run };
}
