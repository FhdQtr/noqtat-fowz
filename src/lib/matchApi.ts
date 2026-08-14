// الميدان — واجهة اللعب الآمنة. جميع التغييرات الحساسة تُنفّذ في Cloud Functions.
import { get, onValue, ref, type Unsubscribe } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, ensureAuth, functions } from "./firebase";
import type { Match, Player, QuestionLevel, QuestionType, TeamColor } from "../types/game";
import { TEAM_COLORS } from "../types/game";

export interface CreateMatchOptions {
  hostName: string;
  teamNames: string[];
  totalRounds: number;
  timer: number;
  enabledTypes: QuestionType[];
}

type ActionName =
  | "createMatch" | "joinTeam" | "leaveMatch" | "startMatch" | "chooseType"
  | "submitAnswer" | "useAssist" | "judgeVerbal" | "revealAnswer"
  | "passToNextTeam" | "advanceTurn" | "endMatch" | "deleteMatch" | "setCaptain"
  | "startChallenge" | "answerChallenge" | "usePowerCard" | "getMatch";

function levelForPick(n: number): QuestionLevel {
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

export function typeCap(match: Pick<Match, "totalRounds" | "teamOrder" | "enabledTypes">): number {
  if (match.enabledTypes.length <= 1) return 99;
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
  const cap = typeCap(match);
  return {
    used,
    cap,
    left: Math.max(0, cap - used),
    nextLevel: levelForPick(used + 1),
    nextPoints: pointsForPick(used + 1),
    available: used < cap,
  };
}

export async function chooseType(matchCode: string, type: QuestionType): Promise<"accepted" | "late" | "cap" | "empty" | "error"> {
  try {
    const result = await gameAction<{ status: "accepted" | "late" | "cap" | "empty" }>("chooseType", { matchCode, type });
    return result.status;
  } catch {
    return "error";
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

export async function useAssist(matchCode: string, teamCode: string): Promise<boolean> {
  try {
    const result = await gameAction<{ accepted: boolean }>("useAssist", { matchCode, teamCode });
    return result.accepted;
  } catch {
    return false;
  }
}

export async function usePowerCard(matchCode: string, teamCode: string, card: "doublePoints" | "extraTime"): Promise<boolean> {
  try {
    const result = await gameAction<{ accepted: boolean }>("usePowerCard", { matchCode, teamCode, card });
    return result.accepted;
  } catch {
    return false;
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

export async function startSoloChallenge(): Promise<{ sessionId: string; questions: import("../types/game").Question[] }> {
  return gameAction("startChallenge", {});
}

export async function answerSoloChallenge(sessionId: string, index: number, choice: number): Promise<{ correct: boolean; answer: number }> {
  return gameAction("answerChallenge", { sessionId, index, choice });
}

export { TEAM_COLORS };
export type { TeamColor };
