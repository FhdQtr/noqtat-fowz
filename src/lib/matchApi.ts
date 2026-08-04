// ═══════════════════════════════════════════════════════════
// نقطة فوز — منطق المسابقة الجماعية على Firebase
// ═══════════════════════════════════════════════════════════
import {
  ref, set, get, update, runTransaction, onValue, remove, type Unsubscribe,
} from "firebase/database";
import { db, ensureAuth } from "./firebase";
import {
  pickQuestionOfType, shuffleQuestion, levelForPick, pointsForPick,
} from "../data/questions";
import type {
  Match, GameState, Question, QuestionType, QuestionLevel, TeamColor, Player,
} from "../types/game";
import { TEAM_COLORS, viewSecondsFor, questionPoints } from "../types/game";

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
      questionValue: 0,
      viewUntil: null,
      assistUsed: false,
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

/** المقدم يبدأ المسابقة — أول فريق يختار نوع سؤاله */
export async function startMatch(code: string, firstTeamCode: string) {
  await ensureAuth();
  await update(ref(db, `matches/${code}`), {
    status: "playing",
    "state/phase": "choose",
    "state/targetTeam": firstTeamCode,
  });
}

/** سقف تكرار نفس النوع لكل فريق — يكبر كل ما زاد عدد الأسئلة */
export function typeCap(
  match: Pick<Match, "totalRounds" | "teamOrder" | "enabledTypes">
): number {
  if (match.enabledTypes.length <= 1) return 99; // نوع واحد = بلا سقف
  const perTeam = Math.ceil(match.totalRounds / Math.max(1, match.teamOrder.length));
  return Math.max(3, Math.ceil(perTeam / 2));
}

export interface TypeProgress {
  used: number; // كم مرة الفريق اختار النوع
  cap: number; // السقف
  left: number; // المتبقي
  nextLevel: QuestionLevel; // مستوى السؤال الجاي لو اختاروه
  nextPoints: number; // نقاطه
  available: boolean;
}

/** تقدّم فريق في نوع معيّن — لواجهة أزرار الاختيار */
export function typeProgress(match: Match, teamCode: string, type: QuestionType): TypeProgress {
  const used = match.typeCounts?.[teamCode]?.[type] ?? 0;
  const cap = typeCap(match);
  const left = Math.max(0, cap - used);
  const nextN = used + 1;
  return {
    used,
    cap,
    left,
    nextLevel: levelForPick(nextN),
    nextPoints: pointsForPick(nextN),
    available: left > 0,
  };
}

/**
 * الفريق (أو المقدم) يختار نوع السؤال — معاملة ذرّية: أول اختيار يفوز.
 * المستوى يتصاعد مع كل اختيار لنفس النوع (سهل ← متوسط ← صعب) والنقاط ٥٠×رقم الاختيار.
 */
