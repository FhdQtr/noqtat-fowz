// ═══════════════════════════════════════════════════════════
// الميدان — الأنواع الأساسية للمسابقة الجماعية
// ═══════════════════════════════════════════════════════════

/** الأنواع الأساسية — والمقدم يقدر يضيف أنواعاً مخصصة بأسمائه (سلسلة نصية حرة) */
export type BuiltinQuestionType =
  | "multiple_choice"
  | "true_false"
  | "image"
  | "flag"
  | "completion"
  | "ordering"
  | "riddle"
  | "memory"
  | "acting";

export type QuestionType = string;

export type QuestionLevel = "easy" | "medium" | "hard";

/** مقطع فيديو يوتيوب مرفق بالسؤال (يشاهدونه ثم يظهر السؤال) */
export interface QuestionVideo {
  youtubeId: string;
  start: number; // من ثانية
  end: number; // إلى ثانية
}

export interface Question {
  id: number;
  type: QuestionType;
  category: string; // مفتاح الفئة
  level: QuestionLevel;
  question: string;
  options: string[];
  answer: number; // فهرس الإجابة الصحيحة
  image?: string; // رابط صورة أو data URL (علم/معلم/صورة مخصصة)
  video?: QuestionVideo; // مقطع يوتيوب (أسئلة الفيديو)
  format?: "tf" | "mc"; // صيغة الإجابة (لأسئلة المقدم المخصصة)
}

/** نوع سؤال مخصص يسويه صاحب اللعبة من لوحة التحكم */
export interface CustomType {
  id: string;
  name: string;
  createdAt: number;
}

export type TeamColor = "maroon" | "emerald" | "royal" | "gold";

export interface Team {
  code: string; // كود الفريق (يدخل به اللاعبون)
  name: string;
  color: TeamColor;
  score: number;
  correctCount: number;
  wrongCount: number;
  captainId?: string | null; // قائد الفريق — الوحيد اللي يختار النوع ويجاوب (فارغ = الكل يقدر)
  powerCards?: {
    doublePoints: boolean;
    extraTime: boolean;
  };
}

export interface Player {
  id: string;
  name: string;
  teamCode: string;
  joinedAt: number;
  authUid?: string;
}

export type MatchPhase =
  | "lobby" // استقبال اللاعبين
  | "choose" // الفريق صاحب الدور يختار نوع السؤال
  | "question" // سؤال معروض وينتظر إجابة الفريق
  | "locked" // فريق جاوب — بانتظار المقدم يكشف
  | "revealed" // النتيجة ظاهرة
  | "ended"; // نهاية المسابقة

export interface LiveAnswer {
  playerId: string;
  playerName: string;
  choice: number; // فهرس الخيار المختار
  at: number;
}

export interface GameState {
  phase: MatchPhase;
  round: number; // رقم السؤال
  targetTeam: string | null; // الفريق صاحب السؤال الحالي
  originalTeam: string | null; // الفريق الأول اللي نزل له السؤال
  passCount: number; // كم مرة انسرق السؤال
  question: Question | null;
  answer: LiveAnswer | null;
  isCorrect: boolean | null;
  timer: number; // 0 = بدون مؤقت، غيره = ثواني
  questionStartedAt: number | null;
  usedIds: number[]; // الأسئلة المستخدمة
  questionValue?: number; // قيمة السؤال الأساسية (٥٠ × رقم اختيار النوع)
  viewUntil?: number | null; // للصور/الأعلام: وقت إخفاء الصورة (مللي ثانية)
  assistUsed?: boolean; // الأعلام: الفريق طلب "اختيار من الإجابات" (ربع النقاط)
  pointMultiplier?: number; // بطاقة مضاعفة النقاط
  extraTimeUsed?: boolean; // بطاقة +١٥ ثانية
}

export interface Match {
  hostUid?: string;
  hostName: string;
  createdAt: number;
  status: "lobby" | "playing" | "ended";
  teamOrder: string[]; // ترتيب أكواد الفرق
  turnIndex: number; // مؤشر الدور الحالي
  totalRounds: number; // عدد الأسئلة المخطط
  timer: number; // ثواني لكل سؤال (0 = يدوي)
  enabledTypes: QuestionType[];
  state: GameState;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  // كم مرة كل فريق اختار كل نوع (للتصعيد والسقف) — Firebase يحذف الكائنات الفارغة
  typeCounts?: Record<string, Partial<Record<QuestionType, number>>>;
  tieBreaker?: {
    active: boolean;
    teams: string[];
    cursor: number;
    cycle: number;
  };
}

