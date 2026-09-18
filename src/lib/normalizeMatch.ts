import type { Match } from "../types/game";

/** RTDB omits empty arrays, including deliberately hidden flag/memory options. */
export function normalizeMatch(match: Match | null): Match | null {
  const question = match?.state?.question;
  if (!match || !question || Array.isArray(question.options)) return match;
  return { ...match, state: { ...match.state, question: { ...question, options: [] } } };
}
