// ═══════════════════════════════════════════════════════════
// نقطة فوز — منطق المسابقة الجماعية على Firebase
// ═══════════════════════════════════════════════════════════
import {
  ref, set, get, update, runTransaction, onValue, remove, type Unsubscribe,
} from "firebase/database";
import { db, ensureAuth } from "./firebase";
import { pickQuestion, levelForRound } from "../data/questions";
import type {
  Match, GameState, Question, QuestionType, TeamColor, Player,
} from "../types/game";
import { TEAM_COLORS, LEVEL_POINTS } from "../types/game";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genCode(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

const TEAM_COLOR_ORDER: TeamColor[] = ["maroon", "emerald", "royal", "gold"];

export interface CreateMatchOptions {
  hostName: string;
  teamNames: string[]; // 2 إلى 4
  totalRounds: number;
  timer: number; // 0 = بدون مؤقت
  enabledTypes: QuestionType[];
}

/** المقدم ينشئ مسابقة → يرجع كود المسابقة وأكواد الفرق */
export async function createMatch(opts: CreateMatchOptions): Promise<string> {
  await ensureAuth();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode(6);
    const snap = await get(ref(db, `matches/${code}`));
    if (snap.exists()) continue;

    const teams: Match["teams"] = {};
    const teamOrder: string[] = [];
    opts.teamNames.forEach((name, i) => {
      const tcode = `${code}-${genCode(3)}`;
      teamOrder.push(tcode);
      teams[tcode] = {
        code: tcode,
        name: name.trim() || `فريق ${i + 1}`,
        color: TEAM_COLOR_ORDER[i],
        score: 0,
        correctCount: 0,
        wrongCount: 0,
      };
    });

    const state: GameState = {
      phase: "lobby",
      round: 0,
      targetTeam: null,
      originalTeam: null,
      passCount: 0,
      question: null,
      answer: null,
      isCorrect: null,
      timer: opts.timer,
      questionStartedAt: null,
      usedIds: [],
    };

    const match: Omit<Match, "players"> = {
      hostName: opts.hostName.trim() || "المقدم",
      createdAt: Date.now(),
      status: "lobby",
      teamOrder,
      turnIndex: 0,
      totalRounds: opts.totalRounds,
      timer: opts.timer,
      enabledTypes: opts.enabledTypes,
      state,
      teams,
    };

    await set(ref(db, `matches/${code}`), match);
    return code;
  }
  throw new Error("تعذر إنشاء كود، حاول مرة ثانية");
}

/** الاشتراك في تحديثات المسابقة (بعد التأكد من الدخول) — onError عند فشل الاتصال أو الصلاحيات */
export function subscribeMatch(
  code: string,
  cb: (m: Match | null) => void,
  onError?: (reason: string) => void
): Unsubscribe {
  let un: Unsubscribe = () => {};
  let cancelled = false;
  let gotData = false;
  // مهلة: لو ما وصلنا شي خلال ١٢ ثانية نظهر خطأ بدل تحميل أبدي
  const timeout = setTimeout(() => {
    if (!cancelled && !gotData) onError?.("timeout");
  }, 12000);
  void ensureAuth().then(() => {
    if (cancelled) return;
    un = onValue(
      ref(db, `matches/${code}`),
      (s) => {
        gotData = true;
        clearTimeout(timeout);
        cb(s.exists() ? (s.val() as Match) : null);
      },
      (err) => {
        clearTimeout(timeout);
        onError?.(err?.message ?? "permission");
      }
    );
  });
  return () => {
    cancelled = true;
    clearTimeout(timeout);
    un();
  };
}

/** البحث عن مسابقة عبر كود فريق */
export async function findMatchByTeamCode(teamCode: string): Promise<string | null> {
  await ensureAuth();
  const matchCode = teamCode.split("-")[0]?.toUpperCase();
  if (!matchCode) return null;
  const snap = await get(ref(db, `matches/${matchCode}/teams/${teamCode.toUpperCase()}`));
  return snap.exists() ? matchCode : null;
}

/** انضمام لاعب لفريق */
export async function joinTeam(matchCode: string, teamCode: string, name: string): Promise<Player> {
  await ensureAuth();
  const player: Player = {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 20) || "لاعب",
    teamCode,
    joinedAt: Date.now(),
  };
  await set(ref(db, `matches/${matchCode}/players/${player.id}`), player);
  return player;
}

/** المقدم يبدأ المسابقة */
export async function startMatch(code: string) {
  await ensureAuth();
  await update(ref(db, `matches/${code}`), { status: "playing" });
}

