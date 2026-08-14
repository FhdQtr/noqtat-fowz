import { useEffect, useRef, useState } from "react";
import { sfx } from "../lib/sounds";

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
  const [secs, setSecs] = useState(Math.ceil(total));
  const raf = useRef(0);
  const fill = useRef<HTMLDivElement>(null);
  const lastSecond = useRef<number | null>(null);

  useEffect(() => {
    lastSecond.current = null;
    if (!active || total <= 0) {
      setSecs(Math.ceil(total));
      if (fill.current) fill.current.style.transform = "scaleX(1)";
      return;
    }

    const tick = () => {
      const l = Math.max(0, total - (Date.now() - startedAt) / 1000);
      const ratio = Math.min(1, Math.max(0, l / total));
      if (fill.current) fill.current.style.transform = `scaleX(${ratio})`;

      const second = Math.ceil(l);
      if (second !== lastSecond.current) {
        setSecs(second);
        if (second > 0 && second <= 5) sfx.tickFinal();
        if (second === 0 && lastSecond.current !== null) sfx.timeout();
        lastSecond.current = second;
      }
      if (l > 0) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, startedAt, total]);

  if (total <= 0) return null;

  const state = secs <= 5 ? "danger" : secs <= 10 ? "warning" : "safe";

  return (
    <div className={`m-live-timer m-live-timer--${state} ${big ? "m-live-timer--big" : ""} ${active ? "" : "opacity-40"}`} dir="ltr">
      <span
        className={`m-live-timer__number ${active && secs <= 5 ? "m-live-timer__number--pulse" : ""}`}
        aria-label={`باقي ${secs} ثانية`}
      >
        {secs}
      </span>
      <div className="m-live-timer__track">
        <div
          ref={fill}
          className="m-live-timer__fill"
        />
      </div>
    </div>
  );
}
