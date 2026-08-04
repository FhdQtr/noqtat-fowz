// ═══════════════════════════════════════════════════════════
// نقطة فوز — بنك الأسئلة (1038 سؤالاً + أسئلة الذاكرة)
// ═══════════════════════════════════════════════════════════
import raw from "./questions.json";
import type { Question, QuestionType, QuestionLevel } from "../types/game";

export const QUESTIONS = raw as Question[];

// ═══ بنك أسئلة المقدم المخصص (من لوحة التحكم — يُزامَن من Firebase) ═══
let customQuestions: Question[] = [];

/** تُستدعى من lib/customBank عند وصول تحديث من Firebase */
export function setCustomQuestions(list: Question[]) {
  customQuestions = list;
}

/** كل الأسئلة المتاحة = البنك الأصلي + أسئلة المقدم غير المعطّلة */
export function allQuestions(): Question[] {
  return QUESTIONS.concat(customQuestions);
}

/** اختيار سؤال عشوائي غير مستخدم */
export function pickQuestion(
  usedIds: number[],
  enabledTypes: QuestionType[],
  level?: QuestionLevel
): Question | null {
  let pool = allQuestions().filter(
    (q) => enabledTypes.includes(q.type) && !usedIds.includes(q.id)
  );
  if (level) {
    const byLevel = pool.filter((q) => q.level === level);
    if (byLevel.length) pool = byLevel;
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** اختيار سؤال من نوع محدد — يفضّل المستوى المطلوب ثم أي مستوى، ويعيد الاستخدام عند نفاد النوع */
export function pickQuestionOfType(
  usedIds: number[],
  type: QuestionType,
  level?: QuestionLevel
): Question | null {
  const ofType = allQuestions().filter((q) => q.type === type);
  if (!ofType.length) return null;
  const rnd = (pool: Question[]) => pool[Math.floor(Math.random() * pool.length)];
  const fresh = ofType.filter((q) => !usedIds.includes(q.id));
  if (level) {
    const lv = fresh.filter((q) => q.level === level);
    if (lv.length) return rnd(lv);
  }
  if (fresh.length) return rnd(fresh);
  // نفدت أسئلة النوع — نعيد استخدامها (نفس المستوى أولاً)
  if (level) {
    const lv = ofType.filter((q) => q.level === level);
    if (lv.length) return rnd(lv);
  }
  return rnd(ofType);
}

/** الأنواع اللي ما تنخلط خياراتها: صح/خطأ ثابتة، والترتيب ترتيبه هو السؤال */
const NO_SHUFFLE: QuestionType[] = ["true_false", "ordering"];

/** خلط الخيارات مع تصحيح فهرس الإجابة — حتى ما تكون الإجابة غالباً أول خيار */
export function shuffleQuestion(q: Question): Question {
  if (NO_SHUFFLE.includes(q.type) || q.format === "tf" || q.options.length <= 2) return q;
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { ...q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) };
}

/** مستوى السؤال حسب رقم اختيار الفريق لنفس النوع: الأول سهل، الثاني متوسط، الثالث+ صعب */
export function levelForPick(n: number): QuestionLevel {
  if (n <= 1) return "easy";
  if (n === 2) return "medium";
  return "hard";
}

/** نقاط السؤال حسب رقم اختيار النوع: ٥٠، ١٠٠، ١٥٠، … */
export function pointsForPick(n: number): number {
  return 50 * n;
}

/** توزيع مستويات تدريجي حسب رقم الجولة */
export function levelForRound(round: number, total: number): QuestionLevel | undefined {
  const ratio = round / Math.max(total, 1);
  if (ratio <= 0.34) return "easy";
  if (ratio <= 0.67) return "medium";
  return "hard";
}
