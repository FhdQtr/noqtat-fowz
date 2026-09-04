const { readFileSync } = require("node:fs");
const { createHash, randomInt, timingSafeEqual } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase, ServerValue } = require("firebase-admin/database");

initializeApp({ databaseURL: "https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app" });
const db = getDatabase();
const QUESTIONS = JSON.parse(readFileSync(require.resolve("./questions.json"), "utf8"));
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const INVITE_CHARS = `${LETTERS}${DIGITS}`;
const COLORS = ["maroon", "emerald", "royal", "gold"];
const POWER_CARD_BASE_COST = { extraTime: 100, swapQuestion: 150, pickPlayer: 200, doublePoints: 200, freeze: 250, steal: 300 };
const LOBBY_TTL_MS = 10 * 60 * 1000;
const ACTIVE_TTL_MS = 8 * 60 * 60 * 1000;
const ENDED_TTL_MS = 60 * 60 * 1000;
const MAX_PLAYERS_PER_TEAM = 20;
const SHOWDOWN_POINTS = 200;
const SHOWDOWN_OPEN_DELAY_MS = 4000;
const SHOWDOWN_DURATION_MS = 20000;
const REQUEST_LIMITS = {
  createMatch: { uid: 5, ip: 20, window: 10 * 60 * 1000 },
  joinTeam: { uid: 8, ip: 60, window: 10 * 60 * 1000 },
  startChallenge: { uid: 5, ip: 20, window: 60 * 60 * 1000 },
  answerChallenge: { uid: 150, ip: 1000, window: 10 * 60 * 1000 },
  getMatch: { uid: 180, ip: 600, window: 60 * 1000 },
  getTeamInvites: { uid: 60, ip: 180, window: 60 * 1000 },
};
const RATE_LIMIT_SCOPES = Object.keys(REQUEST_LIMITS).flatMap((action) => [`${action}_uid`, `${action}_ip`]);

