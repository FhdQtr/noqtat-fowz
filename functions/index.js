const { readFileSync } = require("node:fs");
const { createHash, randomInt, randomUUID, timingSafeEqual } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase, ServerValue } = require("firebase-admin/database");

const FUNCTIONS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
if (FUNCTIONS_EMULATOR && (process.env.GCLOUD_PROJECT !== "demo-al-midan"
  || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== "127.0.0.1:9000")) {
  throw new Error("Functions emulator requires the isolated demo project and loopback database");
}
initializeApp(FUNCTIONS_EMULATOR
  ? { projectId: "demo-al-midan", databaseURL: "https://demo-al-midan-default-rtdb.firebaseio.com" }
  : { databaseURL: "https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app" });
const db = getDatabase();
const QUESTIONS = JSON.parse(readFileSync(require.resolve("./questions.json"), "utf8"));
const PICTURE_GUESS_ITEMS = JSON.parse(readFileSync(require.resolve("./pictureGuessItems.json"), "utf8"));
const FLAG_BANK_REFRESH_AT = Date.UTC(2026, 9, 2, 23, 18, 47);
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const INVITE_CHARS = `${LETTERS}${DIGITS}`;
const COLORS = ["maroon", "emerald", "royal", "gold"];
const POWER_CARD_BASE_COST = { extraTime: 50, swapQuestion: 100, pickPlayer: 150, doublePoints: 150, freeze: 150, steal: 200 };
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
  // Limit bursts, not normal retries after losing a short solo run.
  startChallenge: { uid: 10, ip: 120, window: 60 * 1000 },
  answerChallenge: { uid: 120, ip: 1200, window: 60 * 1000 },
  getMatch: { uid: 180, ip: 600, window: 60 * 1000 },
  getTeamInvites: { uid: 60, ip: 180, window: 60 * 1000 },
  resolveTeamCode: { uid: 12, ip: 120, window: 60 * 1000 },
  syncAdminAccess: { uid: 6, ip: 30, window: 60 * 1000 },
};
const GAME_REQUEST_LIMIT = { uid: 180, ip: 2400, window: 60 * 1000 };
const RATE_LIMIT_SCOPES = [...Object.keys(REQUEST_LIMITS), "game"].flatMap((action) => [`${action}_uid`, `${action}_ip`]);

