import { useEffect, useRef, type ReactNode } from "react";

/**
 * إطار وقت خفيف حول بطاقة السؤال.
 * الحركة تُرسم مباشرة على SVG ولا تعيد تصيير شجرة السؤال كل إطار.
 */
export default function TimerRing({
  startedAt,
  total,
  active,
  onTimeout,
  children,
}: {
  startedAt: number;
  total: number;
  active: boolean;
  onTimeout?: () => void;
  children: ReactNode;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const progress = useRef<SVGRectElement>(null);
  const fired = useRef(false);
  const raf = useRef(0);
  const lastSecond = useRef<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    fired.current = false;
    lastSecond.current = null;

    const setVisual = (ratio: number, seconds: number) => {
      progress.current?.style.setProperty("stroke-dashoffset", String((1 - ratio) * 100));
      if (wrapper.current && seconds !== lastSecond.current) {
        wrapper.current.dataset.tone = seconds <= 5 ? "danger" : seconds <= 10 ? "warning" : "safe";
        lastSecond.current = seconds;
      }
    };

    if (!active || total <= 0) {
      setVisual(1, Math.ceil(total));
      return;
    }

    const tick = () => {
      const left = Math.max(0, total - (Date.now() - startedAt) / 1000);
      const ratio = Math.min(1, Math.max(0, left / total));
      setVisual(ratio, Math.ceil(left));
      if (left <= 0) {
        if (!fired.current) {
          fired.current = true;
          onTimeoutRef.current?.();
        }
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, startedAt, total]);

  return (
    <div
      ref={wrapper}
      className="m-timer-ring"
      data-active={active && total > 0 ? "true" : "false"}
      data-tone="safe"
    >
      <svg
        className="m-timer-ring__svg"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <rect
          className="m-timer-ring__track"
          x="1"
          y="1"
          width="98"
          height="98"
          rx="7"
          pathLength={100}
          vectorEffect="non-scaling-stroke"
        />
        <rect
          ref={progress}
          className="m-timer-ring__progress"
          x="1"
          y="1"
          width="98"
          height="98"
          rx="7"
          pathLength={100}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {children}
    </div>
  );
}
