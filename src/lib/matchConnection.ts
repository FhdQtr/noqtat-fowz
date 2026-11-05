import { onDisconnect, onValue, ref, remove, serverTimestamp, set, type Unsubscribe } from "firebase/database";
import { db, ensureAuth } from "./firebase";
import type { Match } from "../types/game";
import { normalizeMatch } from "./normalizeMatch";
import { gameAction } from "./gameAction";

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
  let pollGeneration = 0;

  const stopPolling = () => {
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    fallbackTimer = undefined;
    pollTimer = undefined;
    polling = false;
    pollGeneration += 1;
  };

  const startPolling = () => {
    if (cancelled || polling) return;
    polling = true;
    const generation = ++pollGeneration;
    const current = () => !cancelled && polling && generation === pollGeneration;
    const poll = async () => {
      if (!current()) return;
      try {
        let match: Match | null;
        try {
          match = await fetchMatchDirect(code);
        } catch {
          if (!current()) return;
          const result = await gameAction<{ match: Match }>("getMatch", { matchCode: code });
          match = result.match;
        }
        if (!current()) return;
        received = true;
        if (timeout !== undefined) window.clearTimeout(timeout);
        onError?.("");
        cb(normalizeMatch(match));
      } catch {
        // Keep retrying until the overall connection timeout reports the error.
      } finally {
        if (current()) pollTimer = window.setTimeout(() => void poll(), 1000);
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
        if (cancelled) return;
        received = true;
        stopPolling();
        if (timeout !== undefined) window.clearTimeout(timeout);
        onError?.("");
        cb(normalizeMatch(snapshot.exists() ? snapshot.val() as Match : null));
      },
      () => startPolling(),
    );
  }).catch((error: unknown) => {
    if (cancelled) return;
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