function fail(code, message) { throw new HttpsError(code, message); }
function text(value, max = 30) { return String(value ?? "").trim().slice(0, max); }
function code(value) { return text(value, 12).toUpperCase(); }
function requireRoomCode(value) {
  // Validate the original length before normalization: never truncate into a valid path.
  if (typeof value !== "string" || !/^[A-Z][0-9]{3}$/i.test(value.trim())) {
    fail("invalid-argument", "كود الميدان حرف وثلاثة أرقام كما يظهر عند المقدم");
  }
  return value.trim().toUpperCase();
}
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
    if (!current || Number(current.expiresAt) <= timestamp || Number(current.expiresAt) > timestamp + windowMs) return { count: 1, expiresAt: timestamp + windowMs };
    if ((Number(current.count) || 0) >= limit) return;
    return { count: (Number(current.count) || 0) + 1, expiresAt: current.expiresAt };
  }, undefined, false);
  if (!result.committed) fail("resource-exhausted", "طلبات كثيرة خلال وقت قصير، انتظر قليلاً ثم حاول");
}
async function enforceRequestLimit(action, request, uid) {
  // Unlisted actions share a bounded bucket, including invalid action names.
  const configured = Object.hasOwn(REQUEST_LIMITS, action);
  const scope = configured ? action : "game";
  const limits = configured ? REQUEST_LIMITS[action] : GAME_REQUEST_LIMIT;
  const ip = requestIp(request);
  await Promise.all([
    consumeRateLimit(`${scope}_uid`, uid, limits.uid, limits.window),
    ip ? consumeRateLimit(`${scope}_ip`, ip, limits.ip, limits.window) : Promise.resolve(),
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
// Reconcile durable publication receipts before releasing inventory. A room-side
// cancellation fence makes a delayed executor unable to publish after release.
async function settleRotationReservations(owner) {
  const ref = db.ref(`questionRotation/${dbKey(owner)}`);
  const pending = (await ref.get()).val()?.pending || {};
  for (const [key, reservation] of Object.entries(pending)) {
    const room = await db.ref(`matches/${reservation.room}`).transaction((current) => {
      if (!current) return current;
      const marker = current.rotationPublications?.[reservation.publicationKey];
      if (marker === "published" || marker === "cancelled") return current;
      if (reservation.expiresAt > now() && current.status === "playing") return;
      current.rotationPublications ||= {};
      current.rotationPublications[reservation.publicationKey] = "cancelled";
      return current;
    }, undefined, false);
    const marker = room.snapshot.val()?.rotationPublications?.[reservation.publicationKey];
    // Missing rooms cannot be republished: all publishers require playing state.
    if (!room.committed || (!marker && room.snapshot.val())) continue;
    await ref.transaction((current) => {
      if (!current) return current;
      const entry = current.pending?.[key];
      if (!entry || entry.publicationKey !== reservation.publicationKey) return current;
      if (marker === "published") {
        const games = Object.values(current.games || {});
        let game = games.find((item) => item.id === entry.gameId);
        if (!game) { game = { id: entry.gameId, assets: [] }; games.push(game); }
        game.assets = [...new Set([...Object.values(game.assets || {}), ...entry.assets])];
        game.reservations = { ...game.reservations, [entry.receiptKey]: { ...entry.outcome,
          reservation: { key: entry.publicationKey, expiresAt: entry.expiresAt } } };
        current.games = games.slice(-11);
        current.cycles ||= {};
        const cycle = current.cycles[entry.type];
        current.cycles[entry.type] = { number: entry.cycleNumber, used: [...new Set([
          ...Object.values(entry.baseUsed || {}),
          ...(cycle?.number === entry.cycleNumber ? Object.values(cycle.used || {}) : []), ...entry.assets,
        ])] };
      }
      delete current.pending[key];
      return current;
    }, undefined, false);
  }
}
function rotationPublicationAllowed(current, reservation) {
  return !reservation || (reservation.expiresAt > now()
    && current.rotationPublications?.[reservation.key] !== "cancelled");
}
function recordRotationPublication(current, reservation) {
  if (!reservation) return;
  current.rotationPublications ||= {};
  current.rotationPublications[reservation.key] = "published";
}
// Selection holds inventory; only an atomically published room receipt consumes it.
// Legacy helper calls without a publication target retain immediate consumption.
async function rotateQuestion(pool, matchId, owner, allBank = null, requestId = null, inspectOnly = false, publicationRoom = null) {
  if (!pool.length) fail("resource-exhausted", "لا توجد أسئلة متاحة في هذا القسم");
  const ref = db.ref(`questionRotation/${dbKey(owner)}`);
  const universe = (allBank || pool).filter((q) => !q.disabled);
  if (!inspectOnly) await settleRotationReservations(owner);
  // Read-only import. Old binaries must be drained before publishing this policy.
  const legacyFlags = (await db.ref(`flagRotation/v1/${dbKey(owner)}`).get()).val();
  // Editorial families supplement lexical hashes; include every built-in sibling
  // so histories written before concept metadata still block its paraphrases.
  const families = new Map();
  for (const question of [...QUESTIONS, ...universe, ...pool]) {
    if (!question.conceptId) continue;
    const aliases = families.get(question.conceptId) || new Set();
    aliases.add(legacyRotationAssetKey(question));
    aliases.add(rotationAssetKey(question));
    aliases.add(createHash("sha256").update(`concept:${question.conceptId}`).digest("hex"));
    families.set(question.conceptId, aliases);
  }
  const aliasesFor = (question) => families.get(question.conceptId) || new Set([rotationAssetKey(question)]);
  const draw = randomInt(1000000);
  const receiptKey = requestId ? createHash("sha256").update(requestId).digest("hex") : null;
  const pendingKey = publicationRoom ? createHash("sha256").update(JSON.stringify([matchId, requestId])).digest("hex") : null;
  const publicationKey = publicationRoom ? randomUUID() : null;
  let selected;
  let reused = false;
  let outcome;
  let temporarilyHeld;
  const reserve = (current) => {
    outcome = null;
    temporarilyHeld = false;
    if (pendingKey && current?.pending?.[pendingKey]) {
      const entry = current.pending[pendingKey];
      outcome = { ...entry.outcome, reservation: { key: entry.publicationKey, expiresAt: entry.expiresAt } };
      return current;
    }
    // Pending preparations hold inventory but never age consumed-game history.
    const games = (Array.isArray(current?.games) ? current.games : Object.values(current?.games || {})).filter((entry) => Object.values(entry.assets || {}).length);
    const legacyGames = current?.legacyGames || (current?.policyVersion === 2 ? [] : games.map((entry) => ({ ...entry, assets: [...Object.values(entry.assets || {})] })));
    const legacyAssets = current?.legacyAssets || (current?.policyVersion === 2 ? [] : [...new Set(games.flatMap((entry) => Object.values(entry.assets || {})))]);
    const importFlags = legacyFlags && !current?.flagMigration;
    if (importFlags && Object.values(legacyFlags.used || {}).length) games.push({ id: "legacy-flag-cycle", assets: Object.values(legacyFlags.used) });
    let game = games.find((entry) => entry.id === matchId);
    if (!game) { game = { id: matchId, assets: [] }; games.push(game); }
    if (receiptKey && game.reservations?.[receiptKey]) {
      outcome = game.reservations[receiptKey];
      return current;
    }
    const recent = games.filter((entry) => entry.id !== matchId).slice(-10);
    const currentAssets = new Set(Object.values(game.assets || {}));
    const pendingAssets = new Set(Object.values(current?.pending || {}).flatMap((entry) => Object.values(entry.assets || {})));
    const cycles = current?.cycles || {};
    const sections = new Map();
    for (const type of new Set(pool.map((q) => q.type))) {
      const flagHistory = current?.flagMigration || legacyFlags;
      const cycleState = cycles[dbKey(type)] || { number: type === "flag" ? Number(flagHistory?.cycle) || 1 : 1, used: [...legacyAssets, ...(type === "flag" ? Object.values(flagHistory?.used || {}) : [])] };
      const cycleUsed = new Set(Object.values(cycleState.used || {}));
      const section = universe.filter((q) => q.type === type);
      const exhausted = section.length > 0 && section.every((q) => [...aliasesFor(q)].some((key) => cycleUsed.has(key)));
      sections.set(type, { cycleState, cycleUsed, exhausted, section });
    }
    const eligible = pool.filter((q) => {
      const { cycleUsed, exhausted, section } = sections.get(q.type);
      return !q.disabled && section.some((item) => item.id === q.id)
        && ![...aliasesFor(q)].some((key) => currentAssets.has(key))
        && (exhausted || ![...aliasesFor(q)].some((key) => cycleUsed.has(key)));
    });
    const lastSeen = new Map();
    recent.forEach((entry, index) => Object.values(entry.assets || {}).forEach((asset) => lastSeen.set(asset, index)));
    const withoutRecent = eligible.filter((q) => ![...aliasesFor(q)].some((key) => lastSeen.has(key)));
    const fresh = withoutRecent.filter((q) => ![...aliasesFor(q)].some((key) => pendingAssets.has(key)));
    temporarilyHeld = withoutRecent.length > 0 && !fresh.length;
    if (inspectOnly) {
      // Conservative capacity: no promise of mid-game cycle rollover and no
      // counting paraphrases/image aliases as independent questions. No writes.
      const seen = new Set();
      const questions = fresh.filter((question) => {
        const keys = [...aliasesFor(question)];
        const distinct = !keys.some((key) => seen.has(key));
        keys.forEach((key) => seen.add(key));
        return distinct;
      });
      return inspectOnly === "capacity" ? { questions,
        heldTypes: [...new Set(withoutRecent.filter((q) => [...aliasesFor(q)].some((key) => pendingAssets.has(key))).map((q) => q.type))] } : questions;
    }
    const available = fresh;
    if (!available.length) return current;
    selected = available[draw % available.length];
    const { cycleState, cycleUsed, exhausted } = sections.get(selected.type);
    reused = exhausted;
    outcome = { question: shuffled(selected), reused };
    if (publicationRoom) {
      const expiresAt = now() + 30000;
      const pending = { ...current?.pending, [pendingKey]: { room: publicationRoom, gameId: matchId, receiptKey, publicationKey,
        outcome, assets: [...aliasesFor(selected)], type: dbKey(selected.type),
        cycleNumber: Number(cycleState.number || 1) + (exhausted ? 1 : 0), baseUsed: exhausted ? [] : [...cycleUsed], expiresAt } };
      outcome = { ...outcome, reservation: { key: publicationKey, expiresAt } };
      return { ...current, policyVersion: 2, legacyGames, legacyAssets,
        games: games.filter((entry) => Object.values(entry.assets || {}).length).slice(-11),
        ...(importFlags ? { flagMigration: legacyFlags } : {}), pending };
    }
    if (receiptKey) game.reservations = { ...game.reservations, [receiptKey]: outcome };
    game.assets = [...new Set([...Object.values(game.assets || {}), ...aliasesFor(selected)])];
    cycles[dbKey(selected.type)] = { number: Number(cycleState.number || 1) + (exhausted ? 1 : 0), used: [...new Set([...(exhausted ? [] : cycleUsed), ...aliasesFor(selected)])] };
    return { ...current, policyVersion: 2, legacyGames, legacyAssets, ...(importFlags ? { flagMigration: legacyFlags } : {}), games: games.slice(-11), cycles };
  };
  if (inspectOnly) return reserve((await ref.get()).val());
  const result = await ref.transaction(reserve, undefined, false);
  if (!outcome && temporarilyHeld) fail("unavailable", "الأسئلة المتاحة قيد الحجز لمسابقة أخرى؛ انتظر قليلاً ثم أعد المحاولة أو اختر قسمًا آخر");
  if (!result.committed || !outcome) fail("resource-exhausted", "لا يوجد سؤال يحقق دورة القسم واستبعاد آخر 10 مسابقات؛ اختر قسمًا آخر أو أضف محتوى جديدًا");
  const committed = pendingKey ? outcome : receiptKey ? result.snapshot.val().games.find((entry) => entry.id === matchId).reservations[receiptKey] : outcome;
  // RTDB removes empty arrays; replay must restore the bank's empty-choice contract.
  return { ...committed, question: { ...committed.question, options: committed.question.options || [] } };
}
function rotationGameId(id, match) { return `${id}_${match.createdAt || 0}`; }
async function registerRotationMatch(owner, gameId) {
  // Lobby creation is not consumption. The first reservation registers a game.
  // Retained as a compatibility hook for startMatch; intentionally no DB write.
  void owner; void gameId;
}
function rotationAssetKey(question) {
  if (question.conceptId && !question.image && !question.video) return createHash("sha256").update(`concept:${question.conceptId}`).digest("hex");
  return legacyRotationAssetKey(question);
}
function legacyRotationAssetKey(question) {
  const normalized = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const asset = question.image ? `image:${question.image}` : question.video
    ? `video:${question.video.youtubeId}:${question.video.start}:${question.video.end}:${normalized(question.question)}`
    : `text:${normalized(question.question)}`;
  return createHash("sha256").update(asset).digest("hex");
}

async function questionBankState(includeCustom = true) {
  const [customSnapshot, excludedSnapshot, deletedSnapshot] = await Promise.all([
    includeCustom ? db.ref("customQuestions").get() : Promise.resolve(null),
    db.ref("questionExclusions").get(),
    db.ref("questionDeletions").get(),
  ]);
  const custom = customSnapshot?.val() || {};
  const excluded = excludedSnapshot.val() || {};
  const deleted = deletedSnapshot.val() || {};
  const bank = [...QUESTIONS, ...Object.values(custom).filter((q) => q.type !== "flag" || Number(q.createdAt) >= FLAG_BANK_REFRESH_AT).map((q) => ({ ...q, options: q.options || [] }))]
    .filter((q) => deleted[q.id] !== true)
    .map((q) => { const { level: _legacyLevel, ...question } = q; return { ...question, disabled: q.disabled === true || excluded[q.id] === true }; });
  return { bank, excluded, deleted };
}

async function questionBank(includeCustom = true) {
  return (await questionBankState(includeCustom)).bank;
}

async function adminQuestions(action, data) {
  if (action === "getAdminQuestions") {
    const { bank, excluded, deleted } = await questionBankState();
    const legacyDisabled = new Set(QUESTIONS.filter((q) => q.disabled).map((q) => q.id));
    const builtinIds = new Set(QUESTIONS.map((q) => q.id));
    const inventory = {};
    const section = (type) => inventory[type] ||= { builtin: 0, legacyDisabled: 0, deleted: 0, excluded: 0, customAvailable: 0, available: 0 };
    for (const q of QUESTIONS) {
      const counts = section(q.type);
      counts.builtin++;
      // Mutually exclusive reasons: do not count an inactive question twice.
      if (q.disabled) counts.legacyDisabled++;
      else if (deleted[q.id] === true) counts.deleted++;
      else if (excluded[q.id] === true) counts.excluded++;
    }
    for (const q of bank) {
      const counts = section(q.type);
      if (!q.disabled) {
        counts.available++;
        if (!builtinIds.has(q.id)) counts.customAvailable++;
      }
    }
    return { bankRevision: createHash("sha256").update(JSON.stringify(QUESTIONS)).digest("hex"), inventory,
      questions: bank.filter((q) => !legacyDisabled.has(q.id)).map((q) => ({
      id: q.id, type: q.type, question: q.question,
      ...(q.image ? { image: q.image } : {}), ...(q.video ? { video: q.video } : {}),
      disabled: q.disabled === true, custom: !builtinIds.has(q.id),
    })) };
  }
  if (action === "deleteAdminQuestions") {
    if (!Array.isArray(data.ids) || !data.ids.length || data.ids.length > 1200) fail("invalid-argument", "حدد الأسئلة المطلوب حذفها");
    const ids = [...new Set(data.ids)];
    const [bank, deletedSnapshot] = await Promise.all([questionBank(), db.ref("questionDeletions").get()]);
    const knownIds = new Set(bank.map((q) => q.id));
    const deleted = deletedSnapshot.val() || {};
    if (ids.some((id) => !Number.isSafeInteger(id) || (!knownIds.has(id) && deleted[id] !== true))) {
      fail("invalid-argument", "أحد الأسئلة غير موجود؛ حدّث القائمة");
    }
    const builtinIds = new Set(QUESTIONS.map((q) => q.id));
    const updates = {};
    for (const id of ids) {
      // Builtins are immutable deployment assets. Keep only a permanent id marker;
      // never return their contents in the catalog or draw them again after redeploy.
      updates[`questionDeletions/${id}`] = true;
      updates[`questionExclusions/${id}`] = null;
      if (!builtinIds.has(id)) updates[`customQuestions/${id}`] = null;
    }
    await db.ref().update(updates);
    return { count: ids.length };
  }
  if (!Array.isArray(data.ids) || data.ids.length < 1 || data.ids.length > 1200 || typeof data.disabled !== "boolean") {
    fail("invalid-argument", "حدد الأسئلة وحالة الاستبعاد المطلوبة");
  }
  const ids = [...new Set(data.ids)];
  const bank = await questionBank();
  const knownIds = new Set(bank.map((q) => q.id));
  const builtinIds = new Set(QUESTIONS.map((q) => q.id));
  if (ids.some((id) => !Number.isSafeInteger(id) || !knownIds.has(id))) fail("invalid-argument", "أحد الأسئلة غير موجود؛ حدّث القائمة");
  const updates = {};
  for (const id of ids) {
    // Reversible exclusion: preserve the original question and its private answer.
    updates[`questionExclusions/${id}`] = data.disabled ? true : null;
    if (!builtinIds.has(id)) updates[`customQuestions/${id}/disabled`] = data.disabled;
  }
  await db.ref().update(updates);
  return { count: ids.length };
}

async function beginPunishment(uid, data, id, match, teamCode, usedCount, requestId, selectionKey) {
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (!current) return current;
    if (current.state.phase !== "choose" || current.state.question || current.state.targetTeam !== teamCode) return;
    if (sectionCycle(current, teamCode).used.includes("punishment")) return;
    current.state = { ...current.state, phase: "question", round: current.state.round + 1,
      question: { id: now(), type: "punishment", category: "general", question: "سؤال وعقاب", options: [], answer: -1 },
      originalTeam: teamCode, targetTeam: teamCode, passCount: 0, attemptedTeams: [],
      questionValue: 0, pointMultiplier: 1, answer: null, isCorrect: null,
      questionStartedAt: null, questionDuration: 0, viewUntil: null, selectionRequestId: requestId, selectionKey, secretVersion: null,
      punishment: { stage: "prepare", byTeam: teamCode, prepareUntil: now() + 60000 },
    };
    current.typeCounts ||= {};
    current.typeCounts[teamCode] ||= {};
    current.typeCounts[teamCode].punishment = usedCount + 1;
    current.sectionCycleByTeam ||= {};
    current.sectionCycleByTeam[teamCode] = nextSectionCycle(current, teamCode, "punishment");
    current.lastChosenTypeByTeam ||= {};
    current.lastChosenTypeByTeam[teamCode] = "punishment";
    return current;
  }, undefined, false);
  return { status: result.committed && result.snapshot.val()?.state?.punishment ? "accepted" : "late" };
}

async function punishmentAction(uid, data, id, match) {
  const action = data.action;
  const st = match.state;
  const p = st.punishment;
  if (st.question?.type !== "punishment" || !p) fail("failed-precondition", "لا يوجد سؤال وعقاب");
  if (Number(data.questionId) !== st.question.id) fail("failed-precondition", "هذا الطلب لسؤال قديم");
  if (action === "preparePunishment") {
    if (!canChoose(match, uid, p.byTeam)) fail("permission-denied", "ممثل الفريق فقط يجهّز السؤال");
    if (p.stage !== "prepare" || now() > p.prepareUntil) fail("deadline-exceeded", "انتهت دقيقة تجهيز السؤال؛ المقدم ينهي الجولة");
    const target = code(data.targetTeam);
    const prompt = text(data.prompt, 500), answerText = text(data.answerText, 300);
    const selectedMode = data.mode;
    const penalty = selectedMode === "perform" ? text(data.penalty, 200) || "تنفيذ العقاب المتفق عليه" : null;
    if (target === p.byTeam || !match.teams[target] || !prompt || !answerText || !["perform", "deduct"].includes(selectedMode)) fail("invalid-argument", "اختر المنافس واكتب السؤال والإجابة وحدد العقاب أو خصم ٢٠٠ نقطة");
    const secret = await db.ref(`matchSecrets/${id}`).transaction((current) => {
      if (current?.questionId === st.question.id && current.punishmentPrepared) return;
      return { questionId: st.question.id, answer: -1, answerText, question: prompt, options: [], punishmentPrepared: true };
    }, undefined, false);
    if (!secret.committed) fail("failed-precondition", "تم تثبيت السؤال بالفعل");
    const prepared = await db.ref(`matches/${id}`).transaction((current) => {
      if (!current) return current;
      if (current.state.question?.id !== st.question.id || current.state.punishment?.stage !== "prepare" || now() > p.prepareUntil) return;
      current.state.targetTeam = target;
      current.state.question.question = prompt;
      current.state.punishment = { ...p, stage: "answering", targetTeam: target, penalty, selectedMode };
      return current;
    }, undefined, false);
    if (!prepared.committed) fail("failed-precondition", "تغيّر السؤال أو انتهت دقيقة التجهيز");
    return { ok: true };
  }
  if (action === "requestPunishmentOutcome") {
    if (p.selectedMode) fail("failed-precondition", "تم تحديد الجزاء قبل السؤال ولا يمكن تغييره");
    if (!canChoose(match, uid, p.targetTeam)) fail("permission-denied", "ممثل الفريق المستهدف يختار");
    if (!["perform", "deduct"].includes(data.mode) || p.stage !== "failed") fail("failed-precondition", "الاختيار بعد الإجابة الخاطئة فقط");
    await db.ref(`matches/${id}/state/punishment/requestedMode`).set(data.mode);
    return { ok: true };
  }
  requireHost(match, uid);
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (!current) return current;
    const state = current.state, penalty = state.punishment;
    if (state.question?.id !== st.question.id || !penalty) return;
    if (action === "judgePunishment") {
      if (penalty.stage !== "answering" || typeof data.correct !== "boolean") return;
      state.isCorrect = data.correct;
      penalty.stage = data.correct ? "resolved" : "failed";
      state.phase = data.correct ? "revealed" : "question";
      if (!data.correct && penalty.selectedMode === "deduct") {
        current.teams[penalty.targetTeam].score = (Number(current.teams[penalty.targetTeam].score) || 0) - 200;
        penalty.stage = "resolved"; penalty.mode = "deduct"; state.phase = "revealed";
      }
    } else if (action === "resolvePunishment") {
      if (penalty.stage !== "failed" || !["perform", "deduct"].includes(data.mode)) return;
      if (penalty.selectedMode && (penalty.selectedMode !== "perform" || data.mode !== "perform")) return;
      if (data.mode === "deduct") current.teams[penalty.targetTeam].score = (Number(current.teams[penalty.targetTeam].score) || 0) - 200;
      penalty.stage = "resolved"; penalty.mode = data.mode; state.phase = "revealed";
    } else if (action === "cancelPunishment") {
      if (!["prepare", "submitting", "answering"].includes(penalty.stage)) return;
      penalty.stage = "resolved"; penalty.mode = "cancelled"; state.phase = "revealed"; state.isCorrect = null;
    } else return;
    return current;
  }, undefined, false);
  if (!result.committed || !result.snapshot.val()) fail("failed-precondition", "تغيّرت الجولة أو تم تثبيت النتيجة بالفعل");
  return { ok: true };
}
function sectionCycle(match, teamCode) {
  const saved = match.sectionCycleByTeam?.[teamCode];
  const previous = !saved && match.lastChosenTypeByTeam?.[teamCode];
  const activeTypes = match.enabledTypes.filter((type) => !match.rotationBlocked?.[teamCode]?.[type]?.bank
    && (match.typeCounts?.[teamCode]?.[type] || 0) < typeCap(match, type));
  const used = [...new Set(Object.values(saved?.used || (previous ? [previous] : [])))].filter((type) => activeTypes.includes(type));
  const completed = activeTypes.length > 0 && activeTypes.every((type) => used.includes(type));
  return { used: completed ? [] : used, number: (Number(saved?.number) || 1) + (completed ? 1 : 0) };
}
function nextSectionCycle(match, teamCode, type) {
  const cycle = sectionCycle(match, teamCode);
  const used = [...new Set([...cycle.used, type])];
  // Keep the number so an empty used list pruned by RTDB still marks a new cycle.
  return match.enabledTypes.filter((enabled) => !match.rotationBlocked?.[teamCode]?.[enabled]?.bank).every((enabled) => used.includes(enabled))
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
    if (type === "punishment") return [type, base];
    if (!typeQuestions.length) return [type, 0];
    const count = new Set(typeQuestions.map(questionAssetKey)).size;
    const fair = Math.floor(count / Math.max(1, teamCount));
    return [type, Math.max(0, Math.min(base, fair))];
  }));
}
async function shortTeamCodes(id, access) {
  const result = {};
  for (const [teamCode, key] of Object.entries(access.teamKeys || {})) {
    const saved = (await db.ref(`matchAccess/${id}/shortTeamCodes/${teamCode}`).get()).val();
    if (saved) { result[teamCode] = saved; continue; }
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = `${LETTERS[randomInt(LETTERS.length)]}${String(randomInt(1000)).padStart(3, "0")}`;
      const reserved = await db.ref(`teamJoinCodes/${candidate}`).transaction((current) => {
        if (current && current.expiresAt > now()) return;
        return { matchCode: id, teamCode, inviteKey: key, expiresAt: now() + 24 * 60 * 60 * 1000 };
      }, undefined, false);
      if (!reserved.committed) continue;
      const assigned = await db.ref(`matchAccess/${id}/shortTeamCodes/${teamCode}`).transaction(
        (current) => current || candidate, undefined, false,
      );
      result[teamCode] = assigned.snapshot.val();
      if (result[teamCode] !== candidate) await db.ref(`teamJoinCodes/${candidate}`).remove();
      break;
    }
    if (!result[teamCode]) fail("resource-exhausted", "تعذّر تجهيز كود الفريق، أعد المحاولة");
  }
  return result;
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
  const id = requireRoomCode(rawCode);
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
  if (options.timerMode !== undefined && options.timerMode !== "advisory") {
    fail("invalid-argument", "المؤقت العادي إرشادي فقط؛ القفل عند الصفر غير مدعوم");
  }
  const challengeMode = options.challengeMode === "picture_guess" ? "picture_guess" : "classic";
  if (challengeMode === "picture_guess" && names.length !== 2) fail("invalid-argument", "تحدي الصور يحتاج فريقين");
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
  await settleRotationReservations(uid);
  const bank = await questionBank();
  const active = bank.filter((question) => !question.disabled && enabledTypes.includes(question.type));
  const available = active.length ? await rotateQuestion(active, "preflight", uid, bank, null, true) : [];
  const typeCaps = fairTypeCaps(enabledTypes, names.length, questionsPerTeam, available);
  const fullCycles = Math.floor(questionsPerTeam / enabledTypes.length);
  if (enabledTypes.some((type) => typeCaps[type] < fullCycles)) fail("failed-precondition", "بعض الأقسام لا تحتوي أسئلة كافية ليكمل كل فريق جميع الأقسام؛ قلّل عدد الأسئلة أو اختر أقسامًا إضافية");
  if (Object.values(typeCaps).reduce((total, cap) => total + cap, 0) < questionsPerTeam) {
    fail("failed-precondition", "عدد الأقسام المختارة لا يكفي لإكمال المسابقة من دون تكرار؛ اختر أقساماً إضافية");
  }
  const answerMode = ["anyone", "representative", "host"].includes(options.answerMode) ? options.answerMode : "representative";
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = matchCode();
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
      createdAt, expiresAt: createdAt + LOBBY_TTL_MS, status: "lobby", teamOrder, turnIndex: 0, questionsPerTeam, totalRounds, timer, timerMode: "advisory", answerMode, challengeMode, enabledTypes, typeCaps, teams,
      state: { phase: "lobby", round: 0, targetTeam: null, originalTeam: null, passCount: 0, question: null, answer: null, isCorrect: null, timer, questionStartedAt: null, questionDuration: null, selectionRequestId: null, usedIds: [], usedAssets: [], questionValue: 0, viewUntil: null, assistUsed: false, pointMultiplier: 1, extraTimeUsed: false, stealFullValue: false, forcedPlayerId: null, forcedPlayerName: null, cardsFrozenTeam: null, cardUsedThisTurn: false },
    };
    // A cold transaction cache retries against the remote record. Never overwrite
    // another presenter who obtained the same short audience code concurrently.
    const reserved = await db.ref(`matches/${id}`).transaction((current) => {
      if (current) return;
      return match;
    }, undefined, false);
    if (!reserved.committed) continue;
    await db.ref(`matchAccess/${id}`).set({ hostUid: uid, viewerKey: inviteKey(), teamKeys, playerUids: {} });
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
    // Room-scoped deterministic identity makes a retry recover the same reservation
    // if the process dies before its private UID mapping is persisted. Never publish UID.
    const playerId = `p_${createHash("sha256").update(JSON.stringify([id, match.createdAt || 0, uid])).digest("hex").slice(0, 32)}`;
    const proposedPlayer = { id: playerId, name: text(data.name, 20) || "لاعب", teamCode, joinedAt: now() };
    let rejection;
    const reserved = await db.ref(`matches/${id}`).transaction((current) => {
      rejection = null;
      if (!current) return current;
      const existingPlayer = current.players?.[playerId];
      if (existingPlayer) {
        if (existingPlayer.teamCode !== teamCode) { rejection = "team"; return; }
        return current;
      }
      if (current.status !== "lobby") { rejection = "closed"; return; }
      if (!current.teams?.[teamCode]) { rejection = "team"; return; }
      if (Object.values(current.players || {}).filter((p) => p.teamCode === teamCode).length >= MAX_PLAYERS_PER_TEAM) {
        rejection = "full"; return;
      }
      current.players ||= {};
      current.players[playerId] = proposedPlayer;
      return current;
    }, undefined, false);
    if (!reserved.committed || !reserved.snapshot.val()?.players?.[playerId]) {
      if (rejection === "full") fail("resource-exhausted", "اكتمل عدد لاعبي هذا الفريق");
      fail("failed-precondition", rejection === "team" ? "هذا الجهاز مسجل في فريق آخر" : "أُغلق دخول الفرق بعد بدء المسابقة");
    }
    const player = reserved.snapshot.val().players[playerId];
    await db.ref(`matchAccess/${id}/playerUids/${player.id}`).set(uid);
    await safelyRecordUsage(() => recordPlayerUsage(uid));
    return { player: publicPlayer(player) };
  } finally {
    await claimRef.remove();
  }
}

