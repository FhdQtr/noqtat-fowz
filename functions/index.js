const { readFileSync } = require("node:fs");
const { randomInt } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp({ databaseURL: "https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app" });
const db = getDatabase();
const QUESTIONS = JSON.parse(readFileSync(require.resolve("./questions.json"), "utf8"));
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const COLORS = ["maroon", "emerald", "royal", "gold"];
const POWER_CARD_BASE_COST = { extraTime: 100, swapQuestion: 150, pickPlayer: 200, doublePoints: 200, freeze: 250, steal: 300 };
const LOBBY_TTL_MS = 10 * 60 * 1000;

function fail(code, message) { throw new HttpsError(code, message); }
function text(value, max = 30) { return String(value ?? "").trim().slice(0, max); }
function code(value) { return text(value, 12).toUpperCase(); }
function dbKey(value) { return text(value, 50).replace(/[.#$\[\]\/]/g, "_"); }
function now() { return Date.now(); }
function matchCode() { return LETTERS[randomInt(LETTERS.length)] + Array.from({ length: 3 }, () => DIGITS[randomInt(DIGITS.length)]).join(""); }
function levelForPick(n, difficulty = "mixed") {
  if (["easy", "medium", "hard"].includes(difficulty)) return difficulty;
  return n <= 1 ? "easy" : n === 2 ? "medium" : "hard";
}
function pointsForPick(n) { return Math.min(250, Math.max(50, n * 50)); }
function powerCardCost(card, questionsPerTeam = 8) {
  const scaled = (POWER_CARD_BASE_COST[card] || 0) * Math.max(1, questionsPerTeam) / 8;
  return Math.max(50, Math.round(scaled / 50) * 50);
}
function typeCap(match) {
  if (match.enabledTypes.length <= 1) return 99;
  const perTeam = Math.ceil(match.totalRounds / Math.max(1, match.teamOrder.length));
  return Math.max(3, Math.ceil(perTeam / 2));
}
function publicQuestion(question) { return { ...question, answer: -1 }; }
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
  if (question.type === "memory") {
    if (question.level === "easy") return 12;
    if (question.level === "hard") return 8;
    return 10;
  }
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
  return players.length > 0;
}
async function acquireClaim(claimRef, claimId) {
  const transaction = await claimRef.transaction((currentClaim) => {
    // Firebase may call a transaction first with null while its local cache is cold.
    // A missing value is exactly the unlocked state for this small claim node.
    if (currentClaim === null || currentClaim === undefined || currentClaim === claimId) return claimId;
    return;
  }, undefined, false);
  return transaction.snapshot.val() === claimId;
}
async function releaseClaim(claimRef, claimId) {
  await claimRef.transaction((currentClaim) => currentClaim === claimId ? null : currentClaim, undefined, false);
}
async function loadMatch(rawCode) {
  const id = code(rawCode);
  const snapshot = await db.ref(`matches/${id}`).get();
  if (!snapshot.exists()) fail("not-found", "الميدان غير موجود");
  return { id, match: snapshot.val() };
}
function requireHost(match, uid) {
  if (!uid || match.hostUid !== uid) fail("permission-denied", "هذه العملية للمقدم فقط");
}

async function createMatch(uid, options) {
  const names = Array.isArray(options?.teamNames) ? options.teamNames.slice(0, 4) : [];
  if (names.length < 2) fail("invalid-argument", "اختر فريقين على الأقل");
  const enabledTypes = Array.isArray(options.enabledTypes) ? [...new Set(options.enabledTypes.map((x) => text(x, 50)).filter(Boolean))] : [];
  if (!enabledTypes.length) fail("invalid-argument", "اختر نوع سؤال واحداً على الأقل");
  // توافق مؤقت مع الواجهة الحالية في الإنتاج التي ترسل totalRounds،
  // ومع الواجهة الجديدة التي ترسل questionsPerTeam.
  const requestedPerTeam = Number(options.questionsPerTeam);
  const hasPerTeam = Number.isFinite(requestedPerTeam) && requestedPerTeam > 0;
  const questionsPerTeam = hasPerTeam
    ? Math.min(12, Math.max(1, requestedPerTeam))
    : Math.ceil(Math.min(40, Math.max(4, Number(options.totalRounds) || 12)) / names.length);
  const totalRounds = hasPerTeam
    ? questionsPerTeam * names.length
    : Math.min(40, Math.max(4, Number(options.totalRounds) || 12));
  const timer = Math.min(120, Math.max(0, Number(options.timer) || 0));
  const difficulty = ["easy", "medium", "hard", "mixed"].includes(options.difficulty) ? options.difficulty : "medium";
  const answerMode = ["anyone", "representative", "host"].includes(options.answerMode) ? options.answerMode : "representative";
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = matchCode();
    if ((await db.ref(`matches/${id}`).get()).exists()) continue;
    const teams = {};
    const teamOrder = [];
    names.forEach((name, index) => {
      const teamCode = `${id}-${index + 1}`;
      teamOrder.push(teamCode);
      teams[teamCode] = {
        code: teamCode,
        name: text(name, 16) || `فريق ${index + 1}`,
        color: COLORS[index],
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        cardBalance: 0,
        powerCards: { extraTime: true, doublePoints: true, swapQuestion: true, freeze: true, steal: true, pickPlayer: true },
      };
    });
    const createdAt = now();
    const match = {
      hostUid: uid,
      hostName: text(options.hostName, 20) || "المقدم",
      createdAt, expiresAt: createdAt + LOBBY_TTL_MS, status: "lobby", teamOrder, turnIndex: 0, questionsPerTeam, totalRounds, timer, difficulty, answerMode, enabledTypes, teams,
      state: { phase: "lobby", round: 0, targetTeam: null, originalTeam: null, passCount: 0, question: null, answer: null, isCorrect: null, timer, questionStartedAt: null, questionDuration: null, selectionRequestId: null, usedIds: [], questionValue: 0, viewUntil: null, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false, stealFullValue: false, forcedPlayerId: null, forcedPlayerName: null, cardsFrozenTeam: null, cardUsedThisTurn: false },
    };
    await db.ref(`matches/${id}`).set(match);
    return { code: id };
  }
  fail("resource-exhausted", "تعذّر إنشاء كود جديد، حاول مرة ثانية");
}

async function joinTeam(uid, data) {
  const { id, match } = await loadMatch(data.matchCode);
  const teamCode = code(data.teamCode);
  if (!match.teams?.[teamCode]) fail("not-found", "الفريق غير موجود");
  if (match.status === "ended") fail("failed-precondition", "انتهى هذا الميدان");
  const player = { id: `p_${now()}_${randomInt(100000, 999999)}`, name: text(data.name, 20) || "لاعب", teamCode, joinedAt: now(), authUid: uid };
  await db.ref(`matches/${id}/players/${player.id}`).set(player);
  return { player };
}

async function startChallenge(uid) {
  const schedule = ["easy", "easy", "easy", "medium", "medium", "medium", "hard", "hard", "hard", "hard"];
  const selected = [];
  const used = new Set();
  for (const level of schedule) {
    const pool = QUESTIONS.filter((q) => !q.disabled && q.level === level && !["flag", "acting"].includes(q.type) && Array.isArray(q.options) && q.options.length > 0 && !used.has(q.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.slice(0, 10).forEach((question) => {
      const q = shuffled(question);
      used.add(q.id);
      selected.push(q);
    });
  }
  if (selected.length < 100) fail("resource-exhausted", "بنك التحدي لا يحتوي أسئلة كافية");
  const sessionId = `${now()}_${randomInt(100000, 999999)}`;
  await db.ref(`challengeSecrets/${uid}`).set({ [sessionId]: { createdAt: now(), answers: selected.map((q) => q.answer), ids: selected.map((q) => q.id) } });
  return { sessionId, questions: selected.map(publicQuestion) };
}

async function answerChallenge(uid, data) {
  const sessionId = text(data.sessionId, 80);
  const index = Number(data.index);
  const choice = Number(data.choice);
  if (!Number.isInteger(index) || index < 0 || index >= 100) fail("invalid-argument", "رقم السؤال غير صالح");
  const snapshot = await db.ref(`challengeSecrets/${uid}/${sessionId}`).get();
  if (!snapshot.exists()) fail("not-found", "انتهت جلسة التحدي");
  const session = snapshot.val();
  if (now() - session.createdAt > 4 * 60 * 60 * 1000) fail("deadline-exceeded", "انتهت صلاحية جلسة التحدي");
  const answer = session.answers[index];
  return { correct: choice === answer, answer };
}

async function chooseType(uid, data) {
  const { id, match } = await loadMatch(data.matchCode);
  const type = text(data.type, 50);
  const typeKey = dbKey(type);
  const requestId = text(data.requestId, 80) || `${uid}_${now()}_${randomInt(100000, 999999)}`;
  const teamCode = match.state.targetTeam || match.teamOrder[match.turnIndex % match.teamOrder.length];
  if (!canChoose(match, uid, teamCode)) fail("permission-denied", "الاختيار للفريق صاحب الدور");
  if (match.state.phase === "question" && match.state.selectionRequestId === requestId) return { status: "accepted" };
  if (match.state.phase !== "choose" || match.state.question) {
    return { status: "late", reason: "initial-state", phase: match.state.phase, hasQuestion: Boolean(match.state.question) };
  }
  if (!match.enabledTypes.includes(type)) fail("invalid-argument", "نوع السؤال غير مفعّل");
  const usedCount = match.typeCounts?.[teamCode]?.[type] || 0;
  if (usedCount >= typeCap(match)) return { status: "cap" };
  let candidates;
  if (type.startsWith("ct_")) {
    const custom = (await db.ref("customQuestions").get()).val() || {};
    candidates = Object.values(custom);
  } else candidates = QUESTIONS;
  const usedIds = new Set(match.state.usedIds || []);
  const level = levelForPick(usedCount + 1, match.difficulty || "mixed");
  const pool = candidates.filter((q) => q.type === type && q.level === level && !q.disabled && !usedIds.has(q.id));
  if (!pool.length) return { status: "empty" };

  // سجل دائم للمقدم: لا نكرر السؤال بين المسابقات حتى ينتهي مخزون النوع/المستوى.
  const historyOwner = match.hostUid || uid;
  const historyRef = db.ref(`hostQuestionHistory/${historyOwner}/${typeKey}/${level}`);
  const history = (await historyRef.get()).val() || {};
  let available = pool.filter((q) => !history[q.id]);
  if (!available.length) {
    await historyRef.remove();
    available = pool;
  }

  // «مثّل المثل»: القطري غير المستخدم أولاً، ثم الخليجي.
  if (type === "acting") {
    const qatari = available.filter((q) => q.region === "qatari");
    if (qatari.length) available = qatari;
    else {
      const gulf = available.filter((q) => q.region === "gulf");
      if (gulf.length) available = gulf;
    }
  }

  const question = shuffled(available[randomInt(available.length)]);
  const started = now();
  const seconds = viewSeconds(question);
  const viewUntil = seconds ? started + seconds * 1000 : null;
  const isActing = question.type === "acting";
  const stateRef = db.ref(`matches/${id}/state`);
  const claimRef = stateRef.child("selectionRequestId");
  if (!await acquireClaim(claimRef, requestId)) return { status: "late", reason: "claimed" };

  try {
    const latestState = (await stateRef.get()).val();
    if (latestState?.phase === "question" && latestState.selectionRequestId === requestId) {
      return { status: "accepted" };
    }
    if (!latestState || latestState.phase !== "choose" || latestState.question || latestState.targetTeam !== teamCode) {
      await releaseClaim(claimRef, requestId);
      return { status: "late", reason: "state-changed" };
    }

    const nextState = {
      ...latestState,
      phase: "question",
      round: latestState.round + 1,
      targetTeam: teamCode,
      originalTeam: teamCode,
      passCount: 0,
      attemptedTeams: [],
      question: publicQuestion(question),
      answer: null,
      isCorrect: null,
      questionStartedAt: isActing ? null : (viewUntil || started),
      questionDuration: isActing ? 120 : match.timer,
      selectionRequestId: requestId || null,
      viewUntil,
      assistUsed: false,
      pointMultiplier: latestState.pointMultiplier || 1,
      extraTimeUsed: false,
      stealFullValue: false,
      forcedPlayerId: null,
      forcedPlayerName: null,
      cardsFrozenTeam: latestState.cardsFrozenTeam || null,
      cardUsedThisTurn: Boolean(latestState.cardUsedThisTurn),
      questionValue: pointsForPick(usedCount + 1),
      usedIds: [...(latestState.usedIds || []), question.id],
    };

    // السؤال وإجابته السرية والعدادات تُثبّت معاً، فلا تصل الواجهة إلى سؤال بلا سر.
    await db.ref().update({
      [`matches/${id}/state`]: nextState,
      [`matchSecrets/${id}`]: { questionId: question.id, answer: question.answer },
      [`matches/${id}/typeCounts/${teamCode}/${typeKey}`]: usedCount + 1,
      [`hostQuestionHistory/${historyOwner}/${typeKey}/${level}/${question.id}`]: started,
    });
    return { status: "accepted" };
  } catch (error) {
    await releaseClaim(claimRef, requestId);
    throw error;
  }
}

async function submitAnswer(uid, data) {
  const { id, match } = await loadMatch(data.matchCode);
  const player = playerForUid(match, uid, text(data.playerId, 80));
  if (!player || player.teamCode !== match.state.targetTeam) fail("permission-denied", "الإجابة للفريق صاحب السؤال");
  const answerMode = match.answerMode || "anyone";
  if (answerMode === "host") fail("permission-denied", "المقدم هو من يثبت الإجابة");
  const representativeId = match.teams[player.teamCode]?.captainId;
  if (answerMode === "representative" && representativeId !== player.id) fail("permission-denied", "الإجابة لممثل الفريق");
  if (match.state.forcedPlayerId && match.state.forcedPlayerId !== player.id) fail("permission-denied", "الإجابة للاعب الذي اختاره الفريق المنافس");
  const choice = Number(data.choice);
  if (match.state.phase !== "question" || match.state.answer || !Number.isInteger(choice) || choice < 0 || choice >= (match.state.question?.options?.length || 0)) return { status: "late" };
  const stateRef = db.ref(`matches/${id}/state`);
  const claimId = `${uid}_${now()}_${randomInt(100000, 999999)}`;
  const claimRef = stateRef.child("answerClaimId");
  if (!await acquireClaim(claimRef, claimId)) return { status: "late" };
  try {
    const latestState = (await stateRef.get()).val();
    if (!latestState || latestState.phase !== "question" || latestState.answer || latestState.answerClaimId !== claimId) {
      await releaseClaim(claimRef, claimId);
      return { status: "late" };
    }
    await stateRef.update({
      phase: "locked",
      answer: { playerId: player.id, playerName: player.name, choice, at: now() },
      answerClaimId: null,
    });
    return { status: "accepted" };
  } catch (error) {
    await releaseClaim(claimRef, claimId);
    throw error;
  }
}

async function submitHostAnswer(uid, data) {
  const { id, match } = await loadMatch(data.matchCode);
  requireHost(match, uid);
  if (match.answerMode !== "host") fail("failed-precondition", "وضع الإجابة ليس للمقدم");
  const choice = Number(data.choice);
  if (match.state.phase !== "question" || match.state.answer || !Number.isInteger(choice) || choice < 0 || choice >= (match.state.question?.options?.length || 0)) return { status: "late" };
  const stateRef = db.ref(`matches/${id}/state`);
  const claimId = `${uid}_${now()}_${randomInt(100000, 999999)}`;
  const claimRef = stateRef.child("answerClaimId");
  if (!await acquireClaim(claimRef, claimId)) return { status: "late" };
  try {
    const latestState = (await stateRef.get()).val();
    if (!latestState || latestState.phase !== "question" || latestState.answer || latestState.answerClaimId !== claimId) {
      await releaseClaim(claimRef, claimId);
      return { status: "late" };
    }
    await stateRef.update({
      phase: "locked",
      answer: { playerId: "host", playerName: match.hostName || "المقدم", choice, at: now() },
      answerClaimId: null,
    });
    return { status: "accepted" };
  } catch (error) {
    await releaseClaim(claimRef, claimId);
    throw error;
  }
}

async function reveal(id, match, correctOverride) {
  const state = match.state;
  if (!["question", "locked"].includes(state.phase)) fail("failed-precondition", "تم كشف هذا السؤال مسبقاً");
  const secret = (await db.ref(`matchSecrets/${id}`).get()).val();
  if (!state.question || !secret || secret.questionId !== state.question.id) fail("failed-precondition", "تعذّر التحقق من السؤال");
  const correct = typeof correctOverride === "boolean" ? correctOverride : state.answer?.choice === secret.answer;
  const teamCode = state.targetTeam;
  const team = match.teams[teamCode];
  const attemptedTeams = correct
    ? (state.attemptedTeams || [])
    : [...new Set([...(state.attemptedTeams || []), teamCode])];
  const canPass = !correct
    && !isTrueFalse(state.question)
    && match.teamOrder.some((candidate) => !attemptedTeams.includes(candidate));
  const updates = {
    [`matches/${id}/state/phase`]: "revealed",
    [`matches/${id}/state/isCorrect`]: correct,
    [`matches/${id}/state/attemptedTeams`]: attemptedTeams,
    [`matches/${id}/state/question/answer`]: correct || !canPass ? secret.answer : -1,
    [`matches/${id}/teams/${teamCode}/correctCount`]: team.correctCount + (correct ? 1 : 0),
    [`matches/${id}/teams/${teamCode}/wrongCount`]: team.wrongCount + (correct ? 0 : 1),
  };
  if (correct) {
    updates[`matches/${id}/teams/${teamCode}/score`] = team.score + points(state);
    updates[`matches/${id}/teams/${teamCode}/cardBalance`] = (team.cardBalance || 0) + cardReward(state);
  }
  await db.ref().update(updates);
  return { correct };
}

async function advance(id, match) {
  const state = match.state;
  if (state.round < match.totalRounds) {
    let nextTeam;
    const updates = { turnIndex: match.turnIndex + 1, "state/phase": "choose", "state/question": null, "state/answer": null, "state/isCorrect": null, "state/viewUntil": null, "state/questionStartedAt": null, "state/questionDuration": null, "state/selectionRequestId": null, "state/attemptedTeams": null, "state/answerClaimId": null, "state/cardClaimId": null, "state/assistUsed": false, "state/questionValue": null, "state/pointMultiplier": 1, "state/extraTimeUsed": false, "state/stealFullValue": false, "state/forcedPlayerId": null, "state/forcedPlayerName": null, "state/cardsFrozenTeam": null, "state/cardUsedThisTurn": false };
    if (match.tieBreaker?.active) {
      const cursor = match.tieBreaker.cursor + 1;
      nextTeam = match.tieBreaker.teams[cursor % match.tieBreaker.teams.length];
      updates["tieBreaker/cursor"] = cursor;
    } else nextTeam = match.teamOrder[(match.turnIndex + 1) % match.teamOrder.length];
    updates["state/targetTeam"] = nextTeam;
    await db.ref(`matches/${id}`).update(updates);
    return { ended: false };
  }
  const candidates = match.tieBreaker?.active ? match.tieBreaker.teams : match.teamOrder;
  const high = Math.max(...candidates.map((team) => match.teams[team].score));
  const tied = candidates.filter((team) => match.teams[team].score === high);
  if (tied.length > 1) {
    const cycle = (match.tieBreaker?.cycle || 0) + 1;
    await db.ref(`matches/${id}`).update({ totalRounds: state.round + tied.length, turnIndex: match.turnIndex + 1, tieBreaker: { active: true, teams: tied, cursor: 0, cycle }, "state/phase": "choose", "state/question": null, "state/answer": null, "state/isCorrect": null, "state/targetTeam": tied[0], "state/viewUntil": null, "state/questionStartedAt": null, "state/questionDuration": null, "state/selectionRequestId": null, "state/attemptedTeams": null, "state/answerClaimId": null, "state/cardClaimId": null, "state/assistUsed": false, "state/questionValue": null, "state/pointMultiplier": 1, "state/extraTimeUsed": false, "state/stealFullValue": false, "state/forcedPlayerId": null, "state/forcedPlayerName": null, "state/cardsFrozenTeam": null, "state/cardUsedThisTurn": false });
    return { ended: false, tieBreaker: true };
  }
  await db.ref(`matches/${id}`).update({ status: "ended", "state/phase": "ended", turnIndex: match.turnIndex + 1 });
  return { ended: true };
}

async function playPowerCard(uid, data, id, initialMatch) {
  const teamCode = code(data.teamCode);
  const card = text(data.card, 30);
  if (!POWER_CARD_BASE_COST[card]) return { accepted: false, reason: "unknown" };
  if (!canPlayFor(initialMatch, uid, teamCode)) fail("permission-denied", "هذا الكرت ليس لفريقك");

  const claimId = `${uid}_${now()}_${randomInt(100000, 999999)}`;
  const matchRef = db.ref(`matches/${id}`);
  const claimRef = matchRef.child("state/cardClaimId");
  if (!await acquireClaim(claimRef, claimId)) return { accepted: false, reason: "busy" };

  try {
    const match = (await matchRef.get()).val();
    const state = match?.state;
    const team = match?.teams?.[teamCode];
    if (!state || !team || !canPlayFor(match, uid, teamCode)) return { accepted: false, reason: "team" };
    if (state.cardClaimId !== claimId || state.cardUsedThisTurn) return { accepted: false, reason: "turn-used" };
    if (state.cardsFrozenTeam === teamCode) return { accepted: false, reason: "frozen" };
    if (team.powerCards?.[card] === false) return { accepted: false, reason: "used" };

    const cost = powerCardCost(card, match.questionsPerTeam || Math.ceil(match.totalRounds / match.teamOrder.length));
    const balance = Number(team.cardBalance) || 0;
    if (balance < cost) return { accepted: false, reason: "balance" };

    const targetTeam = state.targetTeam;
    const event = {
      id: `${now()}_${randomInt(100000, 999999)}`,
      card,
      byTeam: teamCode,
      targetTeam: null,
      targetPlayerId: null,
      targetPlayerName: null,
      at: now(),
    };
    const updates = {
      [`teams/${teamCode}/cardBalance`]: balance - cost,
      [`teams/${teamCode}/powerCards/${card}`]: false,
      "state/cardUsedThisTurn": true,
      "state/cardClaimId": null,
    };

    if (card === "doublePoints") {
      if (state.phase !== "choose" || targetTeam !== teamCode || state.question) return { accepted: false, reason: "timing" };
      updates["state/pointMultiplier"] = 2;
    } else if (card === "extraTime") {
      if (state.phase !== "question" || targetTeam !== teamCode || state.answer || state.extraTimeUsed) return { accepted: false, reason: "timing" };
      if (state.question?.type === "acting" || !(state.questionDuration || match.timer)) return { accepted: false, reason: "timer" };
      updates["state/extraTimeUsed"] = true;
    } else if (card === "freeze") {
      if (state.phase !== "choose" || !targetTeam || targetTeam === teamCode || state.question) return { accepted: false, reason: "timing" };
      updates["state/cardsFrozenTeam"] = targetTeam;
      event.targetTeam = targetTeam;
    } else if (card === "pickPlayer") {
      if (state.phase !== "question" || !targetTeam || targetTeam === teamCode || state.answer || match.answerMode !== "anyone") return { accepted: false, reason: "timing" };
      if (state.question?.type === "acting" || (state.question?.type === "flag" && !state.assistUsed)) return { accepted: false, reason: "verbal" };
      const targetPlayerId = text(data.targetPlayerId, 80);
      const targetPlayer = match.players?.[targetPlayerId];
      const eligible = Object.values(match.players || {}).filter((player) => player.teamCode === targetTeam);
      if (eligible.length < 2 || !targetPlayer || targetPlayer.teamCode !== targetTeam) return { accepted: false, reason: "player" };
      updates["state/forcedPlayerId"] = targetPlayer.id;
      updates["state/forcedPlayerName"] = targetPlayer.name;
      event.targetTeam = targetTeam;
      event.targetPlayerId = targetPlayer.id;
      event.targetPlayerName = targetPlayer.name;
    } else if (card === "swapQuestion") {
      if (state.phase !== "question" || targetTeam !== teamCode || state.answer || !state.question) return { accepted: false, reason: "timing" };
      let candidates;
      if (state.question.type.startsWith("ct_")) {
        const custom = (await db.ref("customQuestions").get()).val() || {};
        candidates = Object.values(custom);
      } else candidates = QUESTIONS;
      const usedIds = new Set(state.usedIds || []);
      const pool = candidates.filter((question) => question.type === state.question.type && question.level === state.question.level && !question.disabled && !usedIds.has(question.id));
      if (!pool.length) return { accepted: false, reason: "empty" };
      const question = shuffled(pool[randomInt(pool.length)]);
      const started = now();
      const seconds = viewSeconds(question);
      const viewUntil = seconds ? started + seconds * 1000 : null;
      const isActing = question.type === "acting";
      updates["state/question"] = publicQuestion(question);
      updates["state/usedIds"] = [...usedIds, question.id];
      updates["state/viewUntil"] = viewUntil;
      updates["state/questionStartedAt"] = isActing ? null : (viewUntil || started);
      updates["state/questionDuration"] = isActing ? 120 : match.timer;
      updates["state/assistUsed"] = false;
      updates["state/forcedPlayerId"] = null;
      updates["state/forcedPlayerName"] = null;
      await db.ref().update({
        [`matches/${id}/teams/${teamCode}/cardBalance`]: balance - cost,
        [`matches/${id}/teams/${teamCode}/powerCards/${card}`]: false,
        [`matches/${id}/state/question`]: publicQuestion(question),
        [`matches/${id}/state/usedIds`]: [...usedIds, question.id],
        [`matches/${id}/state/viewUntil`]: viewUntil,
        [`matches/${id}/state/questionStartedAt`]: isActing ? null : (viewUntil || started),
        [`matches/${id}/state/questionDuration`]: isActing ? 120 : match.timer,
        [`matches/${id}/state/assistUsed`]: false,
        [`matches/${id}/state/forcedPlayerId`]: null,
        [`matches/${id}/state/forcedPlayerName`]: null,
        [`matches/${id}/state/cardUsedThisTurn`]: true,
        [`matches/${id}/state/cardClaimId`]: null,
        [`matches/${id}/state/cardEvent`]: event,
        [`matchSecrets/${id}`]: { questionId: question.id, answer: question.answer },
      });
      return { accepted: true };
    } else if (card === "steal") {
      const attemptedTeams = [...new Set([...(state.attemptedTeams || []), targetTeam].filter(Boolean))];
      if (state.phase !== "revealed" || state.isCorrect !== false || !state.question || targetTeam === teamCode) return { accepted: false, reason: "timing" };
      if (isTrueFalse(state.question) || attemptedTeams.includes(teamCode)) return { accepted: false, reason: "ineligible" };
      const seconds = viewSeconds(state.question);
      const started = now();
      const viewUntil = seconds ? started + seconds * 1000 : null;
      const isActing = state.question.type === "acting";
      updates["state/phase"] = "question";
      updates["state/targetTeam"] = teamCode;
      updates["state/passCount"] = (state.passCount || 0) + 1;
      updates["state/attemptedTeams"] = attemptedTeams;
      updates["state/answer"] = null;
      updates["state/isCorrect"] = null;
      updates["state/questionStartedAt"] = isActing ? null : (viewUntil || started);
      updates["state/questionDuration"] = isActing ? 120 : match.timer;
      updates["state/viewUntil"] = viewUntil;
      updates["state/assistUsed"] = false;
      updates["state/pointMultiplier"] = 1;
      updates["state/extraTimeUsed"] = false;
      updates["state/stealFullValue"] = true;
      updates["state/forcedPlayerId"] = null;
      updates["state/forcedPlayerName"] = null;
      event.targetTeam = teamCode;
    }

    updates["state/cardEvent"] = event;
    await matchRef.update(updates);
    return { accepted: true };
  } finally {
    await releaseClaim(claimRef, claimId);
  }
}

exports.gameAction = onCall({ region: "asia-southeast1", enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) fail("unauthenticated", "سجّل الدخول أولاً");
  const data = request.data || {};
  const action = text(data.action, 40);
  if (action === "startChallenge") return startChallenge(uid);
  if (action === "answerChallenge") return answerChallenge(uid, data);
  if (action === "createMatch") return createMatch(uid, data.options || {});
  if (action === "joinTeam") return joinTeam(uid, data);
  if (action === "chooseType") return chooseType(uid, data);
  if (action === "submitAnswer") return submitAnswer(uid, data);
  if (action === "submitHostAnswer") return submitHostAnswer(uid, data);

  const { id, match } = await loadMatch(data.matchCode);
  if (action === "getMatch") return { match };
  if (action === "getHostAnswer") {
    requireHost(match, uid);
    const secret = (await db.ref(`matchSecrets/${id}`).get()).val();
    return { answer: secret?.questionId === match.state.question?.id ? secret.answer : null };
  }
  if (action === "leaveMatch") {
    const playerId = text(data.playerId, 80);
    if (!playerForUid(match, uid, playerId) && match.hostUid !== uid) fail("permission-denied", "لا يمكنك حذف لاعب آخر");
    await db.ref(`matches/${id}/players/${playerId}`).remove();
    return { ok: true };
  }
  if (action === "useAssist") {
    const teamCode = code(data.teamCode);
    if (!canPlayFor(match, uid, teamCode) || match.state.targetTeam !== teamCode) fail("permission-denied", "المساعدة للفريق صاحب السؤال");
    const latestState = (await db.ref(`matches/${id}/state`).get()).val();
    if (!latestState || latestState.phase !== "question" || latestState.question?.type !== "flag" || latestState.assistUsed || latestState.targetTeam !== teamCode) return { accepted: false };
    await db.ref(`matches/${id}/state/assistUsed`).set(true);
    return { accepted: true };
  }
  if (action === "usePowerCard") {
    return playPowerCard(uid, data, id, match);
  }

  requireHost(match, uid);
  if (action === "startMatch") {
    const first = code(data.firstTeamCode);
    if (!match.teams[first] || match.status !== "lobby") fail("failed-precondition", "لا يمكن بدء الميدان");
    if (match.answerMode === "representative") {
      const missing = match.teamOrder.some((teamCode) => {
        const representativeId = match.teams[teamCode]?.captainId;
        return !representativeId || match.players?.[representativeId]?.teamCode !== teamCode;
      });
      if (missing) fail("failed-precondition", "عيّن ممثلاً لكل فريق قبل بدء المسابقة");
    }
    await db.ref(`matches/${id}`).update({ status: "playing", startedAt: now(), expiresAt: null, "state/phase": "choose", "state/targetTeam": first });
  } else if (action === "startQuestionTimer") {
    if (match.state.phase !== "question" || match.state.question?.type !== "acting" || match.state.questionStartedAt) {
      fail("failed-precondition", "لا يوجد مؤقت تمثيل بانتظار البدء");
    }
    await db.ref(`matches/${id}/state`).update({ questionStartedAt: now(), questionDuration: 120 });
  } else if (action === "revealAnswer") {
    if (!match.state.answer) fail("failed-precondition", "لا توجد إجابة");
    return reveal(id, match);
  } else if (action === "judgeVerbal") {
    return reveal(id, match, Boolean(data.correct));
  } else if (action === "passToNextTeam") {
    if (match.state.phase !== "revealed" || match.state.isCorrect !== false) {
      fail("failed-precondition", "لا يمكن نقل السؤال قبل ظهور إجابة خاطئة");
    }
    if (isTrueFalse(match.state.question)) {
      fail("failed-precondition", "سؤال صح أو خطأ لا ينتقل لفريق آخر");
    }
    const current = match.teamOrder.indexOf(match.state.targetTeam);
    const attemptedTeams = [...new Set([...(match.state.attemptedTeams || []), match.state.targetTeam])];
    let next = null;
    for (let offset = 1; offset < match.teamOrder.length; offset += 1) {
      const candidate = match.teamOrder[(current + offset) % match.teamOrder.length];
      if (!attemptedTeams.includes(candidate)) {
        next = candidate;
        break;
      }
    }
    if (!next) fail("failed-precondition", "كل الفرق حاولت الإجابة على هذا السؤال");
    const seconds = match.state.question ? viewSeconds(match.state.question) : null;
    const until = seconds ? now() + seconds * 1000 : null;
    const isActing = match.state.question?.type === "acting";
    await db.ref(`matches/${id}/state`).set({ ...match.state, phase: "question", targetTeam: next, passCount: match.state.passCount + 1, attemptedTeams, answer: null, isCorrect: null, questionStartedAt: isActing ? null : (until || now()), questionDuration: isActing ? 120 : match.timer, viewUntil: until, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false, stealFullValue: false, forcedPlayerId: null, forcedPlayerName: null, cardClaimId: null });
  } else if (action === "advanceTurn") {
    return advance(id, match);
  } else if (action === "setCaptain") {
    const teamCode = code(data.teamCode);
    const playerId = data.playerId === null ? null : text(data.playerId, 80);
    if (!match.teams[teamCode] || (playerId && match.players?.[playerId]?.teamCode !== teamCode)) fail("invalid-argument", "اللاعب ليس في الفريق");
    await db.ref(`matches/${id}/teams/${teamCode}/captainId`).set(playerId);
  } else if (action === "setAnswerMode") {
    const answerMode = text(data.answerMode, 30);
    if (!["anyone", "representative", "host"].includes(answerMode)) fail("invalid-argument", "وضع الإجابة غير صالح");
    await db.ref(`matches/${id}/answerMode`).set(answerMode);
  } else if (action === "endMatch") {
    await db.ref(`matches/${id}`).update({ status: "ended", "state/phase": "ended" });
  } else if (action === "deleteMatch") {
    await Promise.all([db.ref(`matches/${id}`).remove(), db.ref(`matchSecrets/${id}`).remove()]);
  } else fail("invalid-argument", "عملية غير معروفة");
  return { ok: true };
});

exports.expireUnusedMatches = onSchedule({
  region: "asia-southeast1",
  schedule: "every 1 minutes",
  timeZone: "Asia/Qatar",
}, async () => {
  const cutoff = now();
  const snapshot = await db.ref("matches").orderByChild("expiresAt").endAt(cutoff).get();
  if (!snapshot.exists()) return;

  const expiredCodes = [];
  const removals = [];
  snapshot.forEach((child) => {
    const match = child.val();
    const expiresAt = match?.expiresAt || ((match?.createdAt || cutoff) + LOBBY_TTL_MS);
    if (match?.status !== "lobby" || expiresAt > cutoff) return;
    expiredCodes.push(child.key);
    removals.push(child.ref.transaction((current) => {
      const currentExpiry = current?.expiresAt || ((current?.createdAt || cutoff) + LOBBY_TTL_MS);
      if (current?.status === "lobby" && currentExpiry <= cutoff) return null;
      return;
    }, undefined, false));
  });

  const results = await Promise.all(removals);
  const secretRemovals = [];
  results.forEach((result, index) => {
    if (result.committed && !result.snapshot.exists()) {
      secretRemovals.push(db.ref(`matchSecrets/${expiredCodes[index]}`).remove());
    }
  });
  await Promise.all(secretRemovals);
});
