import { useEffect, useState } from "react";

/** ساعة حيّة — تتحدث كل intervalMs طالما القيمة مو null (لعدّاد عرض الصور) */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!intervalMs) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}