async function startChallenge(uid) {
  const bank = await questionBank(false);
  const selected = randomOrder(bank.filter((q) => !q.disabled && !["flag", "brand", "acting", "memory"].includes(q.type) && Array.isArray(q.options) && q.options.length > 0)).slice(0, 100).map(shuffled);
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

function secretForState(root, state) {
  // Versioned secrets are private and staged before the guarded public commit.
  // A late executor cannot overwrite the secret referenced by a newer question.
  return state?.secretVersion ? root?.versions?.[state.secretVersion] : root;
}
async function readQuestionSecret(id, state) {
  return secretForState((await db.ref(`matchSecrets/${id}`).get()).val(), state);
}

async function markSectionUnavailable(id, match, teamCode, type) {
  // An obsolete empty result must never disable a section in a newer turn.
  return db.ref(`matches/${id}`).transaction((current) => {
    if (!current) return current;
    if (current.status !== "playing" || !sameTurnContext(current, match)
      || current.state.phase !== "choose" || current.state.question) return;
    current.rotationBlocked ||= {};
    current.rotationBlocked[teamCode] ||= {};
    current.rotationBlocked[teamCode][type] = { bank: true };
    return current;
  }, undefined, false);
}

async function recheckSelectionCapacity(id, match, transitionKey) {
  if (match.status !== "playing" || match.state.phase !== "choose" || match.state.question) {
    fail("failed-precondition", "إعادة فحص السعة متاحة عند اختيار القسم فقط");
  }
  const owner = match.hostUid;
  await settleRotationReservations(owner);
  const bank = await questionBank();
  const usedIds = new Set(match.state.usedIds || []), usedAssets = new Set(match.state.usedAssets || []);
  const pool = bank.filter((q) => !q.disabled && match.enabledTypes.includes(q.type)
    && !usedIds.has(q.id) && !usedAssets.has(questionAssetKey(q)));
  const inspection = pool.length ? await rotateQuestion(pool, rotationGameId(id, match), owner, bank, null, "capacity")
    : { questions: [], heldTypes: [] };
  const fresh = new Set(inspection.questions.map((q) => q.type)), held = new Set(inspection.heldTypes);
  let response;
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    response = undefined;
    if (!current) return current;
    if (current.state?.hostTransition?.key === transitionKey) { response = current.state.hostTransition.result; return current; }
    if (!sameTurnContext(current, match) || current.status !== "playing"
      || (current.state.selectionLease?.expiresAt > now()) || current.state.cardClaimId) return;
    const team = current.state.targetTeam;
    current.rotationBlocked ||= {};
    current.rotationBlocked[team] ||= {};
    for (const type of current.enabledTypes) {
      // A live pending hold is retryable contention, not an exhausted section.
      if (type === "punishment" || fresh.has(type) || held.has(type)) delete current.rotationBlocked[team][dbKey(type)];
      else current.rotationBlocked[team][dbKey(type)] = { bank: true };
    }
    const usable = current.enabledTypes.filter((type) => !current.rotationBlocked[team][dbKey(type)]?.bank
      && (current.typeCounts?.[team]?.[type] || 0) < typeCap(current, type));
    const available = usable.some((type) => type === "punishment" || fresh.has(type));
    const busy = !available && usable.some((type) => held.has(type));
    if (available) delete current.state.selectionPause;
    else current.state.selectionPause = { reason: busy ? "busy" : "capacity", at: now() };
    response = { available, busy };
    current.state.revision = (current.state.revision || 0) + 1;
    current.state.hostTransition = { key: transitionKey, result: response };
    return current;
  }, undefined, false);
  if (!result.committed || !response) fail("failed-precondition", "تغيّر الدور أو يوجد اختيار قيد التنفيذ؛ حدّث الشاشة وأعد المحاولة");
  return response;
}

