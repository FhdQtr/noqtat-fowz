import { useEffect, useRef, useState } from "react";
import { subscribeMatch, getHostAnswerDetails, getTeamInvites, revealQuestionPrompt } from "../../lib/matchApi";
import type { TeamInvites, HostAnswerDetails } from "../../lib/matchApi";
import type { Match } from "../../types/game";
import { questionTimerSeconds } from "../../types/game";
import { sfx } from "../../lib/sounds";
import { useNow } from "../../lib/useNow";

export function useHostRoom(code: string) {
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [connErr, setConnErr] = useState("");
  const [hostAnswer, setHostAnswer] = useState<HostAnswerDetails | null>(null);
  const [invites, setInvites] = useState<TeamInvites | null>(null);
  const prevPhase = useRef<string>("");
  const lastTimerSecond = useRef<number | null>(null);

  useEffect(() => subscribeMatch(code, setMatch, setConnErr), [code]);

  useEffect(() => {
    let cancelled = false;
    void getTeamInvites(code)
      .then((result) => { if (!cancelled) setInvites(result); })
      .catch(() => { if (!cancelled) setInvites(null); });
    return () => { cancelled = true; };
  }, [code]);

  const questionId = match?.state.question?.id ?? null;
  const pictureQuestion = match?.state.showdown?.kind === "picture_guess";
  useEffect(() => {
    let cancelled = false;
    if (questionId === null || pictureQuestion) {
      setHostAnswer(null);
      return () => { cancelled = true; };
    }
    setHostAnswer(null);
    void getHostAnswerDetails(code, questionId)
      .then((answer) => { if (!cancelled) setHostAnswer(answer); })
      .catch(() => { if (!cancelled) setHostAnswer(null); });
    return () => { cancelled = true; };
  }, [code, questionId, pictureQuestion]);

  // ساعة حيّة لعدّاد معاينة الصور (الذاكرة/الأعلام)
  const stv = match?.state;
  const now = useNow(
    stv?.viewUntil && (stv.phase === "question" || stv.phase === "locked") ? 250 : null
  );

  useEffect(() => {
    if (!stv?.question?.promptHidden || !stv.viewUntil) return;
    const timer = window.setTimeout(
      () => { void revealQuestionPrompt(code); },
      Math.max(0, stv.viewUntil - Date.now() + 100),
    );
    return () => window.clearTimeout(timer);
  }, [code, stv?.question?.id, stv?.question?.promptHidden, stv?.viewUntil]);

  // مؤقت السؤال (اختياري)
  useEffect(() => {
    lastTimerSecond.current = null;
    const duration = match ? questionTimerSeconds(match) : 0;
    if (!match || duration === 0 || match.state.phase !== "question" || !match.state.questionStartedAt) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - match.state.questionStartedAt!) / 1000);
      const total = duration + (match.state.extraTimeUsed ? 15 : 0);
      const left = Math.max(0, total - elapsed);
      if (left !== lastTimerSecond.current) {
        setTimeLeft(left);
        if (left <= 5 && left > 0) sfx.tick();
        lastTimerSecond.current = left;
      }
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [match]);

  // مؤثرات عند تغير المرحلة
  useEffect(() => {
    if (!match) return;
    const ph = match.state.phase;
    if (prevPhase.current !== ph) {
      if (ph === "locked") sfx.lock();
      if (ph === "revealed") {
        if (match.state.isCorrect) sfx.correct();
        else sfx.wrong();
      }
      if (ph === "ended") sfx.fanfare();
      prevPhase.current = ph;
    }
  }, [match]);

  return { match, timeLeft, connErr, hostAnswer, invites, now };
}
