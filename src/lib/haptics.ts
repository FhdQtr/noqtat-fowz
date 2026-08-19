export type HapticTone = "light" | "success" | "error";

const PATTERNS: Record<HapticTone, number | number[]> = {
  light: 8,
  success: [12, 36, 18],
  error: [18, 32, 18],
};

export function haptic(tone: HapticTone = "light") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(PATTERNS[tone]);
}