async function chooseType(uid, data) {
  const { id, match, access } = await loadMatch(data.matchCode);
  const type = text(data.type, 50);
  const typeKey = dbKey(type);
  const requestId = text(data.requestId, 80) || `${uid}_${now()}_${randomInt(100000, 999999)}`;
  const teamCode = match.state.targetTeam || match.teamOrder[match.turnIndex % match.teamOrder.length];
  if (!canChoose(match, uid, teamCode)) fail("permission-denied", "الاختيار للفريق صاحب الدور");
  const contextKey = hostTransitionKey(data);
  const selectionKey = contextKey && createHash("sha256").update(JSON.stringify([uid, type, requestId, contextKey])).digest("hex");
  if (selectionKey && match.state.phase === "question" && match.state.selectionKey === selectionKey) return { status: "accepted" };
  if (!selectionKey || !hostTransitionMatches(match.state, data.transition)) return { status: "late", reason: "stale" };
  if (match.state.phase !== "choose" || match.state.question) {
    return { status: "late", reason: "initial-state", phase: match.state.phase, hasQuestion: Boolean(match.state.question) };
  }
  if (sectionCycle(match, teamCode).used.includes(type)) return { status: "cooldown" };
  if (!match.enabledTypes.includes(type)) fail("invalid-argument", "نوع السؤال غير مفعّل");
  const usedCount = match.typeCounts?.[teamCode]?.[type] || 0;
  if (usedCount >= typeCap(match, type)) return { status: "cap" };
  let candidates;
  candidates = await questionBank();
  if (type === "punishment") return beginPunishment(uid, data, id, match, teamCode, usedCount, requestId, selectionKey);
  const usedIds = new Set(match.state.usedIds || []);
  const usedAssets = new Set(match.state.usedAssets || []);
  const teamUsedIds = new Set(match.usedIdsByTeam?.[teamCode] || []);
  const teamPool = candidates.filter((q) => q.type === type && !q.disabled && !teamUsedIds.has(q.id));
  if (!teamPool.length) {
    await markSectionUnavailable(id, match, teamCode, typeKey);
    return { status: "empty" };
  }
  // ممنوع تكرار السؤال أو الصورة نفسها بين الفرق داخل المسابقة.
  const pool = teamPool.filter((q) => !usedIds.has(q.id) && !usedAssets.has(questionAssetKey(q)));
  if (!pool.length) {
    await markSectionUnavailable(id, match, teamCode, typeKey);
    return { status: "empty" };
  }

  // سجل دائم للمقدم: لا نكرر السؤال بين المسابقات حتى ينتهي مخزون القسم.
  const historyOwner = match.hostUid || uid;

  let question;
  const started = now();
  const matchRef = db.ref(`matches/${id}`);
  const stateRef = matchRef.child("state");
  const executor = randomUUID();
  const acquired = await matchRef.transaction((current) => {
    if (!current) return current;
    const state = current.state;
    if (current.status !== "playing" || !sameTurnContext(current, match)
      || state.phase !== "choose" || state.question
      || (state.selectionLease && state.selectionLease.expiresAt > now())
      || !canChoose(attachAccess(current, access), uid, teamCode)) return;
    state.selectionLease = { owner: executor, expiresAt: now() + 30000 };
    return current;
  }, undefined, false);
  if (!acquired.committed || acquired.snapshot.val()?.state?.selectionLease?.owner !== executor) return { status: "late", reason: "claimed" };
  const release = () => matchRef.transaction((current) => {
    if (!current) return current;
    if (current.state?.selectionLease?.owner !== executor) return;
    delete current.state.selectionLease;
    return current;
  }, undefined, false);

  try {
    const latestState = (await stateRef.get()).val();
    if (latestState?.phase === "question" && latestState.selectionKey === selectionKey) {
      return { status: "accepted" };
    }
    if (!latestState || latestState.phase !== "choose" || latestState.question || latestState.targetTeam !== teamCode) {
      return { status: "late", reason: "state-changed" };
    }
    const rotated = await rotateQuestion(pool, rotationGameId(id, match), historyOwner, candidates, `selection:${selectionKey}`, false, id);
    question = rotated.question;
    const seconds = viewSeconds(question);
    const viewUntil = seconds ? started + seconds * 1000 : null;
    const isActing = question.type === "acting";

    const nextState = {
      ...latestState,
      phase: "question",
      selectionPause: null,
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
      selectionKey,
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
      rotationReused: rotated.reused,
      punishment: null,
      usedIds: [...new Set([...(latestState.usedIds || []), question.id])],
      usedAssets: [...new Set([...(latestState.usedAssets || []), questionAssetKey(question)])],
    };

    // Stage a private immutable secret before a conditional public commit.
    const secretVersion = rotated.reservation.key;
    await db.ref(`matchSecrets/${id}/versions/${secretVersion}`).set(questionSecret(question));
    const expected = match;
    const published = await db.ref(`matches/${id}`).transaction((current) => {
      if (!current) return current;
      const state = current.state;
      if (current.status !== "playing" || !sameTurnContext(current, expected)
        || !rotationPublicationAllowed(current, rotated.reservation)
        || state.phase !== "choose" || state.question
        || state.selectionLease?.owner !== executor || state.selectionLease.expiresAt <= now()
        || !canChoose(attachAccess(current, access), uid, teamCode)
        || !current.enabledTypes.includes(type) || sectionCycle(current, teamCode).used.includes(type)
        || (current.typeCounts?.[teamCode]?.[type] || 0) !== usedCount) return;
      current.state = { ...nextState, secretVersion, selectionLease: null, revision: (state.revision || 0) + 1 };
      current.typeCounts ||= {};
      current.typeCounts[teamCode] ||= {};
      current.typeCounts[teamCode][typeKey] = usedCount + 1;
      current.lastChosenTypeByTeam ||= {};
      current.lastChosenTypeByTeam[teamCode] = type;
      current.sectionCycleByTeam ||= {};
      current.sectionCycleByTeam[teamCode] = nextSectionCycle(match, teamCode, type);
      current.usedIdsByTeam ||= {};
      current.usedIdsByTeam[teamCode] = [...teamUsedIds, question.id];
      recordRotationPublication(current, rotated.reservation);
      return current;
    }, undefined, false);
    if (!published.committed || published.snapshot.val()?.state?.secretVersion !== secretVersion) return { status: "late", reason: "state-changed" };
    await db.ref().update({
      [`hostQuestionHistory/${historyOwner}/${typeKey}/bank/${question.id}`]: started,
      [`globalQuestionHistory/${typeKey}/bank/${question.id}`]: started,
    });
    return { status: "accepted" };
  } catch (error) {
    if (error.code === "unavailable") return { status: "busy" };
    if (error.code === "resource-exhausted") {
      await markSectionUnavailable(id, match, teamCode, typeKey);
      return { status: "rotation" };
    }
    throw error;
  } finally {
    await release();
    await settleRotationReservations(historyOwner);
  }
}

