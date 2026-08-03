import { useMemo } from "react";

const COLORS = ["#d4af37", "#e8c96a", "#f3dd9a", "#8a1538", "#b02047", "#ffffff"];

/** كونفيتي ذهبي احتفالي */
export default function GoldConfetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        right: Math.random() * 100,
        size: 6 + Math.random() * 8,
        delay: Math.random() * 2.4,
        dur: 2.6 + Math.random() * 2.4,
        color: COLORS[i % COLORS.length],
        round: Math.random() > 0.6,
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
