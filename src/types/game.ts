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
export type DifficultyMode = QuestionLevel | "mixed";
export type AnswerMode = "anyone" | "representative" | "host";
export type PowerCardId = "extraTime" | "doublePoints" | "swapQuestion" | "freeze" | "steal" | "pickPlayer";

export interface TeamPowerCards {
  extraTime: boolean;
  doublePoints: boolean;
  swapQuestion: boolean;
  freeze: boolean;
  steal: boolean;
  pickPlayer: boolean;
}

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
  region?: "qatari" | "gulf"; // للأمثال: قطري أولاً ثم خليجي
  disabled?: boolean; // مستبعد من اللعب مع بقائه في البنك للمراجعة
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
  captainId?: string | null; // ممثل الفريق — الوحيد اللي يجيب في وضع representative
  cardBalance?: number; // رصيد مستقل لصرف الكروت ولا ينقص نقاط الفوز
  powerCards?: Partial<TeamPowerCards>; // true = لم يُستخدم الكرت بعد
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
  attemptedTeams?: string[]; // الفرق التي أجابت خطأ على السؤال الحالي
  question: Question | null;
  answer: LiveAnswer | null;
  isCorrect: boolean | null;
  timer: number; // 0 = بدون مؤقت، غيره = ثواني
  questionStartedAt: number | null;
  questionDuration?: number; // مدة خاصة بالسؤال؛ «مثّل المثل» دقيقتان
  selectionRequestId?: string | null; // يمنع تكرار اختيار النوع عند إعادة الطلب
  usedIds: number[]; // الأسئلة المستخدمة
  questionValue?: number; // قيمة السؤال الأساسية (٥٠ × رقم اختيار النوع)
  viewUntil?: number | null; // للصور/الأعلام: وقت إخفاء الصورة (مللي ثانية)
  assistUsed?: boolean; // الأعلام: الفريق طلب "اختيار من الإجابات" (ربع النقاط)
  pointMultiplier?: number; // بطاقة مضاعفة النقاط
  extraTimeUsed?: boolean; // بطاقة +١٥ ثانية
  stealFullValue?: boolean; // السرقة بالقيمة الكاملة بدل نصف قيمة النقل
  forcedPlayerId?: string | null; // اللاعب الوحيد المسموح له بالإجابة
  forcedPlayerName?: string | null;
  cardsFrozenTeam?: string | null; // الفريق الممنوع من الكروت في هذا السؤال
  cardUsedThisTurn?: boolean; // كرت واحد فقط في السؤال
  cardClaimId?: string | null; // يمنع طلبَي كرت متزامنين
  cardEvent?: {
    id: string;
    card: PowerCardId;
    byTeam: string;
    targetTeam?: string | null;
    targetPlayerId?: string | null;
    targetPlayerName?: string | null;
    at: number;
  } | null;
}

export interface Match {
  hostUid?: string;
  hostName: string;
  createdAt: number;
  expiresAt?: number; // اللوبي غير المستخدم يُحذف تلقائياً بعد عشر دقائق
  startedAt?: number;
  status: "lobby" | "playing" | "ended";
  teamOrder: string[]; // ترتيب أكواد الفرق
  turnIndex: number; // مؤشر الدور الحالي
  totalRounds: number; // عدد الأسئلة المخطط
  questionsPerTeam?: number; // عدد الأسئلة لكل فريق
  timer: number; // ثواني لكل سؤال (0 = يدوي)
  difficulty?: DifficultyMode;
  answerMode?: AnswerMode;
  enabledTypes: QuestionType[];
  state: GameState;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  // كم مرة كل فريق اختار كل نوع (للتصعيد والسقف) — Firebase يحذف الكائنات الفارغة
  typeCounts?: Record<string, Partial<Record<QuestionType, number>>>;
  /** الأسئلة التي شاهدها كل فريق؛ حصة الأقسام مستقلة بين الفرق. */
  usedIdsByTeam?: Record<string, number[]>;
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

export const POWER_CARD_BASE_COST: Record<PowerCardId, number> = {
  extraTime: 100,
  swapQuestion: 150,
  pickPlayer: 200,
  doublePoints: 200,
  freeze: 250,
  steal: 300,
};

export const POWER_CARD_LABEL: Record<PowerCardId, string> = {
  extraTime: "زيادة الوقت",
  swapQuestion: "بدّل السؤال",
  pickPlayer: "أنت اللي بتجاوب",
  doublePoints: "دبلها",
  freeze: "جمّدهم",
  steal: "سرقة الميدان",
};

/** تكلفة متناسبة مع عدد أسئلة كل فريق، مقربة لأقرب ٥٠ نقطة. */
export function powerCardCost(card: PowerCardId, questionsPerTeam = 8): number {
  const scaled = POWER_CARD_BASE_COST[card] * Math.max(1, questionsPerTeam) / 8;
  return Math.max(50, Math.round(scaled / 50) * 50);
}

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

/** مدة عرض صورة العلم قبل إخفائها */
export const VIEW_SECONDS = 10;

/** الأنواع اللي تعتمد على مشاهدة الصورة أولاً */
export const VISUAL_TYPES: QuestionType[] = ["memory", "flag"];

/**
 * مدة المشاهدة قبل ظهور السؤال (بالثواني):
 * الذاكرة: سهل ١٢، متوسط ١٠، صعب ٨ — الأعلام ١٠ ثوانٍ
 * أسئلة الفيديو = طول المقطع — وغيرها بدون مشاهدة
 */
export function viewSecondsFor(q: Question): number | null {
  if (q.type === "memory") {
    if (q.level === "easy") return 12;
    if (q.level === "hard") return 8;
    return 10;
  }
  if (q.type === "flag") return VIEW_SECONDS;
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
  if (st.assistUsed) result = Math.max(1, Math.round(result / 2));
  else if (st.passCount > 0) result = Math.max(1, Math.round(result / 2));
  return result * (st.pointMultiplier ?? 1);
}

/** هل بقي فريق لم يحاول ويمكن نقل السؤال له بعد إجابة خاطئة؟ */
export function canPassQuestion(match: Pick<Match, "teamOrder" | "state">): boolean {
  const st = match.state;
  if (st.phase !== "revealed" || st.isCorrect !== false || !st.question) return false;
  if (st.question.type === "true_false" || st.question.format === "tf") return false;
  const attempted = new Set(st.attemptedTeams ?? [
    ...(st.passCount > 0 && st.originalTeam ? [st.originalTeam] : []),
    ...(st.targetTeam ? [st.targetTeam] : []),
  ]);
  return match.teamOrder.some((teamCode) => !attempted.has(teamCode));
}

/** مدة السؤال الحالية قبل بطاقة زيادة الوقت. */
export function questionTimerSeconds(match: Pick<Match, "timer" | "state">): number {
  return match.state.questionDuration ?? match.timer;
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