async function publishShowdown(id, match, nextState, secret, number, transitionKey, reservation = null) {
  const secretVersion = reservation?.key || randomUUID();
  await db.ref(`matchSecrets/${id}/versions/${secretVersion}`).set(secret);
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (!current) return current;
    if (transitionKey && current.state?.hostTransition?.key === transitionKey) return current;
    if (current.status !== "playing" || !sameTurnContext(current, match)
      || !rotationPublicationAllowed(current, reservation)
      || (current.showdownCount || 0) !== (match.showdownCount || 0)) return;
    current.showdownCount = number;
    current.state = { ...nextState, secretVersion, revision: (current.state.revision || 0) + 1,
      ...(transitionKey ? { hostTransition: { key: transitionKey, result: { showdown: true } } } : {}) };
    recordRotationPublication(current, reservation);
    return current;
  }, undefined, false);
  const state = result.snapshot.val()?.state;
  return { showdown: Boolean(result.committed && (state?.secretVersion === secretVersion
    || (transitionKey && state?.hostTransition?.key === transitionKey))) };
}

async function startShowdown(id, match, transitionKey = null, skipUnanswered = false) {
  if (match.challengeMode === "picture_guess") return startPictureGuess(id, match, transitionKey);
  const showdownNumber = (match.showdownCount || 0) + 1;
  const wantsImage = showdownNumber % 2 === 0;
  const allowedTextTypes = new Set(["multiple_choice", "riddle", "completion"]);
  const usedIds = new Set(match.state.usedIds || []);
  const usedAssets = new Set(match.state.usedAssets || []);
  const bank = await questionBank();
  const eligible = bank.filter((question) =>
    !question.disabled
    && !usesVerbalChoices(question.type)
    && Array.isArray(question.options)
    && question.options.length === 4
    && (wantsImage ? Boolean(question.image) : allowedTextTypes.has(question.type))
  );
  const basePool = eligible.filter((question) => !usedIds.has(question.id) && !usedAssets.has(questionAssetKey(question)));
  if (!basePool.length) return advance(id, match, true, transitionKey, skipUnanswered);

  const historyOwner = match.hostUid || "shared";
  let rotated;
  try { rotated = await rotateQuestion(basePool, rotationGameId(id, match), historyOwner, bank, `showdown:${showdownNumber}`, false, id); }
  catch (error) {
    if (error.code === "unavailable") return { showdown: false, reason: "busy" };
    if (error.code !== "resource-exhausted") throw error;
    return advance(id, match, true, transitionKey, skipUnanswered);
  }
  const question = rotated.question;
  const createdAt = now();
  const opensAt = createdAt + SHOWDOWN_OPEN_DELAY_MS;
  const closesAt = opensAt + SHOWDOWN_DURATION_MS;

  try { return await publishShowdown(id, match, {
    ...match.state, phase: "showdown", punishment: null, rotationReused: rotated.reused,
    question: publicQuestion(question), answer: null, isCorrect: null,
    targetTeam: null, originalTeam: null, viewUntil: null,
    questionStartedAt: opensAt, questionDuration: SHOWDOWN_DURATION_MS / 1000,
    showdown: { number: showdownNumber, points: SHOWDOWN_POINTS, opensAt, closesAt, answers: {}, winnerTeam: null },
    usedIds: [...usedIds, question.id], usedAssets: [...usedAssets, questionAssetKey(question)],
  }, questionSecret(question), showdownNumber, transitionKey, rotated.reservation);
  } finally { await settleRotationReservations(historyOwner); }
}

async function startPictureGuess(id, match, transitionKey = null) {
  if (match.teamOrder.length !== 2) fail("failed-precondition", "تحدي الصور يحتاج فريقين");
  const latest = (await db.ref(`matches/${id}/state`).get()).val();
  if (!latest || latest.round !== match.state.round || latest.phase !== match.state.phase) return { showdown: false };
  const number = (match.showdownCount || 0) + 1;
  const chosen = randomOrder(PICTURE_GUESS_ITEMS).slice(0, 2);
  const pictures = Object.fromEntries(match.teamOrder.map((team, i) => [team, { ...chosen[i], targetTeam: match.teamOrder[1 - i] }]));
  const questionId = 800000 + number;
  return publishShowdown(id, match, {
    ...latest, phase: "showdown", pictureStartClaim: null,
    question: { id: questionId, type: "picture_guess", category: "challenge", question: "اسألوا بصيغة هل هو… وخمّنوا صورة الفريق المنافس", options: [], answer: -1 },
    showdown: { kind: "picture_guess", number, points: SHOWDOWN_POINTS, opensAt: 0, closesAt: 0, winnerTeam: null, answers: {} },
    answer: null, isCorrect: null, targetTeam: null, originalTeam: null, viewUntil: null,
    questionStartedAt: 0, questionDuration: 120, punishment: null, assistUsed: false,
  }, { questionId, mode: "picture_guess", pictures }, number, transitionKey);
}

async function pictureGuessView(uid, data, id, match) {
  const host = match.hostUid === uid;
  const player = Object.values(match.players || {}).find((p) => p.authUid === uid);
  if (!host && !player) fail("permission-denied", "صور التحدي للمشاركين فقط");
  if (match.state.showdown?.kind !== "picture_guess" || !["showdown", "showdown_revealed"].includes(match.state.phase) || data.questionId !== match.state.question?.id) return { questionId: null, pictures: {} };
  const secret = await readQuestionSecret(id, match.state);
  if (secret?.questionId !== data.questionId || secret.mode !== "picture_guess") return { questionId: null, pictures: {} };
  const pictures = host ? secret.pictures : { [player.teamCode]: secret.pictures[player.teamCode] };
  return { questionId: secret.questionId, pictures };
}

async function judgePictureGuess(uid, data, id, match) {
  requireHost(match, uid);
  const team = code(data.teamCode);
  if (!["win", "none"].includes(data.result) || (data.result === "win" && !match.teams[team])) fail("invalid-argument", "اختر الفريق الفائز أو لا أحد");
  if (data.questionId !== match.state.question?.id) return { accepted: false };
  const arrivedAt = now();
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (current === null) return null;
    const s = current?.state;
    if (!s || s.phase !== "showdown" || s.question?.id !== data.questionId || s.showdown?.kind !== "picture_guess" || !s.showdown.opensAt || arrivedAt < s.showdown.closesAt) return;
    s.phase = "showdown_revealed";
    s.showdown.winnerTeam = data.result === "win" ? team : null;
    s.showdown.pointsAwarded = data.result === "win";
    if (data.result === "win") {
      current.teams[team].score = (current.teams[team].score || 0) + s.showdown.points;
    }
    return current;
  }, undefined, false);
  return { accepted: result.committed };
}

async function startPictureGuessTimer(uid, data, id, match) {
  requireHost(match, uid);
  const startedAt = now();
  const result = await db.ref(`matches/${id}/state`).transaction((s) => {
    if (s === null) return null;
    if (s.phase !== "showdown" || s.question?.id !== data.questionId || s.showdown?.kind !== "picture_guess" || s.showdown.opensAt) return;
    s.showdown.opensAt = startedAt;
    s.showdown.closesAt = startedAt + 120000;
    s.questionStartedAt = startedAt;
    return s;
  }, undefined, false);
  return { accepted: result.committed };
}

async function adjustTeamScore(uid, data, id, match) {
  requireHost(match, uid);
  const team = code(data.teamCode);
  const delta = data.delta;
  const reason = text(data.reason, 160);
  const requestId = text(data.requestId, 80);
  if (!match.teams[team] || !Number.isSafeInteger(delta) || !delta || Math.abs(delta) > 100000 || !reason || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) fail("invalid-argument", "حدد الفريق ومقدار النقاط وسبب التعديل");
  const at = now();
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (current === null) return null;
    if (!current.teams?.[team] || current.scoreAdjustments?.[requestId]) return;
    const before = current.teams[team].score || 0;
    const after = before + delta;
    if (!Number.isSafeInteger(after)) return;
    const event = { requestId, teamCode: team, delta, before, after, reason, at };
    current.teams[team].score = after;
    current.teams[team].scoreAdjustment = event;
    current.scoreAdjustments = current.scoreAdjustments || {};
    current.scoreAdjustments[requestId] = event;
    return current;
  }, undefined, false);
  const saved = result.snapshot.val()?.scoreAdjustments?.[requestId];
  return { accepted: result.committed || Boolean(saved && saved.teamCode === team && saved.delta === delta && saved.reason === reason) };
}