/** المقدم ينزل سؤالاً للفريق صاحب الدور */
export async function pushQuestion(code: string, match: Match): Promise<Question | null> {
  await ensureAuth();
  const round = match.state.round + 1;
  const level = levelForRound(round, match.totalRounds);
  // ملاحظة: Firebase يحذف المصفوفات الفارغة — usedIds قد تكون غير موجودة
  const usedIds = match.state.usedIds ?? [];
  const q = pickQuestion(usedIds, match.enabledTypes, level)
    ?? pickQuestion(usedIds, match.enabledTypes);
  if (!q) return null;

  const targetTeam = match.teamOrder[match.turnIndex % match.teamOrder.length];
  await update(ref(db, `matches/${code}`), {
    state: {
      ...match.state,
      phase: "question",
      round,
      targetTeam,
      originalTeam: targetTeam,
      passCount: 0,
      question: q,
      answer: null,
      isCorrect: null,
      questionStartedAt: Date.now(),
      usedIds: [...usedIds, q.id],
    },
  });
  return q;
}

/** اللاعب يجاوب — أول إجابة فقط تقفل السؤال (معاملة ذرّية) */
export async function submitAnswer(
  code: string,
  playerId: string,
  playerName: string,
  choice: number
): Promise<"accepted" | "late" | "error"> {
  await ensureAuth();
  try {
    const res = await runTransaction(
      ref(db, `matches/${code}/state`),
      (state: GameState | null) => {
        if (!state || state.phase !== "question" || state.answer) return; // إلغاء — سبقك أحد
        return {
          ...state,
          phase: "locked",
          answer: { playerId, playerName, choice, at: Date.now() },
        };
      }
    );
    return res.committed ? "accepted" : "late";
  } catch {
    return "error";
  }
}

/** المقدم يكشف النتيجة ويحتسب النقاط */
export async function revealAnswer(code: string, match: Match) {
  await ensureAuth();
  const st = match.state;
  if (!st.question || !st.answer) return;
  const correct = st.answer.choice === st.question.answer;
  const teamCode = st.targetTeam!;
  const team = match.teams[teamCode];
  const base = LEVEL_POINTS[st.question.level];
  // السؤال المسروق = نصف النقاط
  const points = st.passCount > 0 ? Math.round(base / 2) : base;

  const updates: Record<string, unknown> = {
    "state/phase": "revealed",
    "state/isCorrect": correct,
    [`teams/${teamCode}/correctCount`]: team.correctCount + (correct ? 1 : 0),
    [`teams/${teamCode}/wrongCount`]: team.wrongCount + (correct ? 0 : 1),
  };
  if (correct) updates[`teams/${teamCode}/score`] = team.score + points;
  await update(ref(db, `matches/${code}`), updates);
}

/** المقدم ينقل السؤال للفريق التالي (سرقة) */
export async function passToNextTeam(code: string, match: Match) {
  await ensureAuth();
  const st = match.state;
  const currentIdx = match.teamOrder.indexOf(st.targetTeam!);
  const nextTeam = match.teamOrder[(currentIdx + 1) % match.teamOrder.length];
  await update(ref(db, `matches/${code}`), {
    state: {
      ...st,
      phase: "question",
      targetTeam: nextTeam,
      passCount: st.passCount + 1,
      answer: null,
      isCorrect: null,
      questionStartedAt: Date.now(),
    },
  });
}

/** الانتقال للسؤال التالي — يحدّث الدور */
export async function advanceTurn(code: string, match: Match) {
  await ensureAuth();
  const ended = match.state.round >= match.totalRounds;
  if (ended) {
    await update(ref(db, `matches/${code}`), {
      status: "ended",
      "state/phase": "ended",
      turnIndex: match.turnIndex + 1,
    });
  } else {
    await update(ref(db, `matches/${code}`), {
      turnIndex: match.turnIndex + 1,
      "state/phase": "lobby",
      "state/question": null,
      "state/answer": null,
      "state/isCorrect": null,
      "state/targetTeam": null,
    });
  }
}

/** إنهاء المسابقة فوراً */
export async function endMatch(code: string) {
  await ensureAuth();
  await update(ref(db, `matches/${code}`), { status: "ended", "state/phase": "ended" });
}

/** حذف مسابقة (تنظيف) */
export async function deleteMatch(code: string) {
  await ensureAuth();
  await remove(ref(db, `matches/${code}`));
}

/** لاعب يغادر */
export async function leaveMatch(code: string, playerId: string) {
  await ensureAuth();
  await remove(ref(db, `matches/${code}/players/${playerId}`));
}

export { TEAM_COLORS };
