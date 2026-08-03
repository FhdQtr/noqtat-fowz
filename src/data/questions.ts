// ═══════════════════════════════════════════════════════════
// نقطة فوز — بنك الأسئلة (1038 سؤالاً)
// ═══════════════════════════════════════════════════════════
import raw from "./questions.json";
import type { Question, QuestionType, QuestionLevel } from "../types/game";

export const QUESTIONS = raw as Question[];

/** اختيار سؤال عشوائي غير مستخدم */
export function pickQuestion(
  usedIds: number[],
  enabledTypes: QuestionType[],
  level?: QuestionLevel
): Question | null {
  let pool = QUESTIONS.filter(
    (q) => enabledTypes.includes(q.type) && !usedIds.includes(q.id)
  );
  if (level) {
    const byLevel = pool.filter((q) => q.level === level);
    if (byLevel.length) pool = byLevel;
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** توزيع مستويات تدريجي حسب رقم الجولة */
export function levelForRound(round: number, total: number): QuestionLevel | undefined {
  const ratio = round / Math.max(total, 1);
  if (ratio <= 0.34) return "easy";
  if (ratio <= 0.67) return "medium";
  return "hard";
}
