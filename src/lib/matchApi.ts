// الميدان — واجهة اللعب الآمنة. جميع التغييرات الحساسة تُنفّذ في Cloud Functions.
import { get, onDisconnect, onValue, ref, remove, serverTimestamp, set, type Unsubscribe } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, ensureAuth, functions } from "./firebase";
import type { AnswerMode, DifficultyMode, Match, Player, PowerCardId, QuestionLevel, QuestionType, TeamColor } from "../types/game";
import { TEAM_COLORS } from "../types/game";

export interface CreateMatchOptions {
  hostName: string;
  teamNames: string[];
  questionsPerTeam: number;
  timer: number;
  difficulty: DifficultyMode;
  difficultyLevels: QuestionLevel[];
  answerMode: AnswerMode;
  enabledTypes: QuestionType[];
}

type ActionName =
  | "createMatch" | "joinTeam" | "leaveMatch" | "startMatch" | "chooseType"
  | "submitAnswer" | "useAssist" | "judgeVerbal" | "revealAnswer"
  | "passToNextTeam" | "advanceTurn" | "endMatch" | "deleteMatch" | "setCaptain"
  | "startChallenge" | "answerChallenge" | "usePowerCard" | "getMatch"
  | "submitHostAnswer" | "startQuestionTimer" | "setAnswerMode" | "getHostAnswer"
  | "submitShowdownAnswer" | "finishShowdown" | "getUsageStats";

export interface UsageHour {
  activePlayers?: number;
  matchesCreated?: number;
  matchesStarted?: number;
}

export interface UsageDay extends UsageHour {
  date: string;
  hours?: Record<string, UsageHour>;
}

export interface UsageStats {
  totals: {
    uniquePlayers?: number;
    matchesCreated?: number;
    matchesStarted?: number;
    playerLastAt?: number;
    matchesCreatedLastAt?: number;
    matchesStartedLastAt?: number;
  };
  daily: UsageDay[];
}

function levelForPick(n: number, difficulty: DifficultyMode = "mixed", difficultyLevels?: QuestionLevel[]): QuestionLevel {
  const selected = [...new Set((difficultyLevels ?? []).filter((level): level is QuestionLevel => ["easy", "medium", "hard"].includes(level)))];
  if (selected.length) return selected[(Math.max(1, n) - 1) % selected.length];
  if (difficulty !== "mixed") return difficulty;
  return n <= 1 ? "easy" : n === 2 ? "medium" : "hard";
}

function pointsForPick(n: number): number {
  return Math.min(250, Math.max(50, n * 50));
}

async function gameAction<T>(action: ActionName, payload: Record<string, unknown>): Promise<T> {
  await ensureAuth();
  const call = httpsCallable<Record<string, unknown>, T>(functions, "gameAction");
  const result = await call({ action, ...payload });
  return result.data;
}

export async function createMatch(opts: CreateMatchOptions): Promise<string> {
  const result = await gameAction<{ code: string }>("createMatch", { options: opts });
  return result.code;
}

async function fetchMatchDirect(code: string): Promise<Match | null> {
  const user = await ensureAuth();
  const databaseURL = db.app.options.databaseURL;
  if (!databaseURL) throw new Error("database-url");

  const request = async (forceRefresh = false) => {
    const token = await user.getIdToken(forceRefresh);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 7000);
    try {
      return await fetch(
        `${databaseURL.replace(/\/$/, "")}/matches/${encodeURIComponent(code.toUpperCase())}.json?auth=${encodeURIComponent(token)}`,
        { cache: "no-store", signal: controller.signal },
      );
    } finally {
      window.clearTimeout(timer);
    }
  };

  let response = await request();
  if (response.status === 401 || response.status === 403) response = await request(true);
  if (!response.ok) throw new Error(`database-${response.status}`);
  return await response.json() as Match | null;
}