export const TEAM_COLORS: Record<
  TeamColor,
  { label: string; hex: string; light: string; dark: string; text: string }
> = {
  maroon: { label: "عنابي", hex: "#8a1538", light: "#b02047", dark: "#5d0e26", text: "#ffffff" },
  emerald: { label: "أخضر", hex: "#0e7c5b", light: "#12a174", dark: "#095a42", text: "#ffffff" },
  royal: { label: "أزرق", hex: "#1d4ed8", light: "#3b82f6", dark: "#16347a", text: "#ffffff" },
  gold: { label: "ذهبي", hex: "#b8860b", light: "#d4af37", dark: "#7a5a08", text: "#1a1208" },
};

export const LEVEL_POINTS: Record<QuestionLevel, number> = {
  easy: 100,
  medium: 150,
  hard: 200,
};

export const LEVEL_LABEL: Record<QuestionLevel, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
};

export const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "اختيار من متعدد",
  true_false: "صح أم خطأ",
  image: "خمّن الصورة",
  flag: "أعلام الدول",
  completion: "أكمل المثل",
  ordering: "ترتيب",
  riddle: "لغز",
  memory: "اختبار الذاكرة",
  acting: "مثّل المثل",
};

// أسماء الأنواع المخصصة — تُسجَّل تلقائياً من مزامنة البنك المخصص
const customLabels = new Map<string, string>();

/** تُستدعى من lib/customBank عند وصول الأنواع المخصصة من Firebase */
export function registerTypeLabels(list: CustomType[]) {
  customLabels.clear();
  list.forEach((t) => customLabels.set(t.id, t.name));
}

/** اسم النوع للعرض — يدعم الأنواع المخصصة من لوحة التحكم */
export function typeLabel(type: QuestionType): string {
  return TYPE_LABEL[type] ?? customLabels.get(type) ?? type;
}

/** مدة عرض الصورة قبل إخفائها (الذاكرة والأعلام) */
export const VIEW_SECONDS = 10;

/** الأنواع اللي تعتمد على مشاهدة الصورة أولاً */
export const VISUAL_TYPES: QuestionType[] = ["memory", "flag"];

/**
 * مدة المشاهدة قبل ظهور السؤال (بالثواني):
 * الذاكرة/الأعلام ١٠ ثواني — أسئلة الفيديو = طول المقطع — وغيرها بدون مشاهدة
 */
export function viewSecondsFor(q: Question): number | null {
  if (VISUAL_TYPES.includes(q.type)) return VIEW_SECONDS;
  if (q.video) return Math.max(1, q.video.end - q.video.start) + 3; // +3 سماحية تشغيل
  return null;
}

/** هل السؤال يُخفى أثناء المشاهدة؟ (الذاكرة والأعلام تُخفى — الفيديو يبقى المشغل ظاهر) */
export function hidesDuringView(q: Question): boolean {
  return VISUAL_TYPES.includes(q.type);
}

/** النقاط الفعلية للسؤال الحالي بعد تعديلات السرقة/المساعدة */
export function questionPoints(st: {
  question: Question | null;
  questionValue?: number;
  passCount: number;
  assistUsed?: boolean;
  pointMultiplier?: number;
}): number {
  const base = st.questionValue ?? (st.question ? LEVEL_POINTS[st.question.level] : 0);
  let result = base;
  if (st.assistUsed) result = Math.max(1, Math.round(result / 4));
  else if (st.passCount > 0) result = Math.max(1, Math.round(result / 2));
  return result * (st.pointMultiplier ?? 1);
}

export const CATEGORY_LABEL: Record<string, string> = {
  culture: "ثقافة عامة",
  science: "علوم",
  religion: "إسلاميات",
  language: "لغة عربية",
  math: "رياضيات",
  geography: "جغرافيا",
  gulf: "خليجيات",
  tech: "تقنية",
  riddles: "ألغاز",
  sports: "رياضة",
  landmarks: "معالم العالم",
  flags: "أعلام",
  memory: "ذاكرة",
  proverbs: "أمثال شعبية",
  custom: "أسئلة المقدم",
};
