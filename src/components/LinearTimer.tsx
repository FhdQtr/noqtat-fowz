import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";

/**
 * مؤقت خط مستقيم + عدّاد تنازلي رقمي واضح — لشاشات المتسابقين
 * أخضر → ذهبي (آخر ١٠ ثوانٍ) → أحمر وينبض (آخر ٥ ثوانٍ)
 */
export default function LinearTimer({
  startedAt,
  total,
  active,
  big = false,
}: {
  startedAt: number; // طابع بدء السؤال (ms)
  total: number; // إجمالي الثواني (0 = بدون مؤقت)
  active: boolean;
  big?: boolean;
}) {
  const [left, setLeft] = useState(total);
  const raf = useRef(0);

  useEffect(() => {
    if (!active || total <= 0) {
      setLeft(total);
      return;
    }
    const tick = () => {
      const l = Math.max(0, total - (Date.now() - startedAt) / 1000);
      setLeft(l);
      if (l > 0) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, startedAt, total]);

  if (total <= 0) return null;

  const secs = Math.ceil(left);
  const pct = (left / total) * 100;
  const color = secs <= 5 ? "#e05260" : secs <= 10 ? "#d4af37" : "#3ddc84";

  return (
    <div className={`w-full flex items-center gap-3 ${active ? "" : "opacity-40"}`} dir="ltr">
      <span
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 font-cairo font-black tabular-nums ${
          big ? "text-2xl px-4 py-1" : "text-lg px-3 py-0.5"
        } ${active && secs <= 5 ? "animate-pulse" : ""}`}
        style={{ borderColor: color, color, minWidth: big ? 76 : 62, justifyContent: "center" }}
      >
        <Timer className={big ? "w-5 h-5" : "w-4 h-4"} />
        {secs}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 8px ${color}`,
            transition: "width 0.1s linear, background 0.3s",
          }}
        />
      </div>
    </div>
  );
}
