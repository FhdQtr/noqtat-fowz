// ═══════════════════════════════════════════════════════════
// نقطة فوز — الأنواع الأساسية للمسابقة الجماعية
// ═══════════════════════════════════════════════════════════

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "image"
  | "flag"
  | "completion"
  | "ordering"
  | "riddle";

export type QuestionLevel = "easy" | "medium" | "hard";

export interface Question {
  id: number;
  type: QuestionType;
  category: string; // مفتاح الفئة
  level: QuestionLevel;
  question: string;
  options: string[];
  answer: number; // فهرس الإجابة الصحيحة
  image?: string; // رابط صورة (علم أو معلم)
}

export type TeamColor = "maroon" | "emerald" | "royal" | "gold";

export interface Team {
  code: string; // كود الفريق (يدخل به اللاعبون)
  name: string;
  color: TeamColor;
  score: number;
  correctCount: number;
  wrongCount: number;
}

export interface Player {
  id: string;
  name: string;
  teamCode: string;
  joinedAt: number;
}

export type MatchPhase =
  | "lobby" // استقبال اللاعبين
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
}

export interface Match {
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

export const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "اختيار من متعدد",
  true_false: "صح أم خطأ",
  image: "خمّن الصورة",
  flag: "أعلام الدول",
  completion: "أكمل المثل",
  ordering: "ترتيب",
  riddle: "لغز",
};

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
};