async function submitShowdownAnswer(uid, data, receivedAt = now()) {
  // Measure arrival before database reads so their latency cannot reorder players.
  const id = code(data.matchCode);
  const [{ match, access }, secretSnapshot] = await Promise.all([
    loadMatch(id),
    db.ref(`matchSecrets/${id}`).get(),
  ]);
  const player = playerForUid(match, uid, text(data.playerId, 80));
  const choice = Number(data.choice);
  const showdown = match.state.showdown;
  if (!player || match.state.phase !== "showdown" || !showdown || showdown.kind === "picture_guess") return { status: "late" };
  if (data.questionId != null && data.questionId !== match.state.question?.id) return { status: "stale" };
  if (!Number.isInteger(choice) || choice < 0 || choice >= (match.state.question?.options?.length || 0)) return { status: "late" };
  if (receivedAt < showdown.opensAt) return { status: "early" };
  if (receivedAt > showdown.closesAt) return { status: "late" };
  const secret = secretForState(secretSnapshot.val(), match.state);
  if (!secret || secret.questionId !== match.state.question?.id) fail("failed-precondition", "تعذّر التحقق من سؤال المواجهة، أعد المحاولة");

  const submissionId = `${uid}_${receivedAt}_${randomInt(100000, 999999)}`;
  const matchRef = db.ref(`matches/${id}`);
  const result = await matchRef.transaction((current) => {
    // A cold RTDB cache starts at null. Return null to fetch/retry against the
    // server; undefined would abort before either recording or scoring an answer.
    if (current === null) return null;
    const currentShowdown = current?.state?.showdown;
    if (!current || current.state?.phase !== "showdown" || !currentShowdown) return;
    if (current.state.question?.id !== secret.questionId || currentShowdown.number !== showdown.number) return;
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
  if (data.questionId != null && data.questionId !== match.state.question?.id) return { finished: false };
  if (match.state.phase === "showdown_revealed") return { finished: true };
  // لا تعتمد نهاية تحدي الصور أي نتيجة؛ الحكم يختار أحد الخيارات الثلاثة.
  if (match.state.showdown?.kind === "picture_guess") return { finished: false };
  if (match.state.phase !== "showdown" || !match.state.showdown || now() < match.state.showdown.closesAt) return { finished: false };
  const secret = secretForState(secretSnapshot.val(), match.state);
  if (!secret || secret.questionId !== match.state.question?.id) fail("failed-precondition", "تعذّر التحقق من سؤال المواجهة، أعد المحاولة");
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (current === null) return null;
    if (!current || current.state?.phase !== "showdown" || now() < current.state.showdown?.closesAt) return;
    if (current.state.question?.id !== secret.questionId || current.state.showdown.number !== match.state.showdown.number) return;
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

function answerAttemptId(state) {
  return `${state.round || 0}:${state.targetTeam || ""}:${state.passCount || 0}:${state.selectionRequestId || ""}`;
}
function answerContextMatches(state, data) {
  return data.questionId === state.question?.id && data.attemptId === answerAttemptId(state)
    && Number.isSafeInteger(data.revision) && data.revision === (state.revision || 0)
    && typeof data.requestId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(data.requestId);
}
function acceptedAnswerRetry(state, data, playerId) {
  const receipt = state.answer?.receipt;
  return Boolean(receipt && playerId && state.answer.playerId === playerId
    && state.question?.id === data.questionId && answerAttemptId(state) === data.attemptId
    && receipt.requestId === data.requestId && receipt.revision === data.revision
    && state.answer.choice === data.choice);
}
async function submitAnswer(uid, data, asHost = false) {
  const { id, match, access } = await loadMatch(data.matchCode);
  if (asHost) requireHost(match, uid);
  const existingPlayer = asHost ? { id: "host" } : playerForUid(match, uid, text(data.playerId, 80));
  if (acceptedAnswerRetry(match.state, data, existingPlayer?.id)) return { status: "accepted" };
  if (!answerContextMatches(match.state, data)) return { status: "stale" };
  const choice = data.choice;
  let status = "late";
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (current === null) return null; // RTDB cold-cache retry, not an abort.
    const state = current.state;
    if (!state) { status = "stale"; return; }
    const latest = attachAccess(current, access);
    if (asHost) requireHost(latest, uid);
    const player = asHost ? { id: "host", name: current.hostName || "المقدم", teamCode: state.targetTeam } : playerForUid(latest, uid, text(data.playerId, 80));
    if (acceptedAnswerRetry(state, data, player?.id)) { status = "accepted"; return; }
    if (!answerContextMatches(state, data)) { status = "stale"; return; }
    if (!player || player.teamCode !== state.targetTeam) fail("permission-denied", "الإجابة للفريق صاحب السؤال");
    const mode = current.answerMode || "anyone";
    if (asHost && mode !== "host") fail("failed-precondition", "وضع الإجابة ليس للمقدم");
    if (!asHost && (state.forcedPlayerId ? state.forcedPlayerId !== player.id
      : mode === "host" || (mode === "representative" && current.teams[player.teamCode]?.captainId !== player.id))) {
      fail("permission-denied", "الإجابة للاعب المخول فقط");
    }
    if (state.phase !== "question" || state.answer || !Number.isInteger(choice) || choice < 0 || choice >= (state.question?.options?.length || 0)) { status = "late"; return; }
    state.phase = "locked";
    state.answer = { playerId: player.id, playerName: player.name, choice, at: now(), receipt: { requestId: data.requestId, revision: data.revision } };
    state.revision = (state.revision || 0) + 1;
    status = "accepted";
    return current;
  }, undefined, false);
  return { status: result.snapshot.val() ? status : "late" };
}

async function submitHostAnswer(uid, data) {
  return submitAnswer(uid, data, true);
}

async function reveal(id, match, correctOverride, transitionKey = null) {
  const state = match.state;
  if (!["question", "locked"].includes(state.phase)) fail("failed-precondition", "تم كشف هذا السؤال مسبقاً");
  const secret = await readQuestionSecret(id, match.state);
  if (!state.question || !secret || secret.questionId !== state.question.id) fail("failed-precondition", "تعذّر التحقق من السؤال");
  const correct = typeof correctOverride === "boolean" ? correctOverride : state.answer?.choice === secret.answer;
  const teamCode = state.targetTeam;
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
  };
  if ((correct || !canPass) && Array.isArray(secret.options)) {
    updates[`matches/${id}/state/question/question`] = text(secret.question, 500);
    updates[`matches/${id}/state/question/options`] = secret.options.map((option) => text(option, 300));
    updates[`matches/${id}/state/question/promptHidden`] = null;
    updates[`matches/${id}/state/question/optionsHidden`] = null;
  }
  const result = await db.ref(`matches/${id}`).transaction((current) => {
    if (current === null) return null;
    const s = current.state;
    if (transitionKey && s?.hostTransition?.key === transitionKey) return current;
    if (current.status !== "playing" || !sameTurnContext(current, match) || !["question", "locked"].includes(s?.phase)) return;
    for (const [path, value] of Object.entries(updates)) {
      const keys = path.split("/").slice(2);
      const last = keys.pop();
      const parent = keys.reduce((node, key) => node[key] ||= {}, current);
      if (value === null) delete parent[last]; else parent[last] = value;
    }
    const team = current.teams[teamCode];
    team.correctCount = (team.correctCount || 0) + (correct ? 1 : 0);
    team.wrongCount = (team.wrongCount || 0) + (correct ? 0 : 1);
    if (correct) {
      team.score = (team.score || 0) + points(state);
      team.cardBalance = (team.cardBalance || 0) + cardReward(state);
    }
    s.revision = (s.revision || 0) + 1;
    if (transitionKey) s.hostTransition = { key: transitionKey, result: { correct } };
    return current;
  }, undefined, false);
  if (!result.committed) fail("failed-precondition", "تم كشف هذا السؤال مسبقاً أو تغيّر السؤال");
  return { correct };
}

function hostTransitionKey(data) {
  const t = data.transition;
  if (!t || typeof t.requestId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(t.requestId)
    || !Number.isInteger(t.revision) || t.revision < 0 || !Number.isInteger(t.round)
    || typeof t.phase !== "string" || typeof t.attemptId !== "string"
    || !(t.questionId === null || Number.isInteger(t.questionId))) return null;
  return createHash("sha256").update(JSON.stringify([data.action, t.requestId, t.phase, t.round, t.questionId, t.attemptId, t.revision, data.action === "judgeVerbal" ? Boolean(data.correct) : null, data.action === "advanceTurn" ? data.skipUnanswered === true : null])).digest("hex");
}
function hostTransitionMatches(state, transition) {
  return transition && transition.phase === state.phase && transition.round === (state.round || 0)
    && transition.questionId === (state.question?.id ?? null)
    && transition.revision === (state.revision || 0)
    && transition.attemptId === `${state.round || 0}:${state.targetTeam || ""}:${state.passCount || 0}:${state.selectionRequestId || ""}`;
}

// Compare the committed public turn, not an old object copied over newer state.
function sameTurnContext(current, expected) {
  const a = current?.state, b = expected?.state;
  return Boolean(a && b && current.status === expected.status
    && current.turnIndex === expected.turnIndex
    && a.phase === b.phase && a.round === b.round
    && (a.question?.id ?? null) === (b.question?.id ?? null)
    && (a.targetTeam ?? null) === (b.targetTeam ?? null)
    && (a.passCount || 0) === (b.passCount || 0)
    && (a.revision || 0) === (b.revision || 0)
    && (a.selectionRequestId ?? null) === (b.selectionRequestId ?? null));
}

async function advance(id, expected, skipShowdown = false, transitionKey = null, skipUnanswered = false) {
  const explicitSkip = skipUnanswered && expected.state.phase === "question" && !expected.state.answer;
  if (expected.status !== "playing" || (!explicitSkip && !["revealed", "showdown_revealed"].includes(expected.state.phase))) {
    fail("failed-precondition", "ثبّت نتيجة السؤال قبل الانتقال");
  }
  // Showdown publication has its own reservation path; ordinary progression below
  // commits from current scores, never from a stale pre-transaction scoreboard.
  if (!skipShowdown && expected.state.phase !== "showdown_revealed" && showdownDue(expected)) return startShowdown(id, expected, transitionKey, skipUnanswered);
  let response;
  const result = await db.ref(`matches/${id}`).transaction((match) => {
    response = undefined;
    if (!match) return match;
    if (transitionKey && match.state?.hostTransition?.key === transitionKey) {
      response = match.state.hostTransition.result;
      return match;
    }
    if (!sameTurnContext(match, expected) || match.status !== "playing") return;
    const apply = (updates, reply) => {
      for (const [path, value] of Object.entries(updates)) {
        const keys = path.split("/");
        const last = keys.pop();
        const parent = keys.reduce((node, key) => node[key] ||= {}, match);
        if (value === null) delete parent[last]; else parent[last] = value;
      }
      if (transitionKey) match.state.hostTransition = { key: transitionKey, result: reply };
      match.state.revision = (match.state.revision || 0) + 1;
      response = reply;
      return match;
    };
    const state = match.state;
  if (state.round < match.totalRounds) {
    let nextTeam;
    const updates = { turnIndex: match.turnIndex + 1, "state/phase": "choose", "state/question": null, "state/answer": null, "state/isCorrect": null, "state/showdown": null, "state/viewUntil": null, "state/questionStartedAt": null, "state/questionDuration": null, "state/selectionRequestId": null, "state/attemptedTeams": null, "state/answerClaimId": null, "state/cardClaimId": null, "state/assistUsed": false, "state/questionValue": null, "state/pointMultiplier": 1, "state/extraTimeUsed": false, "state/stealFullValue": false, "state/forcedPlayerId": null, "state/forcedPlayerName": null, "state/cardsFrozenTeam": null, "state/cardUsedThisTurn": false };
    if (match.tieBreaker?.active) {
      const cursor = match.tieBreaker.cursor + 1;
      nextTeam = match.tieBreaker.teams[cursor % match.tieBreaker.teams.length];
      updates["tieBreaker/cursor"] = cursor;
    } else nextTeam = match.teamOrder[(match.turnIndex + 1) % match.teamOrder.length];
    updates["state/targetTeam"] = nextTeam;
    updates["state/punishment"] = null;
    updates["state/rotationReused"] = null;
    return apply(updates, { ended: false });
  }
  const candidates = match.tieBreaker?.active ? match.tieBreaker.teams : match.teamOrder;
  const high = Math.max(...candidates.map((team) => match.teams[team].score));
  const tied = candidates.filter((team) => match.teams[team].score === high);
  if (tied.length > 1) {
    const cycle = (match.tieBreaker?.cycle || 0) + 1;
    // A deciding cycle grants one extra pick per tied team, not a normal-game
    // section cap. Preserve scoring counts and never reuse consumed questions.
    const typeCaps = Object.fromEntries(match.enabledTypes.map((type) => [type, Math.max(typeCap(match, type), ...tied.map((team) => Number(match.typeCounts?.[team]?.[type]) || 0)) + 1]));
    const sectionCycleByTeam = { ...(match.sectionCycleByTeam || {}) };
    for (const team of tied) sectionCycleByTeam[team] = { used: [], number: (sectionCycle(match, team).number || 1) + 1 };
    return apply({ typeCaps, sectionCycleByTeam, totalRounds: state.round + tied.length, turnIndex: match.turnIndex + 1, tieBreaker: { active: true, teams: tied, cursor: 0, cycle }, "state/phase": "choose", "state/question": null, "state/answer": null, "state/isCorrect": null, "state/targetTeam": tied[0], "state/viewUntil": null, "state/questionStartedAt": null, "state/questionDuration": null, "state/selectionRequestId": null, "state/attemptedTeams": null, "state/answerClaimId": null, "state/cardClaimId": null, "state/assistUsed": false, "state/questionValue": null, "state/pointMultiplier": 1, "state/extraTimeUsed": false, "state/stealFullValue": false, "state/forcedPlayerId": null, "state/forcedPlayerName": null, "state/cardsFrozenTeam": null, "state/cardUsedThisTurn": false }, { ended: false, tieBreaker: true });
  }
  const endedAt = now();
  return apply({ status: "ended", endedAt, expiresAt: endedAt + ENDED_TTL_MS, "state/phase": "ended", turnIndex: match.turnIndex + 1 }, { ended: true });
  }, undefined, false);
  if (!result.committed || !response) fail("failed-precondition", "تغيّر الدور؛ حدّث الشاشة قبل الانتقال");
  return response;
}