function fail(code, message) { throw new HttpsError(code, message); }
function text(value, max = 30) { return String(value ?? "").trim().slice(0, max); }
function code(value) { return text(value, 12).toUpperCase(); }
function dbKey(value) { return text(value, 50).replace(/[.#$\[\]\/]/g, "_"); }
function now() { return Date.now(); }
function qatarBucket(timestamp = now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour };
}
async function recordMatchUsage(metric, matchId) {
  const timestamp = now();
  const claim = await db.ref(`usageSeen/${metric}/${dbKey(matchId)}`).transaction(
    (value) => value == null ? timestamp : undefined,
    undefined,
    false,
  );
  if (!claim.committed) return;
  const { date, hour } = qatarBucket(timestamp);
  await db.ref().update({
    [`usageStats/totals/${metric}`]: ServerValue.increment(1),
    [`usageStats/daily/${date}/${metric}`]: ServerValue.increment(1),
    [`usageStats/daily/${date}/hours/${hour}/${metric}`]: ServerValue.increment(1),
    [`usageStats/totals/${metric}LastAt`]: timestamp,
  });
}
async function recordPlayerUsage(uid) {
  const timestamp = now();
  const { date, hour } = qatarBucket(timestamp);
  const safeUid = dbKey(uid);
  const [allTimeClaim, dailyClaim] = await Promise.all([
    db.ref(`usageSeen/players/${safeUid}`).transaction((value) => value == null ? timestamp : undefined, undefined, false),
    db.ref(`usageSeen/daily/${date}/players/${safeUid}`).transaction((value) => value == null ? timestamp : undefined, undefined, false),
  ]);
  const updates = { "usageStats/totals/playerLastAt": timestamp };
  if (allTimeClaim.committed) updates["usageStats/totals/uniquePlayers"] = ServerValue.increment(1);
  if (dailyClaim.committed) {
    updates[`usageStats/daily/${date}/activePlayers`] = ServerValue.increment(1);
    updates[`usageStats/daily/${date}/hours/${hour}/activePlayers`] = ServerValue.increment(1);
  }
  await db.ref().update(updates);
}
async function safelyRecordUsage(operation) {
  try {
    await operation();
  } catch (error) {
    console.error("Usage tracking failed", error);
  }
}
function matchCode() { return LETTERS[randomInt(LETTERS.length)] + Array.from({ length: 3 }, () => DIGITS[randomInt(DIGITS.length)]).join(""); }
function inviteKey() { return Array.from({ length: 8 }, () => INVITE_CHARS[randomInt(INVITE_CHARS.length)]).join(""); }
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(text(left, 40));
  const rightBuffer = Buffer.from(text(right, 40));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
function publicPlayer(player) {
  if (!player) return null;
  const safePlayer = { ...player };
  delete safePlayer.authUid;
  return safePlayer;
}
function publicMatch(match) {
  if (!match) return null;
  const safeMatch = { ...match };
  delete safeMatch.hostUid;
  return {
    ...safeMatch,
    players: Object.fromEntries(Object.entries(match.players || {}).map(([id, player]) => [id, publicPlayer(player)])),
  };
}
function attachAccess(publicData, access = {}) {
  if (!publicData) return null;
  return {
    ...publicData,
    hostUid: access.hostUid || publicData.hostUid,
    players: Object.fromEntries(Object.entries(publicData.players || {}).map(([id, player]) => [id, {
      ...player,
      authUid: access.playerUids?.[id] || player.authUid,
    }])),
  };
}
function requestIp(request) {
  const raw = request.rawRequest;
  const forwarded = raw?.headers?.["x-forwarded-for"];
  const value = raw?.ip || (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0]);
  return text(value, 100);
}
function rateKey(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
async function consumeRateLimit(scope, identity, limit, windowMs) {
  if (!identity) return;
  const timestamp = now();
  const rateRef = db.ref(`securityRateLimits/${dbKey(scope)}/${rateKey(identity)}`);
  const result = await rateRef.transaction((current) => {
    if (!current || Number(current.expiresAt) <= timestamp) return { count: 1, expiresAt: timestamp + windowMs };
    if ((Number(current.count) || 0) >= limit) return;
    return { count: (Number(current.count) || 0) + 1, expiresAt: current.expiresAt };
  }, undefined, false);
  if (!result.committed) fail("resource-exhausted", "طلبات كثيرة خلال وقت قصير، انتظر قليلاً ثم حاول");
}
async function enforceRequestLimit(action, request, uid) {
  const limits = REQUEST_LIMITS[action];
  if (!limits) return;
  const ip = requestIp(request);
  await Promise.all([
    consumeRateLimit(`${action}_uid`, uid, limits.uid, limits.window),
    ip ? consumeRateLimit(`${action}_ip`, ip, limits.ip, limits.window) : Promise.resolve(),
  ]);
}
function randomOrder(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapWith = randomInt(index + 1);
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}
function levelForPick(n, difficulty = "mixed", difficultyLevels = null) {
  const selected = Array.isArray(difficultyLevels)
    ? [...new Set(difficultyLevels.filter((level) => ["easy", "medium", "hard"].includes(level)))]
    : [];
  if (selected.length) return selected[(Math.max(1, n) - 1) % selected.length];
  if (["easy", "medium", "hard"].includes(difficulty)) return difficulty;
  return n <= 1 ? "easy" : n === 2 ? "medium" : "hard";
}
function teamQuestionCount(match, teamCode) {
  return Object.values(match.typeCounts?.[teamCode] || {}).reduce((total, count) => total + (Number(count) || 0), 0);
}
function oldestWindow(pool, history) {
  if (!pool.length) return [];
  const unseen = pool.filter((question) => !history[question.id]);
  if (unseen.length) return unseen;
  const count = Math.max(1, Math.min(8, Math.ceil(pool.length * 0.05)));
  return [...pool]
    .sort((left, right) => (Number(history[left.id]) || 0) - (Number(history[right.id]) || 0))
    .slice(0, count);
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
function fairTypeCaps(enabledTypes, levels, teamCount, questionsPerTeam) {
  const base = enabledTypes.length <= 1 ? questionsPerTeam : Math.max(3, Math.ceil(questionsPerTeam / 2));
  return Object.fromEntries(enabledTypes.map((type) => {
    const typeQuestions = QUESTIONS.filter((question) => question.type === type && !question.disabled);
    if (!typeQuestions.length) return [type, base];
    const perLevel = levels.map((level) => new Set(
      typeQuestions.filter((question) => question.level === level).map(questionAssetKey),
    ).size);
    const fair = Math.floor(Math.min(...perLevel) / Math.max(1, teamCount));
    return [type, Math.max(0, Math.min(base, fair))];
  }));
}
function publicQuestion(question) { return { ...question, answer: -1 }; }
function protectedQuestion(question) {
  const visible = publicQuestion(question);
  if (question.type === "memory") return { ...visible, question: "", options: [], promptHidden: true };
  if (question.type === "flag") return { ...visible, options: [], optionsHidden: true };
  return visible;
}
function reprotectQuestionForAttempt(question) {
  if (!question) return question;
  if (question.type === "memory") return { ...question, question: "", options: [], promptHidden: true };
  if (question.type === "flag") return { ...question, options: [], optionsHidden: true };
  return question;
}
function questionSecret(question) {
  return { questionId: question.id, answer: question.answer, question: question.question, options: question.options };
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
  const [snapshot, accessSnapshot] = await Promise.all([
    db.ref(`matches/${id}`).get(),
    db.ref(`matchAccess/${id}`).get(),
  ]);
  if (!snapshot.exists()) fail("not-found", "الميدان غير موجود");
  const access = accessSnapshot.val() || {};
  return { id, access, match: attachAccess(snapshot.val(), access) };
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
  const requestedLevels = Array.isArray(options.difficultyLevels)
    ? [...new Set(options.difficultyLevels.map((level) => text(level, 10)).filter((level) => ["easy", "medium", "hard"].includes(level)))]
    : [];
  const difficultyLevels = randomOrder(requestedLevels.length
    ? requestedLevels.slice(0, 3)
    : difficulty === "mixed" ? ["easy", "medium", "hard"] : [difficulty]);
  const typeCaps = fairTypeCaps(enabledTypes, difficultyLevels, names.length, questionsPerTeam);
  if (Object.values(typeCaps).reduce((total, cap) => total + cap, 0) < questionsPerTeam) {
    fail("failed-precondition", "عدد الأقسام المختارة لا يكفي لإكمال المسابقة من دون تكرار؛ اختر أقساماً إضافية");
  }
  const answerMode = ["anyone", "representative", "host"].includes(options.answerMode) ? options.answerMode : "representative";
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = matchCode();
    if ((await db.ref(`matches/${id}`).get()).exists()) continue;
    const teams = {};
    const teamKeys = {};
    const teamOrder = [];
    names.forEach((name, index) => {
      const teamCode = `${id}-${index + 1}`;
      teamOrder.push(teamCode);
      teamKeys[teamCode] = inviteKey();
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
      hostName: text(options.hostName, 20) || "المقدم",
      createdAt, expiresAt: createdAt + LOBBY_TTL_MS, status: "lobby", teamOrder, turnIndex: 0, questionsPerTeam, totalRounds, timer, difficulty, difficultyLevels, answerMode, enabledTypes, typeCaps, teams,
      state: { phase: "lobby", round: 0, targetTeam: null, originalTeam: null, passCount: 0, question: null, answer: null, isCorrect: null, timer, questionStartedAt: null, questionDuration: null, selectionRequestId: null, usedIds: [], usedAssets: [], questionValue: 0, viewUntil: null, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false, stealFullValue: false, forcedPlayerId: null, forcedPlayerName: null, cardsFrozenTeam: null, cardUsedThisTurn: false },
    };
    await db.ref().update({
      [`matches/${id}`]: match,
      [`matchAccess/${id}`]: { hostUid: uid, viewerKey: inviteKey(), teamKeys, playerUids: {} },
    });
    await safelyRecordUsage(() => recordMatchUsage("matchesCreated", id));
    return { code: id };
  }
  fail("resource-exhausted", "تعذّر إنشاء كود جديد، حاول مرة ثانية");
}

async function joinTeam(uid, data) {
  const { id, match, access } = await loadMatch(data.matchCode);
  const teamCode = code(data.teamCode);
  if (!match.teams?.[teamCode]) fail("not-found", "الفريق غير موجود");
  if (match.status !== "lobby") fail("failed-precondition", "أُغلق دخول الفرق بعد بدء المسابقة");
  const expectedKey = access.teamKeys?.[teamCode];
  // الغرف القديمة قبل تحديث الحماية لا تملك مفتاح دعوة، وتنتهي تلقائياً خلال عشر دقائق.
  if (expectedKey && !safeEqual(data.inviteKey, expectedKey)) fail("permission-denied", "رابط أو كود دخول الفريق غير صالح");

  const existing = Object.values(match.players || {}).find((player) => player.authUid === uid);
  if (existing) {
    if (existing.teamCode !== teamCode) fail("failed-precondition", "هذا الجهاز مسجل في فريق آخر");
    return { player: publicPlayer(existing) };
  }

  const claimRef = db.ref(`matchAccess/${id}/joinClaims/${dbKey(uid)}`);
  const claimedAt = now();
  const claim = await claimRef.transaction((current) => {
    if (!current || claimedAt - Number(current) > 60 * 1000) return claimedAt;
    return;
  }, undefined, false);
  if (!claim.committed) fail("aborted", "طلب الدخول قيد التنفيذ");

  try {
    const { match: latestMatch } = await loadMatch(id);
    const duplicate = Object.values(latestMatch.players || {}).find((player) => player.authUid === uid);
    if (duplicate) {
      if (duplicate.teamCode !== teamCode) fail("failed-precondition", "هذا الجهاز مسجل في فريق آخر");
      return { player: publicPlayer(duplicate) };
    }
    const teamPlayers = Object.values(latestMatch.players || {}).filter((player) => player.teamCode === teamCode);
    if (teamPlayers.length >= MAX_PLAYERS_PER_TEAM) fail("resource-exhausted", "اكتمل عدد لاعبي هذا الفريق");

    const player = { id: `p_${now()}_${randomInt(100000, 999999)}`, name: text(data.name, 20) || "لاعب", teamCode, joinedAt: now() };
    await db.ref().update({
      [`matches/${id}/players/${player.id}`]: player,
      [`matchAccess/${id}/playerUids/${player.id}`]: uid,
    });
    await safelyRecordUsage(() => recordPlayerUsage(uid));
    return { player };
  } finally {
    await claimRef.remove();
  }
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
  if (usedCount >= typeCap(match, type)) return { status: "cap" };
  let candidates;
  if (type.startsWith("ct_")) {
    const custom = (await db.ref("customQuestions").get()).val() || {};
    candidates = Object.values(custom);
  } else candidates = QUESTIONS;
  const usedIds = new Set(match.state.usedIds || []);
  const usedAssets = new Set(match.state.usedAssets || []);
  const teamUsedIds = new Set(match.usedIdsByTeam?.[teamCode] || []);
  // المستوى يتدرج حسب إجمالي أسئلة الفريق، لا حسب مرات اختيار القسم.
  // بذلك لا يبدأ كل قسم من المستوى نفسه في كل مسابقة.
  const level = levelForPick(teamQuestionCount(match, teamCode) + 1, match.difficulty || "mixed", match.difficultyLevels);
  const teamPool = candidates.filter((q) => q.type === type && q.level === level && !q.disabled && !teamUsedIds.has(q.id));
  if (!teamPool.length) return { status: "empty" };
  // ممنوع تكرار السؤال أو الصورة نفسها بين الفرق داخل المسابقة.
  const pool = teamPool.filter((q) => !usedIds.has(q.id) && !usedAssets.has(questionAssetKey(q)));
  if (!pool.length) return { status: "empty" };

  // سجل دائم للمقدم: لا نكرر السؤال بين المسابقات حتى ينتهي مخزون النوع/المستوى.
  const historyOwner = match.hostUid || uid;
  const historyRef = db.ref(`hostQuestionHistory/${historyOwner}/${typeKey}/${level}`);
  const globalHistoryRef = db.ref(`globalQuestionHistory/${typeKey}/${level}`);
  const [historySnapshot, globalHistorySnapshot] = await Promise.all([historyRef.get(), globalHistoryRef.get()]);
  const history = historySnapshot.val() || {};
  const globalHistory = globalHistorySnapshot.val() || {};
  // لا نمسح السجل بعد اكتمال البنك. نختار أقدم الأسئلة استخداماً، وهذا يمنع
  // العودة المفاجئة لأسئلة البداية. السجل العام يحمي أيضاً عند تغير دخول الضيف.
  let available = oldestWindow(pool, history);
  available = oldestWindow(available, globalHistory);

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
      question: protectedQuestion(question),
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
      usedIds: [...new Set([...(latestState.usedIds || []), question.id])],
      usedAssets: [...new Set([...(latestState.usedAssets || []), questionAssetKey(question)])],
    };

    // السؤال وإجابته السرية والعدادات تُثبّت معاً، فلا تصل الواجهة إلى سؤال بلا سر.
    await db.ref().update({
      [`matches/${id}/state`]: nextState,
      [`matchSecrets/${id}`]: questionSecret(question),
      [`matches/${id}/typeCounts/${teamCode}/${typeKey}`]: usedCount + 1,
      [`matches/${id}/usedIdsByTeam/${teamCode}`]: [...teamUsedIds, question.id],
      [`hostQuestionHistory/${historyOwner}/${typeKey}/${level}/${question.id}`]: started,
      [`globalQuestionHistory/${typeKey}/${level}/${question.id}`]: started,
    });
    return { status: "accepted" };
  } catch (error) {
    await releaseClaim(claimRef, requestId);
    throw error;
  }
}

async function startShowdown(id, match) {
  const showdownNumber = (match.showdownCount || 0) + 1;
  const wantsImage = showdownNumber % 2 === 0;
  const allowedTextTypes = new Set(["multiple_choice", "riddle", "completion"]);
  const usedIds = new Set(match.state.usedIds || []);
  const usedAssets = new Set(match.state.usedAssets || []);
  const eligible = QUESTIONS.filter((question) =>
    !question.disabled
    && question.level === "hard"
    && Array.isArray(question.options)
    && question.options.length === 4
    && (wantsImage ? Boolean(question.image) : allowedTextTypes.has(question.type))
  );
  const basePool = eligible.filter((question) => !usedIds.has(question.id) && !usedAssets.has(questionAssetKey(question)));
  if (!basePool.length) fail("resource-exhausted", "لا توجد أسئلة مواجهة صعبة متاحة");

  const kind = wantsImage ? "visual" : "text";
  const historyOwner = match.hostUid || "shared";
  const hostHistoryRef = db.ref(`hostQuestionHistory/${historyOwner}/showdown_${kind}/hard`);
  const globalHistoryRef = db.ref(`globalQuestionHistory/showdown_${kind}/hard`);
  const [hostSnapshot, globalSnapshot] = await Promise.all([hostHistoryRef.get(), globalHistoryRef.get()]);
  let available = oldestWindow(basePool, hostSnapshot.val() || {});
  available = oldestWindow(available, globalSnapshot.val() || {});
  const question = shuffled(available[randomInt(available.length)]);
  const createdAt = now();
  const opensAt = createdAt + SHOWDOWN_OPEN_DELAY_MS;
  const closesAt = opensAt + SHOWDOWN_DURATION_MS;

  await db.ref().update({
    [`matches/${id}/showdownCount`]: showdownNumber,
    [`matches/${id}/state/phase`]: "showdown",
    [`matches/${id}/state/question`]: publicQuestion(question),
    [`matches/${id}/state/answer`]: null,
    [`matches/${id}/state/isCorrect`]: null,
    [`matches/${id}/state/targetTeam`]: null,
    [`matches/${id}/state/originalTeam`]: null,
    [`matches/${id}/state/viewUntil`]: null,
    [`matches/${id}/state/questionStartedAt`]: opensAt,
    [`matches/${id}/state/questionDuration`]: SHOWDOWN_DURATION_MS / 1000,
    [`matches/${id}/state/showdown`]: { number: showdownNumber, points: SHOWDOWN_POINTS, opensAt, closesAt, answers: {}, winnerTeam: null },
    [`matches/${id}/state/usedIds`]: [...usedIds, question.id],
    [`matches/${id}/state/usedAssets`]: [...usedAssets, questionAssetKey(question)],
    [`matchSecrets/${id}`]: questionSecret(question),
    [`hostQuestionHistory/${historyOwner}/showdown_${kind}/hard/${question.id}`]: createdAt,
    [`globalQuestionHistory/showdown_${kind}/hard/${question.id}`]: createdAt,
  });
  return { showdown: true };
}

async function submitShowdownAnswer(uid, data) {
  const id = code(data.matchCode);
  const [{ match, access }, secretSnapshot] = await Promise.all([
    loadMatch(id),
    db.ref(`matchSecrets/${id}`).get(),
  ]);
  const player = playerForUid(match, uid, text(data.playerId, 80));
  const choice = Number(data.choice);
  const receivedAt = now();
  const showdown = match.state.showdown;
  if (!player || match.state.phase !== "showdown" || !showdown) return { status: "late" };
  if (!Number.isInteger(choice) || choice < 0 || choice >= (match.state.question?.options?.length || 0)) return { status: "late" };
  if (receivedAt < showdown.opensAt) return { status: "early" };
  if (receivedAt > showdown.closesAt) return { status: "late" };
  const secret = secretSnapshot.val();
  if (!secret || secret.questionId !== match.state.question?.id) return { status: "late" };

  const submissionId = `${uid}_${receivedAt}_${randomInt(100000, 999999)}`;
  const matchRef = db.ref(`matches/${id}`);
  const result = await matchRef.transaction((current) => {
    const currentShowdown = current?.state?.showdown;
    if (!current || current.state?.phase !== "showdown" || !currentShowdown) return;
    if (receivedAt < currentShowdown.opensAt || receivedAt > currentShowdown.closesAt) return;
    const currentPlayer = current.players?.[player.id];
    const currentPlayerUid = access.playerUids?.[player.id] || currentPlayer?.authUid;
    if (!currentPlayer || currentPlayerUid !== uid || currentShowdown.answers?.[currentPlayer.teamCode]) return;

    currentShowdown.answers = currentShowdown.answers || {};
    currentShowdown.answers[currentPlayer.teamCode] = {
      submissionId,
      playerId: player.id,
      playerName: player.name,
      choice,
      at: receivedAt,
    };
    if (Object.keys(currentShowdown.answers).length >= current.teamOrder.length) {
      const fastestCorrect = Object.entries(currentShowdown.answers)
        .filter(([, answer]) => answer.choice === secret.answer)
        .sort(([, left], [, right]) => left.at - right.at)[0];
      const winnerTeam = fastestCorrect?.[0] || null;
      currentShowdown.winnerTeam = winnerTeam;
      currentShowdown.pointsAwarded = Boolean(winnerTeam);
      current.state.phase = "showdown_revealed";
      current.state.question.answer = secret.answer;
      if (winnerTeam) {
        current.teams[winnerTeam].score = (current.teams[winnerTeam].score || 0) + currentShowdown.points;
      }
    }
    return current;
  }, undefined, false);
  const savedAnswer = result.snapshot.val()?.state?.showdown?.answers?.[player.teamCode];
  return savedAnswer?.submissionId === submissionId
    ? { status: "accepted", correct: choice === secret.answer }
    : { status: "late" };
}

async function finishShowdown(uid, data) {
  const id = code(data.matchCode);
  const [{ match }, secretSnapshot] = await Promise.all([
    loadMatch(id),
    db.ref(`matchSecrets/${id}`).get(),
  ]);
  const isParticipant = match.hostUid === uid
    || Object.values(match.players || {}).some((player) => player.authUid === uid);
  if (!isParticipant) fail("permission-denied", "هذه العملية للمشاركين في الميدان فقط");
  if (match.state.phase !== "showdown" || !match.state.showdown || now() < match.state.showdown.closesAt) return { finished: false };
  const secret = secretSnapshot.val();
  if (!secret || secret.questionId !== match.state.question?.id) return { finished: false };
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (!current || current.state?.phase !== "showdown" || now() < current.state.showdown?.closesAt) return;
    const fastestCorrect = Object.entries(current.state.showdown.answers || {})
      .filter(([, answer]) => answer.choice === secret.answer)
      .sort(([, left], [, right]) => left.at - right.at)[0];
    const winnerTeam = fastestCorrect?.[0] || null;
    current.state.showdown.winnerTeam = winnerTeam;
    current.state.showdown.pointsAwarded = Boolean(winnerTeam);
    current.state.phase = "showdown_revealed";
    current.state.question.answer = secret.answer;
    if (winnerTeam) {
      current.teams[winnerTeam].score = (current.teams[winnerTeam].score || 0) + current.state.showdown.points;
    }
    return current;
  }, undefined, false);
  return { finished: result.snapshot.val()?.state?.phase === "showdown_revealed" };
}

