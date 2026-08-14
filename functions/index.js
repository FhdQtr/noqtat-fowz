const { readFileSync } = require("node:fs");
const { randomInt } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp({ databaseURL: "https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app" });
const db = getDatabase();
const QUESTIONS = JSON.parse(readFileSync(require.resolve("./questions.json"), "utf8"));
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const COLORS = ["maroon", "emerald", "royal", "gold"];

function fail(code, message) { throw new HttpsError(code, message); }
function text(value, max = 30) { return String(value ?? "").trim().slice(0, max); }
function code(value) { return text(value, 12).toUpperCase(); }
function now() { return Date.now(); }
function matchCode() { return LETTERS[randomInt(LETTERS.length)] + Array.from({ length: 3 }, () => DIGITS[randomInt(DIGITS.length)]).join(""); }
function levelForPick(n) { return n <= 1 ? "easy" : n === 2 ? "medium" : "hard"; }
function pointsForPick(n) { return Math.min(250, Math.max(50, n * 50)); }
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
  if (["memory", "flag"].includes(question.type)) return 10;
  if (question.video) return Math.max(1, question.video.end - question.video.start) + 3;
  return null;
}
function points(state) {
  const base = state.questionValue || 0;
  let result = base;
  if (state.assistUsed) result = Math.max(1, Math.round(result / 4));
  else if (state.passCount > 0) result = Math.max(1, Math.round(result / 2));
  return result * (state.pointMultiplier || 1);
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
  if (match.hostUid === uid) return true;
  const players = Object.values(match.players || {}).filter((player) => player.authUid === uid && player.teamCode === teamCode);
  if (!players.length) return false;
  const captainId = match.teams?.[teamCode]?.captainId;
  return !captainId || players.some((player) => player.id === captainId);
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
  const totalRounds = Math.min(40, Math.max(4, Number(options.totalRounds) || 12));
  const timer = Math.min(120, Math.max(0, Number(options.timer) || 0));
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = matchCode();
    if ((await db.ref(`matches/${id}`).get()).exists()) continue;
    const teams = {};
    const teamOrder = [];
    names.forEach((name, index) => {
      const teamCode = `${id}-${index + 1}`;
      teamOrder.push(teamCode);
      teams[teamCode] = { code: teamCode, name: text(name, 16) || `فريق ${index + 1}`, color: COLORS[index], score: 0, correctCount: 0, wrongCount: 0, powerCards: { doublePoints: true, extraTime: true } };
    });
    const match = {
      hostUid: uid,
      hostName: text(options.hostName, 20) || "المقدم",
      createdAt: now(), status: "lobby", teamOrder, turnIndex: 0, totalRounds, timer, enabledTypes, teams,
      state: { phase: "lobby", round: 0, targetTeam: null, originalTeam: null, passCount: 0, question: null, answer: null, isCorrect: null, timer, questionStartedAt: null, usedIds: [], questionValue: 0, viewUntil: null, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false },
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
    const pool = QUESTIONS.filter((q) => q.level === level && !["flag", "acting"].includes(q.type) && Array.isArray(q.options) && q.options.length > 0 && !used.has(q.id));
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
  const teamCode = match.state.targetTeam || match.teamOrder[match.turnIndex % match.teamOrder.length];
  if (!canChoose(match, uid, teamCode)) fail("permission-denied", "الاختيار للفريق صاحب الدور");
  if (match.state.phase !== "choose" || match.state.question) return { status: "late" };
  if (!match.enabledTypes.includes(type)) fail("invalid-argument", "نوع السؤال غير مفعّل");
  const usedCount = match.typeCounts?.[teamCode]?.[type] || 0;
  if (usedCount >= typeCap(match)) return { status: "cap" };
  let candidates;
  if (type.startsWith("ct_")) {
    const custom = (await db.ref("customQuestions").get()).val() || {};
    candidates = Object.values(custom);
  } else candidates = QUESTIONS;
  const usedIds = new Set(match.state.usedIds || []);
  const level = levelForPick(usedCount + 1);
  const pool = candidates.filter((q) => q.type === type && q.level === level && !q.disabled && !usedIds.has(q.id));
  if (!pool.length) return { status: "empty" };
  const question = shuffled(pool[randomInt(pool.length)]);
  const started = now();
  const seconds = viewSeconds(question);
  const viewUntil = seconds ? started + seconds * 1000 : null;
  // Store the private answer first, then publish the question and its usage count
  // in one server-side multi-location update.
  await db.ref(`matchSecrets/${id}`).set({ questionId: question.id, answer: question.answer });
  const latestState = (await db.ref(`matches/${id}/state`).get()).val();
  if (!latestState || latestState.phase !== "choose" || latestState.question || latestState.targetTeam !== teamCode) return { status: "late" };
  const nextState = { ...latestState, phase: "question", round: latestState.round + 1, targetTeam: teamCode, originalTeam: teamCode, passCount: 0, question: publicQuestion(question), answer: null, isCorrect: null, questionStartedAt: viewUntil || started, viewUntil, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false, questionValue: pointsForPick(usedCount + 1), usedIds: [...(latestState.usedIds || []), question.id] };
  await db.ref(`matches/${id}`).update({ state: nextState, [`typeCounts/${teamCode}/${type}`]: usedCount + 1 });
  return { status: "accepted" };
}

async function submitAnswer(uid, data) {
  const { id, match } = await loadMatch(data.matchCode);
  const player = playerForUid(match, uid, text(data.playerId, 80));
  if (!player || player.teamCode !== match.state.targetTeam) fail("permission-denied", "الإجابة للفريق صاحب السؤال");
  const captainId = match.teams[player.teamCode]?.captainId;
  if (captainId && captainId !== player.id) fail("permission-denied", "الإجابة لقائد الفريق");
  const choice = Number(data.choice);
  const transaction = await db.ref(`matches/${id}/state`).transaction((state) => {
    if (!state || state.phase !== "question" || state.answer || !Number.isInteger(choice) || choice < 0 || choice >= (state.question?.options?.length || 0)) return;
    state.phase = "locked";
    state.answer = { playerId: player.id, playerName: player.name, choice, at: now() };
    return state;
  });
  return { status: transaction.committed ? "accepted" : "late" };
}

async function reveal(id, match, correctOverride) {
  const state = match.state;
  const secret = (await db.ref(`matchSecrets/${id}`).get()).val();
  if (!state.question || !secret || secret.questionId !== state.question.id) fail("failed-precondition", "تعذّر التحقق من السؤال");
  const correct = typeof correctOverride === "boolean" ? correctOverride : state.answer?.choice === secret.answer;
  const teamCode = state.targetTeam;
  const team = match.teams[teamCode];
  const updates = {
    [`matches/${id}/state/phase`]: "revealed",
    [`matches/${id}/state/isCorrect`]: correct,
    [`matches/${id}/state/question/answer`]: correct ? secret.answer : -1,
    [`matches/${id}/teams/${teamCode}/correctCount`]: team.correctCount + (correct ? 1 : 0),
    [`matches/${id}/teams/${teamCode}/wrongCount`]: team.wrongCount + (correct ? 0 : 1),
  };
  if (correct) updates[`matches/${id}/teams/${teamCode}/score`] = team.score + points(state);
  await db.ref().update(updates);
  return { correct };
}

async function advance(id, match) {
  const state = match.state;
  if (state.round < match.totalRounds) {
    let nextTeam;
    const updates = { turnIndex: match.turnIndex + 1, "state/phase": "choose", "state/question": null, "state/answer": null, "state/isCorrect": null, "state/viewUntil": null, "state/assistUsed": false, "state/questionValue": null };
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
    await db.ref(`matches/${id}`).update({ totalRounds: state.round + tied.length, turnIndex: match.turnIndex + 1, tieBreaker: { active: true, teams: tied, cursor: 0, cycle }, "state/phase": "choose", "state/question": null, "state/answer": null, "state/isCorrect": null, "state/targetTeam": tied[0], "state/viewUntil": null, "state/assistUsed": false, "state/questionValue": null });
    return { ended: false, tieBreaker: true };
  }
  await db.ref(`matches/${id}`).update({ status: "ended", "state/phase": "ended", turnIndex: match.turnIndex + 1 });
  return { ended: true };
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

  const { id, match } = await loadMatch(data.matchCode);
  if (action === "leaveMatch") {
    const playerId = text(data.playerId, 80);
    if (!playerForUid(match, uid, playerId) && match.hostUid !== uid) fail("permission-denied", "لا يمكنك حذف لاعب آخر");
    await db.ref(`matches/${id}/players/${playerId}`).remove();
    return { ok: true };
  }
  if (action === "useAssist") {
    const teamCode = code(data.teamCode);
    if (!canPlayFor(match, uid, teamCode) || match.state.targetTeam !== teamCode) fail("permission-denied", "المساعدة للفريق صاحب السؤال");
    const result = await db.ref(`matches/${id}/state`).transaction((state) => {
      if (!state || state.phase !== "question" || state.question?.type !== "flag" || state.assistUsed || state.targetTeam !== teamCode) return;
      state.assistUsed = true;
      return state;
    });
    return { accepted: result.committed };
  }
  if (action === "usePowerCard") {
    const teamCode = code(data.teamCode);
    const card = text(data.card, 30);
    if (!canPlayFor(match, uid, teamCode) || match.state.targetTeam !== teamCode) fail("permission-denied", "البطاقة للفريق صاحب السؤال");
    if (!match.teams[teamCode]?.powerCards?.[card] || !["doublePoints", "extraTime"].includes(card)) return { accepted: false };
    if (match.state.phase !== "question" || match.state.answer) return { accepted: false };
    const updates = { [`teams/${teamCode}/powerCards/${card}`]: false };
    if (card === "doublePoints") {
      updates["state/pointMultiplier"] = 2;
    } else {
      if (!match.timer || match.state.extraTimeUsed) return { accepted: false };
      updates["state/extraTimeUsed"] = true;
    }
    await db.ref(`matches/${id}`).update(updates);
    return { accepted: true };
  }

  requireHost(match, uid);
  if (action === "startMatch") {
    const first = code(data.firstTeamCode);
    if (!match.teams[first] || match.status !== "lobby") fail("failed-precondition", "لا يمكن بدء الميدان");
    await db.ref(`matches/${id}`).update({ status: "playing", "state/phase": "choose", "state/targetTeam": first });
  } else if (action === "revealAnswer") {
    if (!match.state.answer) fail("failed-precondition", "لا توجد إجابة");
    return reveal(id, match);
  } else if (action === "judgeVerbal") {
    return reveal(id, match, Boolean(data.correct));
  } else if (action === "passToNextTeam") {
    const current = match.teamOrder.indexOf(match.state.targetTeam);
    const next = match.teamOrder[(current + 1) % match.teamOrder.length];
    const seconds = match.state.question ? viewSeconds(match.state.question) : null;
    const until = seconds ? now() + seconds * 1000 : null;
    await db.ref(`matches/${id}/state`).set({ ...match.state, phase: "question", targetTeam: next, passCount: match.state.passCount + 1, answer: null, isCorrect: null, questionStartedAt: until || now(), viewUntil: until, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false });
  } else if (action === "advanceTurn") {
    return advance(id, match);
  } else if (action === "setCaptain") {
    const teamCode = code(data.teamCode);
    const playerId = data.playerId === null ? null : text(data.playerId, 80);
    if (!match.teams[teamCode] || (playerId && match.players?.[playerId]?.teamCode !== teamCode)) fail("invalid-argument", "اللاعب ليس في الفريق");
    await db.ref(`matches/${id}/teams/${teamCode}/captainId`).set(playerId);
  } else if (action === "endMatch") {
    await db.ref(`matches/${id}`).update({ status: "ended", "state/phase": "ended" });
  } else if (action === "deleteMatch") {
    await Promise.all([db.ref(`matches/${id}`).remove(), db.ref(`matchSecrets/${id}`).remove()]);
  } else fail("invalid-argument", "عملية غير معروفة");
  return { ok: true };
});
