import { httpsCallable } from "firebase/functions";
import { ensureAuth, functions } from "./firebase";

type ActionName =
  | "getPictureGuessView" | "judgePictureGuess" | "startPictureGuessTimer" | "adjustTeamScore" | "getGameCapabilities"
  | "createMatch" | "joinTeam" | "leaveMatch" | "startMatch" | "chooseType"
  | "submitAnswer" | "useAssist" | "judgeVerbal" | "revealAnswer"
  | "passToNextTeam" | "advanceTurn" | "endMatch" | "deleteMatch" | "setCaptain"
  | "startChallenge" | "answerChallenge" | "usePowerCard" | "getMatch"
  | "submitHostAnswer" | "startQuestionTimer" | "setAnswerMode" | "getHostAnswer"
  | "submitShowdownAnswer" | "finishShowdown" | "getUsageStats" | "getTeamInvites"
  | "revealQuestionPrompt" | "resolveTeamCode" | "syncAdminAccess" | "getAdminQuestions" | "setAdminQuestionAvailability" | "deleteAdminQuestions"
  | "preparePunishment" | "judgePunishment" | "requestPunishmentOutcome" | "resolvePunishment" | "cancelPunishment";

export async function gameAction<T>(action: ActionName, payload: Record<string, unknown>): Promise<T> {
  await ensureAuth();
  const call = httpsCallable<Record<string, unknown>, T>(functions, "gameAction");
  const result = await call({ action, ...payload });
  return result.data;
}