async function submitAnswer(uid, data) {
  const { id, match } = await loadMatch(data.matchCode);
  const player = playerForUid(match, uid, text(data.playerId, 80));
  if (!player || player.teamCode !== match.state.targetTeam) fail("permission-denied", "الإجابة للفريق صاحب السؤال");
  const answerMode = match.answerMode || "anyone";
  if (match.state.forcedPlayerId) {
    if (match.state.forcedPlayerId !== player.id) fail("permission-denied", "الإجابة للاعب الذي اختاره الفريق المنافس");
  } else {
    if (answerMode === "host") fail("permission-denied", "المقدم هو من يثبت الإجابة");
    const representativeId = match.teams[player.teamCode]?.captainId;
    if (answerMode === "representative" && representativeId !== player.id) fail("permission-denied", "الإجابة لممثل الفريق");
  }
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
  if ((correct || !canPass) && Array.isArray(secret.options)) {
    updates[`matches/${id}/state/question/question`] = text(secret.question, 500);
    updates[`matches/${id}/state/question/options`] = secret.options.map((option) => text(option, 300));
    updates[`matches/${id}/state/question/promptHidden`] = null;
    updates[`matches/${id}/state/question/optionsHidden`] = null;
  }
  if (correct) {
    updates[`matches/${id}/teams/${teamCode}/score`] = team.score + points(state);
    updates[`matches/${id}/teams/${teamCode}/cardBalance`] = (team.cardBalance || 0) + cardReward(state);
  }
  await db.ref().update(updates);
  return { correct };
}

