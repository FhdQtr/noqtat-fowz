import { useMemo } from "react";

const COLORS = ["#4f63f5", "#7890ff", "#95a5ff", "#22a979", "#ff6b61", "#ffffff"];
const pseudo = (seed: number) => ((seed * 9301 + 49297) % 233280) / 233280;

/** قصاصات احتفال متوافقة مع هوية Cobalt الجديدة. */
export default function GoldConfetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        right: pseudo(i + 1) * 100,
        size: 6 + pseudo(i + 17) * 8,
        delay: pseudo(i + 31) * 2.4,
        dur: 2.6 + pseudo(i + 47) * 2.4,
        color: COLORS[i % COLORS.length],
        round: pseudo(i + 63) > 0.6,
      })),
    [count]
  );
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-50">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            right: `${p.right}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