async function playPowerCard(uid, data, id, initialMatch, access) {
  if (initialMatch.state.question?.type === "punishment") return { accepted: false, reason: "timing" };
  const teamCode = code(data.teamCode);
  const card = text(data.card, 30);
  if (!POWER_CARD_BASE_COST[card]) return { accepted: false, reason: "unknown" };
  if (!canPlayFor(initialMatch, uid, teamCode)) fail("permission-denied", "هذا الكرت ليس لفريقك");
  const contextKey = hostTransitionKey(data);
  const cardKey = contextKey && createHash("sha256").update(JSON.stringify([contextKey, uid, teamCode, card, data.targetPlayerId || null])).digest("hex");
  if (cardKey && initialMatch.state.cardReceipt?.key === cardKey) return { accepted: true };
  if (!cardKey || !hostTransitionMatches(initialMatch.state, data.transition)) return { accepted: false, reason: "stale" };

  const claimId = randomUUID();
  const matchRef = db.ref(`matches/${id}`);
  const acquired = await matchRef.transaction((current) => {
    if (!current) return current;
    const state = current.state;
    if (state.cardReceipt?.key === cardKey) return current;
    if (current.status !== "playing" || !hostTransitionMatches(state, data.transition)
      || !canPlayFor(attachAccess(current, access), uid, teamCode)
      || (state.cardLease && state.cardLease.expiresAt > now())
      || (state.cardClaimId && !state.cardLease)) return;
    state.cardClaimId = claimId;
    state.cardLease = { owner: claimId, expiresAt: now() + 30000 };
    return current;
  }, undefined, false);
  if (acquired.snapshot.val()?.state?.cardReceipt?.key === cardKey) return { accepted: true };
  if (!acquired.committed || acquired.snapshot.val()?.state?.cardLease?.owner !== claimId) return { accepted: false, reason: "busy" };
  let reservation = null;

  try {
    const match = attachAccess((await matchRef.get()).val(), access);
    const state = match?.state;
    const team = match?.teams?.[teamCode];
    if (!state || !team || !canPlayFor(match, uid, teamCode)) return { accepted: false, reason: "team" };
    if (state.cardReceipt?.key === cardKey) return { accepted: true };
    if (!hostTransitionMatches(state, data.transition)) return { accepted: false, reason: "stale" };
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
      "state/cardLease": null,
    };

    if (card === "doublePoints") {
      if (state.phase !== "choose" || targetTeam !== teamCode || state.question) return { accepted: false, reason: "timing" };
      updates["state/pointMultiplier"] = 2;
    } else if (card === "extraTime") {
      if (state.phase !== "question" || targetTeam !== teamCode || state.answer || state.extraTimeUsed) return { accepted: false, reason: "timing" };
      if (state.question?.type === "acting" || !(state.questionDuration || match.timer)) return { accepted: false, reason: "timer" };
      const startsAt = Number(state.questionStartedAt);
      const duration = Number(state.questionDuration || match.timer);
      if (!Number.isFinite(startsAt) || !state.questionStartedAt || now() >= startsAt + duration * 1000) return { accepted: false, reason: "expired" };
      updates["state/extraTimeUsed"] = true;
    } else if (card === "freeze") {
      if (state.phase !== "choose" || !targetTeam || targetTeam === teamCode || state.question) return { accepted: false, reason: "timing" };
      updates["state/cardsFrozenTeam"] = targetTeam;
      event.targetTeam = targetTeam;
    } else if (card === "pickPlayer") {
      if (state.phase !== "question" || !targetTeam || targetTeam === teamCode || state.answer || match.answerMode === "host") return { accepted: false, reason: "timing" };
      if (state.question?.type === "acting" || (usesVerbalChoices(state.question?.type) && !state.assistUsed)) return { accepted: false, reason: "verbal" };
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
      const candidates = await questionBank();
      const usedIds = new Set(state.usedIds || []);
      const usedAssets = new Set(state.usedAssets || []);
      const teamUsedIds = new Set(match.usedIdsByTeam?.[teamCode] || []);
      const teamPool = candidates.filter((question) => question.type === state.question.type && !question.disabled && !teamUsedIds.has(question.id));
      if (!teamPool.length) return { accepted: false, reason: "empty" };
      const pool = teamPool.filter((question) => !usedIds.has(question.id) && !usedAssets.has(questionAssetKey(question)));
      if (!pool.length) return { accepted: false, reason: "empty" };
      let rotated;
      try { rotated = await rotateQuestion(pool, rotationGameId(id, match), match.hostUid || uid, candidates, `swap:${teamCode}:${state.question.id}:${state.round}`, false, id); }
      catch (error) {
        if (error.code === "unavailable") return { accepted: false, reason: "busy" };
        if (error.code === "resource-exhausted") return { accepted: false, reason: "empty" };
        throw error;
      }
      reservation = rotated.reservation;
      const question = rotated.question;
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
      const secretVersion = reservation.key;
      await db.ref(`matchSecrets/${id}/versions/${secretVersion}`).set(questionSecret(question));
      updates["state/secretVersion"] = secretVersion;
      updates["state/rotationReused"] = rotated.reused;
      updates[`usedIdsByTeam/${teamCode}`] = [...teamUsedIds, question.id];
      // Apply through the same context/balance/claim transaction as other cards.
      // Durable room receipt and effect publish together; ledger finalizes below.
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
    const result = await matchRef.transaction((current) => {
      if (!current) return current;
      const latest = attachAccess(current, access), s = current.state, currentTeam = current.teams?.[teamCode];
      if (s.cardReceipt?.key === cardKey && canPlayFor(latest, uid, teamCode)) return current;
      if (current.status !== "playing" || !sameTurnContext(current, match)
        || !rotationPublicationAllowed(current, reservation)
        || s.cardLease?.owner !== claimId || s.cardLease.expiresAt <= now()
        || !canPlayFor(latest, uid, teamCode) || s.cardClaimId !== claimId || s.cardUsedThisTurn
        || s.cardsFrozenTeam === teamCode || !currentTeam || currentTeam.powerCards?.[card] === false
        || (Number(currentTeam.cardBalance) || 0) !== balance) return;
      if (card === "swapQuestion" && (s.phase !== "question" || s.answer || s.targetTeam !== teamCode || !s.question)) return;
      if (card === "extraTime" && (s.answer || now() >= Number(s.questionStartedAt) + Number(s.questionDuration || current.timer) * 1000)) return;
      if (card === "pickPlayer" && (current.answerMode === "host" || current.players?.[event.targetPlayerId]?.teamCode !== s.targetTeam
        || Object.values(current.players || {}).filter((player) => player.teamCode === s.targetTeam).length < 2)) return;
      for (const [path, value] of Object.entries(updates)) {
        const keys = path.split("/");
        const last = keys.pop();
        const parent = keys.reduce((node, key) => node[key] ||= {}, current);
        if (value === null) delete parent[last]; else parent[last] = value;
      }
      s.revision = (s.revision || 0) + 1;
      s.cardReceipt = { key: cardKey };
      recordRotationPublication(current, reservation);
      return current;
    }, undefined, false);
    return result.committed && result.snapshot.val()?.state?.cardReceipt?.key === cardKey
      ? { accepted: true } : { accepted: false, reason: "stale" };
  } finally {
    await matchRef.transaction((current) => {
      if (!current) return current;
      if (current.state?.cardLease?.owner !== claimId) return;
      delete current.state.cardLease;
      if (current.state.cardClaimId === claimId) delete current.state.cardClaimId;
      return current;
    }, undefined, false);
    if (reservation) await settleRotationReservations(initialMatch.hostUid || uid);
  }
}