async function advance(id, match) {
  const state = match.state;
  if (state.phase !== "showdown_revealed" && showdownDue(match)) return startShowdown(id, match);
  if (state.round < match.totalRounds) {
    let nextTeam;
    const updates = { turnIndex: match.turnIndex + 1, "state/phase": "choose", "state/question": null, "state/answer": null, "state/isCorrect": null, "state/showdown": null, "state/viewUntil": null, "state/questionStartedAt": null, "state/questionDuration": null, "state/selectionRequestId": null, "state/attemptedTeams": null, "state/answerClaimId": null, "state/cardClaimId": null, "state/assistUsed": false, "state/questionValue": null, "state/pointMultiplier": 1, "state/extraTimeUsed": false, "state/stealFullValue": false, "state/forcedPlayerId": null, "state/forcedPlayerName": null, "state/cardsFrozenTeam": null, "state/cardUsedThisTurn": false };
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
  const endedAt = now();
  await db.ref(`matches/${id}`).update({ status: "ended", endedAt, expiresAt: endedAt + ENDED_TTL_MS, "state/phase": "ended", turnIndex: match.turnIndex + 1 });
  return { ended: true };
}

async function playPowerCard(uid, data, id, initialMatch, access) {
  const teamCode = code(data.teamCode);
  const card = text(data.card, 30);
  if (!POWER_CARD_BASE_COST[card]) return { accepted: false, reason: "unknown" };
  if (!canPlayFor(initialMatch, uid, teamCode)) fail("permission-denied", "هذا الكرت ليس لفريقك");

  const claimId = `${uid}_${now()}_${randomInt(100000, 999999)}`;
  const matchRef = db.ref(`matches/${id}`);
  const claimRef = matchRef.child("state/cardClaimId");
  if (!await acquireClaim(claimRef, claimId)) return { accepted: false, reason: "busy" };

  try {
    const match = attachAccess((await matchRef.get()).val(), access);
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
      if (state.phase !== "question" || !targetTeam || targetTeam === teamCode || state.answer || match.answerMode === "host") return { accepted: false, reason: "timing" };
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
      const usedAssets = new Set(state.usedAssets || []);
      const teamUsedIds = new Set(match.usedIdsByTeam?.[teamCode] || []);
      const teamPool = candidates.filter((question) => question.type === state.question.type && question.level === state.question.level && !question.disabled && !teamUsedIds.has(question.id));
      if (!teamPool.length) return { accepted: false, reason: "empty" };
      const pool = teamPool.filter((question) => !usedIds.has(question.id) && !usedAssets.has(questionAssetKey(question)));
      if (!pool.length) return { accepted: false, reason: "empty" };
      const question = shuffled(pool[randomInt(pool.length)]);
      const started = now();
      const seconds = viewSeconds(question);
      const viewUntil = seconds ? started + seconds * 1000 : null;
      const isActing = question.type === "acting";
      updates["state/question"] = protectedQuestion(question);
      updates["state/usedIds"] = [...usedIds, question.id];
      updates["state/usedAssets"] = [...usedAssets, questionAssetKey(question)];
      updates["state/viewUntil"] = viewUntil;
      updates["state/questionStartedAt"] = isActing ? null : (viewUntil || started);
      updates["state/questionDuration"] = isActing ? 120 : match.timer;
      updates["state/assistUsed"] = false;
      updates["state/forcedPlayerId"] = null;
      updates["state/forcedPlayerName"] = null;
      await db.ref().update({
        [`matches/${id}/teams/${teamCode}/cardBalance`]: balance - cost,
        [`matches/${id}/teams/${teamCode}/powerCards/${card}`]: false,
        [`matches/${id}/state/question`]: protectedQuestion(question),
        [`matches/${id}/state/usedIds`]: [...usedIds, question.id],
        [`matches/${id}/state/usedAssets`]: [...usedAssets, questionAssetKey(question)],
        [`matches/${id}/usedIdsByTeam/${teamCode}`]: [...teamUsedIds, question.id],
        [`matches/${id}/state/viewUntil`]: viewUntil,
        [`matches/${id}/state/questionStartedAt`]: isActing ? null : (viewUntil || started),
        [`matches/${id}/state/questionDuration`]: isActing ? 120 : match.timer,
        [`matches/${id}/state/assistUsed`]: false,
        [`matches/${id}/state/forcedPlayerId`]: null,
        [`matches/${id}/state/forcedPlayerName`]: null,
        [`matches/${id}/state/cardUsedThisTurn`]: true,
        [`matches/${id}/state/cardClaimId`]: null,
        [`matches/${id}/state/cardEvent`]: event,
        [`matchSecrets/${id}`]: questionSecret(question),
        [`hostQuestionHistory/${match.hostUid || uid}/${dbKey(question.type)}/${question.level}/${question.id}`]: started,
        [`globalQuestionHistory/${dbKey(question.type)}/${question.level}/${question.id}`]: started,
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
      updates["state/question"] = reprotectQuestionForAttempt(state.question);
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
  await enforceRequestLimit(action, request, uid);
  if (action === "getUsageStats") {
    if (request.auth?.token?.admin !== true) fail("permission-denied", "هذه الإحصاءات للمدير فقط");
    const [totalsSnapshot, dailySnapshot] = await Promise.all([
      db.ref("usageStats/totals").get(),
      db.ref("usageStats/daily").orderByKey().limitToLast(30).get(),
    ]);
    const daily = [];
    dailySnapshot.forEach((child) => daily.push({ date: child.key, ...child.val() }));
    return { totals: totalsSnapshot.val() || {}, daily: daily.reverse() };
  }
  if (action === "startChallenge") return startChallenge(uid);
  if (action === "answerChallenge") return answerChallenge(uid, data);
  if (action === "createMatch") return createMatch(uid, data.options || {});
  if (action === "joinTeam") return joinTeam(uid, data);
  if (action === "chooseType") return chooseType(uid, data);
  if (action === "submitAnswer") return submitAnswer(uid, data);
  if (action === "submitHostAnswer") return submitHostAnswer(uid, data);
  if (action === "submitShowdownAnswer") return submitShowdownAnswer(uid, data);
  if (action === "finishShowdown") return finishShowdown(uid, data);
  if (action === "getMatch") {
    const snapshot = await db.ref(`matches/${code(data.matchCode)}`).get();
    if (!snapshot.exists()) fail("not-found", "الميدان غير موجود");
    return { match: publicMatch(snapshot.val()) };
  }

  const { id, match, access } = await loadMatch(data.matchCode);
  if (action === "getTeamInvites") {
    const isHost = match.hostUid === uid;
    const isViewer = access.viewerKey && safeEqual(data.viewerKey, access.viewerKey);
    if (!isHost && !isViewer) fail("permission-denied", "روابط الفرق للمقدم وشاشة العرض المصرح بها فقط");
    return {
      teamKeys: access.teamKeys || {},
      ...(isHost ? { viewerKey: access.viewerKey || null } : {}),
    };
  }
  if (action === "getHostAnswer") {
    requireHost(match, uid);
    const secret = (await db.ref(`matchSecrets/${id}`).get()).val();
    const valid = secret?.questionId === match.state.question?.id;
    return {
      answer: valid ? secret.answer : null,
      answerText: valid && Array.isArray(secret.options) ? secret.options[secret.answer] ?? null : null,
    };
  }
  if (action === "revealQuestionPrompt") {
    const state = match.state;
    if (state.phase !== "question" || !state.question?.promptHidden || !state.viewUntil || now() < state.viewUntil) {
      return { accepted: false };
    }
    const secret = (await db.ref(`matchSecrets/${id}`).get()).val();
    if (!secret || secret.questionId !== state.question.id || !Array.isArray(secret.options)) return { accepted: false };
    await db.ref(`matches/${id}/state/question`).update({
      question: text(secret.question, 500),
      options: secret.options.map((option) => text(option, 300)),
      promptHidden: null,
    });
    return { accepted: true };
  }
  if (action === "leaveMatch") {
    const playerId = text(data.playerId, 80);
    if (!playerForUid(match, uid, playerId) && match.hostUid !== uid) fail("permission-denied", "لا يمكنك حذف لاعب آخر");
    await db.ref().update({
      [`matches/${id}/players/${playerId}`]: null,
      [`matchAccess/${id}/playerUids/${playerId}`]: null,
    });
    return { ok: true };
  }
  if (action === "useAssist") {
    const teamCode = code(data.teamCode);
    if (!canPlayFor(match, uid, teamCode) || match.state.targetTeam !== teamCode) fail("permission-denied", "المساعدة للفريق صاحب السؤال");
    const latestState = (await db.ref(`matches/${id}/state`).get()).val();
    if (!latestState || latestState.phase !== "question" || latestState.question?.type !== "flag" || latestState.assistUsed || latestState.targetTeam !== teamCode) return { accepted: false };
    const secret = (await db.ref(`matchSecrets/${id}`).get()).val();
    if (!secret || secret.questionId !== latestState.question.id || !Array.isArray(secret.options)) return { accepted: false };
    await db.ref(`matches/${id}/state`).update({
      assistUsed: true,
      "question/options": secret.options.map((option) => text(option, 300)),
      "question/optionsHidden": null,
    });
    return { accepted: true };
  }
  if (action === "usePowerCard") {
    return playPowerCard(uid, data, id, match, access);
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
    const startedAt = now();
    await db.ref(`matches/${id}`).update({ status: "playing", startedAt, expiresAt: startedAt + ACTIVE_TTL_MS, "state/phase": "choose", "state/targetTeam": first });
    await safelyRecordUsage(() => recordMatchUsage("matchesStarted", id));
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
    await db.ref(`matches/${id}/state`).set({ ...match.state, phase: "question", targetTeam: next, passCount: match.state.passCount + 1, attemptedTeams, question: reprotectQuestionForAttempt(match.state.question), answer: null, isCorrect: null, questionStartedAt: isActing ? null : (until || now()), questionDuration: isActing ? 120 : match.timer, viewUntil: until, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false, stealFullValue: false, forcedPlayerId: null, forcedPlayerName: null, cardClaimId: null });
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
    const endedAt = now();
    await db.ref(`matches/${id}`).update({ status: "ended", endedAt, expiresAt: endedAt + ENDED_TTL_MS, "state/phase": "ended" });
  } else if (action === "deleteMatch") {
    await Promise.all([
      db.ref(`matches/${id}`).remove(),
      db.ref(`matchSecrets/${id}`).remove(),
      db.ref(`matchAccess/${id}`).remove(),
    ]);
  } else fail("invalid-argument", "عملية غير معروفة");
  return { ok: true };
});

function matchExpiry(match, fallbackNow) {
  if (Number.isFinite(Number(match?.expiresAt))) return Number(match.expiresAt);
  if (match?.status === "playing") return Number(match.startedAt || match.createdAt || fallbackNow) + ACTIVE_TTL_MS;
  if (match?.status === "ended") return Number(match.endedAt || match.startedAt || match.createdAt || fallbackNow) + ENDED_TTL_MS;
  return Number(match?.createdAt || fallbackNow) + LOBBY_TTL_MS;
}

exports.expireUnusedMatches = onSchedule({
  region: "asia-southeast1",
  schedule: "every 1 minutes",
  timeZone: "Asia/Qatar",
}, async () => {
  const cutoff = now();
  const snapshot = await db.ref("matches").orderByChild("expiresAt").endAt(cutoff).get();

  const expiredCodes = [];
  const removals = [];
  snapshot.forEach((child) => {
    const match = child.val();
    const expiresAt = matchExpiry(match, cutoff);
    if (expiresAt > cutoff) return;
    expiredCodes.push(child.key);
    removals.push(child.ref.transaction((current) => {
      const currentExpiry = matchExpiry(current, cutoff);
      if (current && currentExpiry <= cutoff) return null;
      return;
    }, undefined, false));
  });

  const results = await Promise.all(removals);
  const secretRemovals = [];
  results.forEach((result, index) => {
    if (result.committed && !result.snapshot.exists()) {
      secretRemovals.push(
        db.ref(`matchSecrets/${expiredCodes[index]}`).remove(),
        db.ref(`matchAccess/${expiredCodes[index]}`).remove(),
      );
    }
  });
  await Promise.all(secretRemovals);

  const rateSnapshots = await Promise.all(RATE_LIMIT_SCOPES.map((scope) => (
    db.ref(`securityRateLimits/${scope}`).orderByChild("expiresAt").endAt(cutoff).get()
  )));
  const expiredRateNodes = rateSnapshots.flatMap((rateSnapshot) => {
    const nodes = [];
    rateSnapshot.forEach((entrySnapshot) => nodes.push(entrySnapshot.ref.remove()));
    return nodes;
  });
  await Promise.all(expiredRateNodes);
});
