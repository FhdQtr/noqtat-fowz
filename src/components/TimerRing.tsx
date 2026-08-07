import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * إطار مؤقّت حول بطاقة السؤال — خط يتناقص بسلاسة مع الوقت
 * أخضر → ذهبي (آخر 10 ثوانٍ) → أحمر (آخر 5 ثوانٍ)
 */
export default function TimerRing({
  startedAt,
  total,
  active,
  onTimeout,
  children,
}: {
  startedAt: number; // طابع بدء السؤال (ms)
  total: number; // إجمالي الثواني
  active: boolean; // يشتغل فقط أثناء phase السؤال
  onTimeout?: () => void;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState(1); // 1 → 0
  const fired = useRef(false);
  const raf = useRef(0);

  useEffect(() => {
    fired.current = false;
    if (!active || total <= 0) {
      setProgress(1);
      return;
    }
    const tick = () => {
      const left = Math.max(0, total - (Date.now() - startedAt) / 1000);
      setProgress(left / total);
      if (left <= 0) {
        if (!fired.current) {
          fired.current = true;
          onTimeout?.();
        }
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, startedAt, total]);

  const left = progress * total;
  const color = left <= 5 ? "#e05260" : left <= 10 ? "#d4af37" : "#3ddc84";
  const show = active && total > 0;

  return (
    <div className="relative w-full">
      {show && (
        <svg
          className="absolute -inset-2.5 w-[calc(100%+20px)] h-[calc(100%+20px)] pointer-events-none z-10"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <rect
            x="1" y="1" width="98" height="98" rx="7"
            fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.4"
            vectorEffect="non-scaling-stroke" pathLength={100}
          />
          <rect
            x="1" y="1" width="98" height="98" rx="7"
            fill="none" stroke={color} strokeWidth={left <= 5 ? 2.4 : 1.8}
            vectorEffect="non-scaling-stroke" pathLength={100}
            strokeDasharray="100" strokeDashoffset={(1 - progress) * 100}
            strokeLinecap="round"
            style={{
              transition: "stroke 0.3s",
              filter: `drop-shadow(0 0 6px ${color})`,
            }}
          />
        </svg>
      )}
      {children}
    </div>
  );
}