export async function chooseType(
  code: string,
  type: QuestionType
): Promise<"accepted" | "late" | "cap" | "empty" | "error"> {
  await ensureAuth();
  let reason: "cap" | "empty" | null = null;
  try {
    const res = await runTransaction(ref(db, `matches/${code}`), (m: Match | null) => {
      if (!m || m.state.phase !== "choose" || m.state.question) return; // سبقك أحد
      if (!m.enabledTypes.includes(type)) return;
      const teamCode =
        m.state.targetTeam ?? m.teamOrder[m.turnIndex % m.teamOrder.length];
      const counts = m.typeCounts?.[teamCode] ?? {};
      const used = counts[type] ?? 0;
      if (used >= typeCap(m)) {
        reason = "cap";
        return;
      }
      const n = used + 1;
      const usedIds = m.state.usedIds ?? [];
      const picked = pickQuestionOfType(usedIds, type, levelForPick(n));
      if (!picked) {
        reason = "empty";
        return;
      }
      const q: Question = shuffleQuestion(picked);
      const now = Date.now();
      const vsec = viewSecondsFor(q); // ذاكرة/أعلام/فيديو = مشاهدة أولاً
      const viewUntil = vsec ? now + vsec * 1000 : null;
      return {
        ...m,
        typeCounts: { ...m.typeCounts, [teamCode]: { ...counts, [type]: n } },
        state: {
          ...m.state,
          phase: "question",
          round: m.state.round + 1,
          targetTeam: teamCode,
          originalTeam: teamCode,
          passCount: 0,
          question: q,
          answer: null,
          isCorrect: null,
          questionStartedAt: viewUntil ?? now,
          viewUntil,
          assistUsed: false,
          questionValue: pointsForPick(n),
          usedIds: [...usedIds, q.id],
        },
      };
    });
    if (res.committed) return "accepted";
    return reason ?? "late";
  } catch {
    return "error";
  }
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

/** الأعلام: الفريق يطلب "اختيار من الإجابات" — الإجابة الصحيحة تصير بربع النقاط */
export async function useAssist(code: string, teamCode: string): Promise<boolean> {
  await ensureAuth();
  try {
    const res = await runTransaction(
      ref(db, `matches/${code}/state`),
      (s: GameState | null) => {
        if (
          !s ||
          s.phase !== "question" ||
          s.question?.type !== "flag" ||
          s.assistUsed ||
          s.targetTeam !== teamCode
        )
          return;
        return { ...s, assistUsed: true };
      }
    );
    return res.committed;
  } catch {
    return false;
  }
}

/** الأعلام: المقدم يحكم على الإجابة الشفهية (درجة كاملة عند الصح) */
export async function judgeVerbal(code: string, match: Match, correct: boolean) {
  await ensureAuth();
  const st = match.state;
  if (!st.question || st.phase !== "question" || !st.targetTeam) return;
  const team = match.teams[st.targetTeam];
  const points = questionPoints(st);
  const updates: Record<string, unknown> = {
    "state/phase": "revealed",
    "state/isCorrect": correct,
    [`teams/${st.targetTeam}/correctCount`]: team.correctCount + (correct ? 1 : 0),
    [`teams/${st.targetTeam}/wrongCount`]: team.wrongCount + (correct ? 0 : 1),
  };
  if (correct) updates[`teams/${st.targetTeam}/score`] = team.score + points;
  await update(ref(db, `matches/${code}`), updates);
}

/** المقدم يكشف النتيجة ويحتسب النقاط */
export async function revealAnswer(code: string, match: Match) {
  await ensureAuth();
  const st = match.state;
  if (!st.question || !st.answer) return;
  const correct = st.answer.choice === st.question.answer;
  const teamCode = st.targetTeam!;
  const team = match.teams[teamCode];
  // المسروق = نصف النقاط، وبمساعدة "اختيار من الإجابات" = ربعها
  const points = questionPoints(st);

  const updates: Record<string, unknown> = {
    "state/phase": "revealed",
    "state/isCorrect": correct,
    [`teams/${teamCode}/correctCount`]: team.correctCount + (correct ? 1 : 0),
    [`teams/${teamCode}/wrongCount`]: team.wrongCount + (correct ? 0 : 1),
  };
  if (correct) updates[`teams/${teamCode}/score`] = team.score + points;
  await update(ref(db, `matches/${code}`), updates);
}

/** المقدم ينقل السؤال للفريق التالي (سرقة) — الصور/الأعلام تُعرض من جديد للفريق الجديد */
export async function passToNextTeam(code: string, match: Match) {
  await ensureAuth();
  const st = match.state;
  const currentIdx = match.teamOrder.indexOf(st.targetTeam!);
  const nextTeam = match.teamOrder[(currentIdx + 1) % match.teamOrder.length];
  const vsec = st.question ? viewSecondsFor(st.question) : null;
  const viewUntil = vsec ? Date.now() + vsec * 1000 : null;
  await update(ref(db, `matches/${code}`), {
    state: {
      ...st,
      phase: "question",
      targetTeam: nextTeam,
      passCount: st.passCount + 1,
      answer: null,
      isCorrect: null,
      questionStartedAt: viewUntil ?? Date.now(),
      viewUntil,
      assistUsed: false,
    },
  });
}

/** الانتقال للسؤال التالي — الفريق الجاي يختار نوع سؤاله */
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
    const nextTeam = match.teamOrder[(match.turnIndex + 1) % match.teamOrder.length];
    await update(ref(db, `matches/${code}`), {
      turnIndex: match.turnIndex + 1,
      "state/phase": "choose",
      "state/question": null,
      "state/answer": null,
      "state/isCorrect": null,
      "state/targetTeam": nextTeam,
      "state/viewUntil": null,
      "state/assistUsed": false,
      "state/questionValue": null,
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