export function subscribeMatch(code: string, cb: (m: Match | null) => void, onError?: (reason: string) => void): Unsubscribe {
  let unsubscribe: Unsubscribe = () => undefined;
  let cancelled = false;
  let received = false;
  let timeout: number | undefined;
  let fallbackTimer: number | undefined;
  let pollTimer: number | undefined;
  let polling = false;

  const stopPolling = () => {
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    fallbackTimer = undefined;
    pollTimer = undefined;
    polling = false;
  };

  const startPolling = () => {
    if (cancelled || polling) return;
    polling = true;
    const poll = async () => {
      if (cancelled || !polling) return;
      try {
        let match: Match | null;
        try {
          match = await fetchMatchDirect(code);
        } catch {
          const result = await gameAction<{ match: Match }>("getMatch", { matchCode: code });
          match = result.match;
        }
        if (cancelled) return;
        received = true;
        if (timeout !== undefined) window.clearTimeout(timeout);
        onError?.("");
        cb(match);
      } catch {
        // Keep retrying until the overall connection timeout reports the error.
      } finally {
        if (!cancelled && polling) pollTimer = window.setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
  };

  void ensureAuth().then(() => {
    if (cancelled) return;
    timeout = window.setTimeout(() => {
      if (!cancelled && !received) onError?.("timeout");
    }, 30000);
    fallbackTimer = window.setTimeout(startPolling, 1200);
    unsubscribe = onValue(
      ref(db, `matches/${code.toUpperCase()}`),
      (snapshot) => {
        received = true;
        stopPolling();
        if (timeout !== undefined) window.clearTimeout(timeout);
        onError?.("");
        cb(snapshot.exists() ? snapshot.val() as Match : null);
      },
      (error) => {
        void error;
        startPolling();
      },
    );
  }).catch((error: unknown) => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    onError?.(error instanceof Error ? error.message : "auth");
  });

  return () => {
    cancelled = true;
    stopPolling();
    if (timeout !== undefined) window.clearTimeout(timeout);
    unsubscribe();
  };
}

/** يراقب مغادرة اللاعب للصفحة أثناء السؤال فقط، بلا عقوبة أو تغيير في اللعب. */
export function trackQuestionVisibility(matchCode: string, playerId: string, questionId: string | number): Unsubscribe {
  const watchRef = ref(db, `matches/${matchCode.toUpperCase()}/questionWatch/${playerId}`);
  const disconnect = onDisconnect(watchRef);
  let stopped = false;

  const active = () => ({ questionId, status: "active" });
  const away = () => ({ questionId, status: "away", awayAt: serverTimestamp() });
  const write = (value: ReturnType<typeof active> | ReturnType<typeof away>) => {
    if (!stopped) void set(watchRef, value).catch(() => undefined);
  };
  const markAway = () => write(away());
  const handleVisibility = () => write(document.visibilityState === "hidden" ? away() : active());

  void disconnect.set(away()).catch(() => undefined);
  handleVisibility();
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", markAway);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", markAway);
    void disconnect.cancel().catch(() => undefined);
    void remove(watchRef).catch(() => undefined);
  };
}

export async function findMatchByTeamCode(teamCode: string): Promise<string | null> {
  await ensureAuth();
  const normalized = teamCode.trim().toUpperCase();
  const matchCode = normalized.split("-")[0];
  if (!matchCode) return null;
  const snapshot = await get(ref(db, `matches/${matchCode}/teams/${normalized}`));
  return snapshot.exists() ? matchCode : null;
}

export async function joinTeam(matchCode: string, teamCode: string, name: string): Promise<Player> {
  const result = await gameAction<{ player: Player }>("joinTeam", { matchCode, teamCode, name });
  return result.player;
}

export async function leaveMatch(matchCode: string, playerId: string) {
  await gameAction("leaveMatch", { matchCode, playerId });
}

export async function startMatch(matchCode: string, firstTeamCode: string) {
  await gameAction("startMatch", { matchCode, firstTeamCode });
}

export async function getUsageStats(): Promise<UsageStats> {
  return gameAction<UsageStats>("getUsageStats", {});
}

export function typeCap(match: Pick<Match, "totalRounds" | "teamOrder" | "enabledTypes" | "questionsPerTeam" | "typeCaps">, type?: QuestionType): number {
  if (type && Number.isFinite(match.typeCaps?.[type])) return match.typeCaps![type];
  if (match.enabledTypes.length <= 1) return match.questionsPerTeam ?? Math.ceil(match.totalRounds / Math.max(1, match.teamOrder.length));
  const perTeam = Math.ceil(match.totalRounds / Math.max(1, match.teamOrder.length));
  return Math.max(3, Math.ceil(perTeam / 2));
}

export interface TypeProgress {
  used: number;
  cap: number;
  left: number;
  nextLevel: QuestionLevel;
  nextPoints: number;
  available: boolean;
}

export function typeProgress(match: Match, teamCode: string, type: QuestionType): TypeProgress {
  const used = match.typeCounts?.[teamCode]?.[type] ?? 0;
  const teamUsed = Object.values(match.typeCounts?.[teamCode] ?? {})
    .reduce<number>((total, count) => total + (Number(count) || 0), 0);
  const cap = typeCap(match, type);
  return {
    used,
    cap,
    left: Math.max(0, cap - used),
    nextLevel: levelForPick(teamUsed + 1, match.difficulty ?? "mixed", match.difficultyLevels),
    nextPoints: pointsForPick(used + 1),
    available: used < cap,
  };
}

