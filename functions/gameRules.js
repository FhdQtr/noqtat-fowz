const POWER_CARD_BASE_COST = { extraTime: 50, swapQuestion: 100, pickPlayer: 150, doublePoints: 150, freeze: 150, steal: 200 };

/** Pure game rules: no database, authentication SDK or process state. */
function createGameRules({ questions: QUESTIONS, randomInt, text }) {
  function sectionCycle(match, teamCode) {
    const saved = match.sectionCycleByTeam?.[teamCode];
    const previous = !saved && match.lastChosenTypeByTeam?.[teamCode];
    const used = [...new Set(Object.values(saved?.used || (previous ? [previous] : [])))].filter((type) => match.enabledTypes.includes(type));
    return { used, number: Number(saved?.number) || 1 };
  }
  function nextSectionCycle(match, teamCode, type) {
    const cycle = sectionCycle(match, teamCode);
    const used = [...new Set([...cycle.used, type])];
    // Keep the number so an empty used list pruned by RTDB still marks a new cycle.
    return match.enabledTypes.every((enabled) => used.includes(enabled))
      ? { number: cycle.number + 1 }
      : { used, number: cycle.number };
  }
  function pointsForPick(n) { return Math.min(250, Math.max(50, n * 50)); }
  function powerCardCost(card, questionsPerTeam = 8) {
    const scaled = (POWER_CARD_BASE_COST[card] || 0) * Math.max(1, questionsPerTeam) / 8;
    return Math.max(50, Math.round(scaled / 50) * 50);
  }
  function defaultTypeCap(match) {
    if (match.enabledTypes.length <= 1) return match.questionsPerTeam || Math.ceil(match.totalRounds / Math.max(1, match.teamOrder.length));
    const perTeam = Math.ceil(match.totalRounds / Math.max(1, match.teamOrder.length));
    return Math.max(3, Math.ceil(perTeam / 2));
  }
  function typeCap(match, type) {
    const saved = Number(match.typeCaps?.[type]);
    return Number.isFinite(saved) ? saved : defaultTypeCap(match);
  }
  function fairTypeCaps(enabledTypes, teamCount, questionsPerTeam, bank = QUESTIONS) {
    const base = enabledTypes.length <= 1 ? questionsPerTeam : Math.max(3, Math.ceil(questionsPerTeam / 2));
    return Object.fromEntries(enabledTypes.map((type) => {
      const typeQuestions = bank.filter((question) => question.type === type && !question.disabled);
      if (!typeQuestions.length) return [type, base];
      const count = new Set(typeQuestions.map(questionAssetKey)).size;
      const fair = Math.floor(count / Math.max(1, teamCount));
      return [type, Math.max(0, Math.min(base, fair))];
    }));
  }
  function usesVerbalChoices(type) { return type === "flag" || type === "brand"; }
  function publicQuestion(question) {
    const { brandInfo: _privateBrandInfo, ...visible } = question;
    return { ...visible, answer: -1 };
  }
  function protectedQuestion(question) {
    const visible = publicQuestion(question);
    if (question.type === "memory") return { ...visible, question: "", options: [], promptHidden: true };
    if (usesVerbalChoices(question.type)) return { ...visible, options: [], optionsHidden: true };
    return visible;
  }
  function reprotectQuestionForAttempt(question) {
    if (!question) return question;
    if (question.type === "memory") return { ...question, question: "", options: [], promptHidden: true };
    if (usesVerbalChoices(question.type)) return { ...question, options: [], optionsHidden: true };
    return question;
  }
  function questionSecret(question) {
    return { questionId: question.id, answer: question.answer, question: question.question, options: question.options,
      ...(question.type === "brand" && question.brandInfo ? { brandInfo: {
        name: text(question.brandInfo.name, 100), industry: text(question.brandInfo.industry, 300),
        acceptedNames: (Array.isArray(question.brandInfo.acceptedNames) ? question.brandInfo.acceptedNames : []).map((name) => text(name, 100)),
      } } : {}),
    };
  }
  function questionAssetKey(question) {
    return question?.image ? `image:${String(question.image).toLowerCase()}` : `question:${question?.id}`;
  }
  function shuffled(question) {
    if (!Array.isArray(question.options) || question.options.length < 2) return { ...question };
    const tagged = question.options.map((value, index) => ({ value, correct: index === question.answer }));
    for (let i = tagged.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
    }
    return { ...question, options: tagged.map((x) => x.value), answer: tagged.findIndex((x) => x.correct) };
  }
  function viewSeconds(question) {
    if (question.type === "memory") return 10;
    if (question.type === "flag") return 10;
    if (question.video) return Math.max(1, question.video.end - question.video.start) + 3;
    return null;
  }
  function isTrueFalse(question) {
    return question?.type === "true_false" || question?.format === "tf";
  }
  function points(state) {
    const base = state.questionValue || 0;
    let result = base;
    if (state.assistUsed) result = Math.max(1, Math.round(result / 2));
    else if (state.passCount > 0 && !state.stealFullValue) result = Math.max(1, Math.round(result / 2));
    return result * (state.pointMultiplier || 1);
  }
  function cardReward(state) {
    const base = state.questionValue || 0;
    if (state.assistUsed) return Math.max(1, Math.round(base / 2));
    if (state.passCount > 0 && !state.stealFullValue) return Math.max(1, Math.round(base / 2));
    return base;
  }
  function showdownDue(match) {
    if (match.tieBreaker?.active || !match.state?.round) return false;
    const interval = 3 * Math.max(1, match.teamOrder.length);
    const completedBlocks = Math.floor(match.state.round / interval);
    return match.state.round % interval === 0 && (match.showdownCount || 0) < completedBlocks;
  }
  function playerForUid(match, uid, playerId) {
    const player = match.players?.[playerId];
    return player && player.authUid === uid ? player : null;
  }
  function canPlayFor(match, uid, teamCode) {
    if (match.hostUid === uid) return true;
    return Object.values(match.players || {}).some((player) => player.authUid === uid && player.teamCode === teamCode);
  }
  function canChoose(match, uid, teamCode) {
    if (!uid || match.hostUid === uid) return false;
    const players = Object.values(match.players || {}).filter((player) => player.authUid === uid && player.teamCode === teamCode);
    if (!players.length) return false;
    if (match.answerMode === "representative") {
      const representativeId = match.teams?.[teamCode]?.captainId;
      return Boolean(representativeId && players.some((player) => player.id === representativeId));
    }
    return true;
  }
  return {
    POWER_CARD_BASE_COST,
    sectionCycle,
    nextSectionCycle,
    pointsForPick,
    powerCardCost,
    defaultTypeCap,
    typeCap,
    fairTypeCaps,
    usesVerbalChoices,
    publicQuestion,
    protectedQuestion,
    reprotectQuestionForAttempt,
    questionSecret,
    questionAssetKey,
    shuffled,
    viewSeconds,
    isTrueFalse,
    points,
    cardReward,
    showdownDue,
    playerForUid,
    canPlayFor,
    canChoose,
  };
}

module.exports = { createGameRules };