exports.gameAction = onCall({ region: "asia-southeast1", enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true" }, async (request) => {
  // Capture server arrival before rate-limit/database latency, never client time.
  const receivedAt = now();
  const uid = request.auth?.uid;
  if (!uid) fail("unauthenticated", "سجّل الدخول أولاً");
  const data = request.data || {};
  const action = text(data.action, 40);
  await enforceRequestLimit(action, request, uid);
  if (["getAdminQuestions", "setAdminQuestionAvailability", "deleteAdminQuestions"].includes(action)) {
    if (request.auth?.token?.admin !== true) fail("permission-denied", "إدارة الأسئلة للمدير فقط");
    return adminQuestions(action, data);
  }
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
  if (action === "getGameCapabilities") return { pictureGuess: true, pictureGuessManual: true };
  if (action === "answerChallenge") return answerChallenge(uid, data);
  if (action === "createMatch") return createMatch(uid, data.options || {});
  if (action === "joinTeam") return joinTeam(uid, data);
  if (action === "chooseType") return chooseType(uid, data);
  if (action === "submitAnswer") return submitAnswer(uid, data);
  if (action === "submitHostAnswer") return submitHostAnswer(uid, data);
  if (action === "submitShowdownAnswer") return submitShowdownAnswer(uid, data, receivedAt);
  if (action === "finishShowdown") return finishShowdown(uid, data);
  if (action === "syncAdminAccess") {
    const token = request.auth.token || {};
    const owner = token.email === "fhd.alqahtani@gmail.com" && token.email_verified === true && token.firebase?.sign_in_provider === "google.com";
    if (!owner && token.admin !== true) fail("permission-denied", "هذا الحساب لا يملك صلاحية الإدارة");
    if (owner && token.admin !== true) {
      const account = await getAuth().getUser(uid);
      await getAuth().setCustomUserClaims(uid, { ...(account.customClaims || {}), admin: true });
    }
    return { admin: true };
  }
  if (action === "getMatch") {
    const snapshot = await db.ref(`matches/${requireRoomCode(data.matchCode)}`).get();
    if (!snapshot.exists()) fail("not-found", "الميدان غير موجود");
    return { match: publicMatch(snapshot.val()) };
  }

  if (action === "resolveTeamCode") {
    const shortCode = code(data.shortCode);
    if (!/^[A-Z][0-9]{3}$/.test(shortCode)) fail("invalid-argument", "كود الفريق حرف وثلاثة أرقام");
    const invite = (await db.ref(`teamJoinCodes/${shortCode}`).get()).val();
    if (!invite || invite.expiresAt <= now()) fail("not-found", "كود الفريق غير صحيح أو انتهت صلاحيته");
    const { match, access } = await loadMatch(invite.matchCode);
    if (match.status === "ended" || match.expiresAt <= now() || access.teamKeys?.[invite.teamCode] !== invite.inviteKey) {
      fail("not-found", "كود الفريق غير صحيح أو انتهت صلاحيته");
    }
    return { matchCode: invite.matchCode, teamCode: invite.teamCode, inviteKey: invite.inviteKey };
  }
  const { id, match, access } = await loadMatch(data.matchCode);
  if (action === "getPictureGuessView") return pictureGuessView(uid, data, id, match);
  if (action === "judgePictureGuess") return judgePictureGuess(uid, data, id, match);
  if (action === "startPictureGuessTimer") return startPictureGuessTimer(uid, data, id, match);
  if (action === "adjustTeamScore") return adjustTeamScore(uid, data, id, match);
  if (["preparePunishment", "judgePunishment", "requestPunishmentOutcome", "resolvePunishment", "cancelPunishment"].includes(action)) return punishmentAction(uid, data, id, match);
  if (action === "getTeamInvites") {
    const isHost = match.hostUid === uid;
    const isViewer = access.viewerKey && safeEqual(data.viewerKey, access.viewerKey);
    // Knowing the public audience code grants viewing, not team membership.
    // The host's keyed TV link can still display issued invitations in the lobby.
    if (!isHost && !isViewer) fail("permission-denied", "روابط الفرق للمقدم وشاشة العرض المصرح بها فقط");
    return {
      teamKeys: access.teamKeys || {},
      shortTeamCodes: await shortTeamCodes(id, access),
      ...(isHost ? { viewerKey: access.viewerKey || null } : {}),
    };
  }
  if (action === "getHostAnswer") {
    requireHost(match, uid);
    const secret = await readQuestionSecret(id, match.state);
    const valid = secret?.questionId === match.state.question?.id;
    return {
      questionId: valid ? secret.questionId : null,
      answer: valid ? secret.answer ?? null : null,
      answerText: valid ? secret.answerText || (Array.isArray(secret.options) ? secret.options[secret.answer] ?? null : null) : null,
      brandInfo: valid ? secret.brandInfo || null : null,
    };
  }
  if (action === "revealQuestionPrompt") {
    const state = match.state;
    if (state.phase !== "question" || !state.question?.promptHidden || !state.viewUntil || now() < state.viewUntil) {
      return { accepted: false };
    }
    const secret = await readQuestionSecret(id, match.state);
    if (!secret || secret.questionId !== state.question.id || !Array.isArray(secret.options)) return { accepted: false };
    // A public TV may trigger this deterministic reveal, but never before its
    // server time or for a replaced/answered question. No membership is granted.
    const result = await db.ref(`matches/${id}`).transaction((current) => {
      if (!current) return current;
      const latest = current.state;
      if (current.status !== "playing" || latest?.phase !== "question" || latest.answer || latest.question?.id !== secret.questionId || !latest.question.promptHidden || !latest.viewUntil || now() < latest.viewUntil || (latest.revision || 0) !== (state.revision || 0)) return;
      latest.question.question = text(secret.question, 500);
      latest.question.options = secret.options.map((option) => text(option, 300));
      delete latest.question.promptHidden;
      latest.revision = (latest.revision || 0) + 1;
      return current;
    }, undefined, false);
    return { accepted: result.committed && Boolean(result.snapshot.val()?.state?.question && !result.snapshot.val().state.question.promptHidden) };
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
    if (!latestState || latestState.phase !== "question" || !usesVerbalChoices(latestState.question?.type) || latestState.assistUsed || latestState.targetTeam !== teamCode) return { accepted: false };
    const secret = await readQuestionSecret(id, match.state);
    if (!secret || secret.questionId !== latestState.question.id || !Array.isArray(secret.options)) return { accepted: false };
    const result = await db.ref(`matches/${id}`).transaction((current) => {
      if (!current) return current;
      const latest = attachAccess(current, access);
      const state = current.state;
      if (!canPlayFor(latest, uid, teamCode) || current.status !== "playing" || state?.phase !== "question" || state.answer || state.targetTeam !== teamCode || state.question?.id !== secret.questionId || !usesVerbalChoices(state.question?.type) || state.assistUsed || (state.revision || 0) !== (latestState.revision || 0)) return;
      state.assistUsed = true;
      state.question.options = secret.options.map((option) => text(option, 300));
      delete state.question.optionsHidden;
      state.revision = (state.revision || 0) + 1;
      return current;
    }, undefined, false);
    return { accepted: result.committed && Boolean(result.snapshot.val()?.state?.assistUsed) };
  }
  if (action === "usePowerCard") {
    return playPowerCard(uid, data, id, match, access);
  }

  if (match.state.question?.type === "punishment" && ["judgeVerbal", "revealAnswer", "passToNextTeam"].includes(action)) {
    fail("failed-precondition", "استخدم أزرار سؤال وعقاب لتثبيت نتيجته");
  }

  requireHost(match, uid);
  let transitionKey = null;
  if (["passToNextTeam", "advanceTurn", "judgeVerbal", "revealAnswer", "recheckSelectionCapacity"].includes(action)) {
    transitionKey = hostTransitionKey(data);
    if (transitionKey && match.state.hostTransition?.key === transitionKey) return match.state.hostTransition.result;
    if (!transitionKey || !hostTransitionMatches(match.state, data.transition)) fail("failed-precondition", "تغيّر السؤال أو الدور؛ حدّث الشاشة وأعد المحاولة");
  }
  if (action === "recheckSelectionCapacity") return recheckSelectionCapacity(id, match, transitionKey);
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
    const bank = await questionBank();
    const active = bank.filter((question) => !question.disabled && match.enabledTypes.includes(question.type));
    await settleRotationReservations(uid);
    const available = active.length ? await rotateQuestion(active, rotationGameId(id, match), uid, bank, null, true) : [];
    const perTeam = match.questionsPerTeam || Math.ceil(match.totalRounds / match.teamOrder.length);
    const caps = fairTypeCaps(match.enabledTypes, match.teamOrder.length, perTeam, available);
    const fullCycles = Math.floor(perTeam / match.enabledTypes.length);
    if (match.enabledTypes.some((type) => caps[type] < fullCycles) || Object.values(caps).reduce((sum, cap) => sum + cap, 0) < perTeam) {
      fail("failed-precondition", "تغيّر مخزون الأقسام منذ إنشاء الغرفة؛ قلّل عدد الأسئلة في مسابقة جديدة أو أضف أقسامًا أخرى، ولن نكرّر أسئلة حديثة");
    }
    const startedAt = now();
    const result = await db.ref(`matches/${id}`).transaction((current) => {
      if (!current) return current;
      if (current.status !== "lobby" || !current.teams?.[first]
        || JSON.stringify(current.enabledTypes) !== JSON.stringify(match.enabledTypes)
        || current.questionsPerTeam !== match.questionsPerTeam || current.totalRounds !== match.totalRounds) return;
      if (current.answerMode === "representative" && current.teamOrder.some((teamCode) => {
        const captain = current.teams[teamCode]?.captainId;
        return !captain || current.players?.[captain]?.teamCode !== teamCode;
      })) return;
      current.status = "playing";
      current.startedAt = startedAt;
      current.expiresAt = startedAt + ACTIVE_TTL_MS;
      current.typeCaps = caps;
      current.state.phase = "choose";
      current.state.targetTeam = first;
      current.state.revision = (current.state.revision || 0) + 1;
      return current;
    }, undefined, false);
    if (!result.committed || result.snapshot.val()?.status !== "playing") fail("failed-precondition", "تغيّرت الغرفة أو ممثلو الفرق؛ حدّث الشاشة قبل البدء");
    await safelyRecordUsage(() => recordMatchUsage("matchesStarted", id));
  } else if (action === "startQuestionTimer") {
    if (match.state.phase !== "question" || match.state.question?.type !== "acting" || match.state.questionStartedAt) {
      fail("failed-precondition", "لا يوجد مؤقت تمثيل بانتظار البدء");
    }
    await db.ref(`matches/${id}/state`).update({ questionStartedAt: now(), questionDuration: 120 });
  } else if (action === "revealAnswer") {
    if (!match.state.answer) fail("failed-precondition", "لا توجد إجابة");
    return reveal(id, match, undefined, transitionKey);
  } else if (action === "judgeVerbal") {
    return reveal(id, match, Boolean(data.correct), transitionKey);
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
    const result = await db.ref(`matches/${id}`).transaction((latest) => {
      if (!latest) return latest; // Let an initial cold null cache reconcile.
      const state = latest.state;
      if (transitionKey && state?.hostTransition?.key === transitionKey) return latest;
      if (latest.status !== "playing" || !sameTurnContext(latest, match) || state?.phase !== "revealed" || state.isCorrect !== false) return;
      state.phase = "question";
      state.targetTeam = next;
      state.passCount = (state.passCount || 0) + 1;
      state.attemptedTeams = attemptedTeams;
      state.question = reprotectQuestionForAttempt(state.question);
      state.answer = null;
      state.isCorrect = null;
      state.questionStartedAt = isActing ? null : (until || now());
      state.questionDuration = isActing ? 120 : latest.timer;
      state.viewUntil = until;
      state.assistUsed = false;
      state.pointMultiplier = 1;
      state.extraTimeUsed = false;
      state.stealFullValue = false;
      state.forcedPlayerId = null;
      state.forcedPlayerName = null;
      state.cardClaimId = null;
      state.hostTransition = { key: transitionKey, result: { ok: true } };
      state.revision = (state.revision || 0) + 1;
      return latest;
    }, undefined, false);
    if (!result.committed || result.snapshot.val()?.state?.targetTeam !== next) fail("failed-precondition", "تغيّر السؤال؛ حدّث الشاشة قبل نقله");
  } else if (action === "advanceTurn") {
    if (match.state.phase === "showdown" && match.state.showdown?.kind === "picture_guess") fail("failed-precondition", "انتظر انتهاء تحدي الصور أو ثبّت الفائز");
    if (match.state.punishment && match.state.punishment.stage !== "resolved") fail("failed-precondition", "ثبّت نتيجة سؤال وعقاب أولاً");
    return advance(id, match, false, transitionKey, data.skipUnanswered === true);
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