export async function chooseType(matchCode: string, type: QuestionType): Promise<"accepted" | "late" | "cap" | "empty" | "error"> {
  const requestId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const send = () => gameAction<{ status: "accepted" | "late" | "cap" | "empty" }>("chooseType", { matchCode, type, requestId });
  try {
    const result = await send();
    return result.status;
  } catch {
    // نفس requestId يجعل الإعادة آمنة حتى لو وصل الطلب الأول وفقد الرد.
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    try {
      const result = await send();
      return result.status;
    } catch {
      return "error";
    }
  }
}

export async function submitAnswer(matchCode: string, playerId: string, playerName: string, choice: number): Promise<"accepted" | "late" | "error"> {
  try {
    const result = await gameAction<{ status: "accepted" | "late" }>("submitAnswer", { matchCode, playerId, playerName, choice });
    return result.status;
  } catch {
    return "error";
  }
}

export async function submitShowdownAnswer(
  matchCode: string,
  playerId: string,
  choice: number,
): Promise<{ status: "accepted" | "early" | "late" | "error"; correct?: boolean }> {
  try {
    return await gameAction("submitShowdownAnswer", { matchCode, playerId, choice });
  } catch {
    return { status: "error" };
  }
}

export async function finishShowdown(matchCode: string): Promise<boolean> {
  const result = await gameAction<{ finished: boolean }>("finishShowdown", { matchCode });
  return result.finished;
}

export function isShowdownDue(match: Match): boolean {
  if (match.tieBreaker?.active || !match.state.round) return false;
  const interval = 3 * Math.max(1, match.teamOrder.length);
  return match.state.round % interval === 0
    && (match.showdownCount ?? 0) < Math.floor(match.state.round / interval);
}

export async function useAssist(matchCode: string, teamCode: string): Promise<boolean> {
  try {
    const result = await gameAction<{ accepted: boolean }>("useAssist", { matchCode, teamCode });
    return result.accepted;
  } catch {
    return false;
  }
}

export async function usePowerCard(
  matchCode: string,
  teamCode: string,
  card: PowerCardId,
  targetPlayerId?: string,
): Promise<{ accepted: boolean; reason?: string }> {
  try {
    return await gameAction<{ accepted: boolean; reason?: string }>("usePowerCard", { matchCode, teamCode, card, targetPlayerId });
  } catch {
    return { accepted: false, reason: "error" };
  }
}

export async function judgeVerbal(matchCode: string, _match: Match, correct: boolean) {
  void _match;
  await gameAction("judgeVerbal", { matchCode, correct });
}

export async function revealAnswer(matchCode: string, _match: Match) {
  void _match;
  await gameAction("revealAnswer", { matchCode });
}

export async function passToNextTeam(matchCode: string, _match: Match) {
  void _match;
  await gameAction("passToNextTeam", { matchCode });
}

export async function advanceTurn(matchCode: string, _match: Match) {
  void _match;
  await gameAction("advanceTurn", { matchCode });
}

export async function endMatch(matchCode: string) {
  await gameAction("endMatch", { matchCode });
}

export async function deleteMatch(matchCode: string) {
  await gameAction("deleteMatch", { matchCode });
}

export async function setCaptain(matchCode: string, teamCode: string, playerId: string | null) {
  await gameAction("setCaptain", { matchCode, teamCode, playerId });
}

export async function setAnswerMode(matchCode: string, answerMode: AnswerMode) {
  await gameAction("setAnswerMode", { matchCode, answerMode });
}

export async function submitHostAnswer(matchCode: string, choice: number): Promise<"accepted" | "late"> {
  const result = await gameAction<{ status: "accepted" | "late" }>("submitHostAnswer", { matchCode, choice });
  return result.status;
}

export async function startQuestionTimer(matchCode: string) {
  await gameAction("startQuestionTimer", { matchCode });
}

export async function getHostAnswer(matchCode: string): Promise<number | null> {
  // حالة السؤال تصل لحظياً قبل كتابة السر بجزء بسيط من الثانية أحياناً.
  // نعيد القراءة فترة قصيرة حتى لا تبقى إجابة العلم فارغة عند المقدم.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await gameAction<{ answer: number | null }>("getHostAnswer", { matchCode });
    if (result.answer !== null) return result.answer;
    if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
  }
  return null;
}

export async function startSoloChallenge(): Promise<{ sessionId: string; questions: import("../types/game").Question[] }> {
  return gameAction("startChallenge", {});
}

export async function answerSoloChallenge(sessionId: string, index: number, choice: number): Promise<{ correct: boolean; answer: number }> {
  return gameAction("answerChallenge", { sessionId, index, choice });
}

export { TEAM_COLORS };
export type { TeamColor };
