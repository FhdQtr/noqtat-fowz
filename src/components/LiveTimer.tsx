import { useEffect, useRef } from "react";

type LiveTimerProps = {
  duration: number;
  running: boolean;
  resetKey: number;
  compact?: boolean;
  onComplete: () => void;
};

export default function LiveTimer({
  duration,
  running,
  resetKey,
  compact = false,
  onComplete,
}: LiveTimerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<SVGCircleElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const progress = progressRef.current;
    const number = numberRef.current;
    if (!root || !progress || !number) return;

    let frame = 0;
    let completed = false;
    let lastSecond = duration;
    let lastPhase = "safe";
    const startedAt = performance.now();

    number.textContent = String(duration);
    progress.style.strokeDashoffset = "0";
    root.dataset.phase = "safe";

    if (!running) return;

    const draw = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      const ratio = duration > 0 ? remaining / duration : 0;
      const second = Math.ceil(remaining);
      const phase = remaining <= 5 ? "danger" : remaining <= 10 ? "warning" : "safe";

      progress.style.strokeDashoffset = String(100 - ratio * 100);
      if (second !== lastSecond) {
        number.textContent = String(second).padStart(2, "0");
        lastSecond = second;
      }
      if (phase !== lastPhase) {
        root.dataset.phase = phase;
        lastPhase = phase;
      }

      if (remaining <= 0) {
        if (!completed) {
          completed = true;
          onCompleteRef.current();
        }
        return;
      }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [duration, resetKey, running]);

  return (
    <div
      ref={rootRef}
      className={`live-timer${compact ? " live-timer--compact" : ""}`}
      data-phase="safe"
      role="timer"
      aria-label={`الوقت المتبقي ${duration} ثانية`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="live-timer__track" cx="50" cy="50" r="45" pathLength="100" />
        <circle ref={progressRef} className="live-timer__progress" cx="50" cy="50" r="45" pathLength="100" />
      </svg>
      <span ref={numberRef} className="live-timer__number">
        {duration}
      </span>
      {!compact && <span className="live-timer__unit">ثانية</span>}
    </div>
  );
}
