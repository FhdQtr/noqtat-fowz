import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const realRequire = createRequire(new URL('../functions/index.js', import.meta.url));
const clone = (value) => JSON.parse(JSON.stringify(value));

test('sixty reviewed bank additions have verified answer mappings, unique image assets and valid orderings', () => {
  const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
  const review = JSON.parse(readFileSync(new URL('../src/data/bankSources-20261006.json', import.meta.url), 'utf8'));
  const credits = JSON.parse(readFileSync(new URL('../public/img/landmarks-v3/SOURCES.json', import.meta.url), 'utf8'));
  assert.equal(review.entries.length, 60);
  for (const type of ['completion', 'image', 'ordering']) {
    assert.equal(review.entries.filter((entry) => entry.type === type).length, 20);
  }
  const images = new Set();
  for (const entry of review.entries) {
    const q = bank.find((question) => question.id === entry.id);
    assert.ok(q, `missing addition ${entry.id}`);
    assert.equal(q.type, entry.type);
    assert.equal('level' in q, false);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.equal(q.options[q.answer], entry.correctAnswer);
    if (q.type === 'completion') {
      assert.ok(entry.sourceUrls.length && entry.verifiedText);
    } else if (q.type === 'image') {
      assert.ok(!images.has(q.image));
      assert.equal(bank.filter((question) => question.image === q.image).length, 1);
      images.add(q.image);
      const bytes = readFileSync(new URL(`../public${q.image}`, import.meta.url));
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
      const credit = credits.find((item) => item.image === q.image);
      assert.ok(credit?.source && credit.author && credit.license);
      assert.ok(entry.sourceUrls.length >= 2);
    } else {
      const pairs = Object.entries(entry.referenceValues).sort((a, b) => a[1] - b[1]);
      if (entry.direction === 'descending') pairs.reverse();
      assert.equal(q.options[q.answer], pairs.map(([label]) => label).join(' ثم '));
      for (const option of q.options) {
        assert.deepEqual(option.split(' ثم ').sort(), pairs.map(([label]) => label).sort());
      }
    }
  }
  assert.equal(images.size, 20);
});

test('reviewed October riddles have four unique choices, correct answer indexes and matching stats', async () => {
  const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
  const ids = [400160, 400161, 400162, 400163, 824, 400164, 400165, 1000, 400166, 400167, 851, 400168, 848, 400169, 400170, 834, 400171, 400172, 400173, 400174];
  const correct = ['نجم', 'لا شيء', '9', 'الحرف', 'الإبرة', 'ملك الشطرنج', 'بحر الشعر', 'الحذاء', 'الرماد', 'شجرة العائلة', 'أنت', 'الفلفل الحار', 'الشاي', 'حرف الراء', '(1, 2, 3)', 'الجوع', 'أرجل الطاولة', 'العمر', 'العقل', 'القلم'];
  ids.forEach((id, i) => {
    const question = bank.find((q) => q.id === id);
    assert.ok(question, `missing reviewed riddle ${id}`);
    assert.equal(question.type, 'riddle');
    assert.equal(question.category, 'riddles');
    assert.equal(Boolean(question.disabled), false);
    assert.equal('level' in question, false);
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.equal(question.options[question.answer], correct[i]);
  });
  assert.equal(1 + 2 + 3, 1 * 2 * 3);
  assert.equal(2 + 6 + 1, 9);
  assert.equal('نجم'.padStart(4, 'م'), 'منجم');
  assert.equal('الحرف'.slice(2), 'حرف');
  assert.equal('باريس'[2], 'ر');
  assert.equal('عقل'.slice(1), 'قل');
  const stats = await import('../src/data/questionStats.ts');
  assert.equal(stats.BUILTIN_QUESTION_STATS.riddle, bank.filter((q) => q.type === 'riddle' && !q.disabled).length);
});

function fixture() {
  return {
    matches: { A234: {
      status: 'playing', answerMode: 'anyone', totalRounds: 16, turnIndex: 5, showdownCount: 1,
      teamOrder: ['A234-1', 'A234-2'],
      teams: { 'A234-1': { score: 100 }, 'A234-2': { score: 150 } },
      players: {
        p1: { id: 'p1', teamCode: 'A234-1', name: 'الأول' },
        p2: { id: 'p2', teamCode: 'A234-2', name: 'الثاني' },
      },
      state: { phase: 'showdown', round: 6,
        question: { id: 42, options: ['أ', 'ب', 'ج', 'د'], answer: -1 },
        showdown: { number: 1, opensAt: 1000, closesAt: 21000, points: 200 },
      },
    } },
    matchAccess: { A234: { hostUid: 'host', playerUids: { p1: 'user1', p2: 'user2' } } },
    matchSecrets: { A234: { questionId: 42, answer: 3 } },
  };
}

// Model RTDB's documented initial null cache and compare-and-retry behavior.
// No Firebase project or production data is contacted by these tests.
function harness(firebaseEmptyNodes = false, fixedMatchCode = false) {
  const data = fixture();
  let clock = 2000;
  let version = 0;
  let beforeTransaction;
  let afterRead;
  const read = (path) => path.split('/').filter(Boolean).reduce((node, key) => node?.[key], data) ?? null;
  const write = (path, value) => {
    const keys = path.split('/').filter(Boolean);
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key] ??= {}, data);
    const prune = (v) => {
      if (v === null || typeof v !== 'object') return v;
      const entries = Object.entries(v).map(([k, x]) => [k, prune(x)]).filter(([, x]) => x !== null);
      if (!entries.length) return null;
      return Array.isArray(v) ? entries.map(([, x]) => x) : Object.fromEntries(entries);
    };
    value = firebaseEmptyNodes ? prune(value) : value;
    if (value === null) delete parent[last]; else parent[last] = clone(value);
    version += 1;
  };
  const snapshot = (value) => ({ val: () => clone(value), exists: () => value !== null });
  const ref = (path = '') => ({
    child: (key) => ref(`${path}/${key}`),
    get: async () => { const snap = snapshot(read(path)); afterRead?.(); return snap; },
    set: async (value) => write(path, value),
    remove: async () => write(path, null),
    update: async (values) => { for (const [key, value] of Object.entries(values)) write(`${path}/${key}`, value); },
    transaction: async (update) => {
      if (path.startsWith('matches/')) beforeTransaction?.();
      // undefined aborts immediately, even if a non-null record exists remotely.
      if (update(null) === undefined) return { committed: false, snapshot: snapshot(null) };
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const startVersion = version;
        const proposed = update(clone(read(path)));
        if (proposed === undefined) return { committed: false, snapshot: snapshot(read(path)) };
        await Promise.resolve();
        if (version !== startVersion) continue;
        write(path, proposed);
        return { committed: true, snapshot: snapshot(read(path)) };
      }
      throw new Error('transaction retries exhausted');
    },
  });
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const mockedRequire = (name) => {
    if (name === 'node:crypto' && fixedMatchCode) return { ...realRequire(name), randomInt: (...args) => args.length === 1 ? 0 : realRequire(name).randomInt(...args) };
    if (name === 'firebase-functions/v2/https') return { onCall: (_, fn) => fn, HttpsError };
    if (name === 'firebase-functions/v2/scheduler') return { onSchedule: (_, fn) => fn };
    if (name === 'firebase-admin/app') return { initializeApp: () => {} };
    if (name === 'firebase-admin/auth') return { getAuth: () => ({ getUser: async () => ({ customClaims: {} }), setCustomUserClaims: async () => {} }) };
    if (name === 'firebase-admin/database') return { getDatabase: () => ({ ref }), ServerValue: { increment: (amount) => amount } };
    return realRequire(name);
  };
  mockedRequire.resolve = realRequire.resolve;
  const exports = {};
  runInNewContext(source + '\nexports.testHelpers = { rotateQuestion, rotationAssetKey, registerRotationMatch, createMatch, sectionCycle, nextSectionCycle, powerCardCost, questionBank, rotateFlagQuestion, fairTypeCaps };', { require: mockedRequire, exports, Buffer, process: { env: {} },
    Date: class extends Date { static now() { return clock; } }, console });
  const call = (action, uid = 'host', extra = {}) => exports.gameAction({ auth: { uid }, rawRequest: { ip: '192.0.2.1' }, data: { action, matchCode: 'A234', ...extra } });
  return { data, call, helpers: exports.testHelpers,
    adminCall: (action, extra = {}, admin = true) => exports.gameAction({ auth: { uid: 'owner', token: { admin } }, rawRequest: { ip: '192.0.2.2' }, data: { action, ...extra } }),
    authCall: (token) => exports.gameAction({ auth: { uid: 'owner', token }, rawRequest: { ip: '192.0.2.2' }, data: { action: 'syncAdminAccess' } }),
    match: () => data.matches.A234,
    setClock: (value) => { clock = value; },
    beforeTransaction: (fn) => { beforeTransaction = fn; },
    afterRead: (fn) => { afterRead = fn; },
    answer: (n, choice = 3) => call('submitShowdownAnswer', `user${n}`, { playerId: `p${n}`, questionId: 42, choice }),
  };
}

test('first answer persists despite an empty transaction cache', async () => {
  const h = harness();
  assert.equal((await h.answer(1)).status, 'accepted');
  assert.equal(h.match().state.showdown.answers['A234-1'].choice, 3);
});

test('timeout with no answers reveals result and allows return to competition', async () => {
  const h = harness(); h.setClock(22000);
  assert.equal((await h.call('finishShowdown')).finished, true);
  assert.equal(h.match().state.phase, 'showdown_revealed');
  assert.equal(h.match().state.question.answer, 3);
  assert.equal(h.match().teams['A234-1'].score, 100);
  await h.call('advanceTurn');
  assert.equal(h.match().state.phase, 'choose');
  assert.equal(h.match().state.targetTeam, 'A234-1');
});

test('two correct answers award only the earlier correct team, exactly once', async () => {
  const h = harness();
  await h.answer(2); h.setClock(3000); await h.answer(1);
  assert.equal(h.match().state.showdown.winnerTeam, 'A234-2');
  assert.equal(h.match().teams['A234-2'].score, 350);
  assert.equal(h.match().teams['A234-1'].score, 100);
  h.setClock(22000);
  await Promise.all([h.call('finishShowdown'), h.call('finishShowdown', 'user1')]);
  assert.equal(h.match().teams['A234-2'].score, 350);
});

test('a wrong first answer cannot beat a later correct answer', async () => {
  const h = harness();
  await h.answer(1, 0); h.setClock(3000); await h.answer(2, 3);
  assert.equal(h.match().state.showdown.winnerTeam, 'A234-2');
});

test('two wrong answers finish without awarding points', async () => {
  const h = harness(); await h.answer(1, 0); await h.answer(2, 1);
  assert.equal(h.match().state.phase, 'showdown_revealed');
  assert.equal(h.match().state.showdown.winnerTeam, null);
  assert.equal(h.match().teams['A234-2'].score, 150);
});

test('one correct answer wins on timeout, even with simultaneous finalizers', async () => {
  const h = harness(); await h.answer(1); h.setClock(22000);
  await Promise.all([h.call('finishShowdown'), h.call('finishShowdown', 'user1'), h.call('finishShowdown', 'user2')]);
  assert.equal(h.match().state.showdown.winnerTeam, 'A234-1');
  assert.equal(h.match().teams['A234-1'].score, 300);
});

test('duplicate concurrent team submissions do not overwrite its first answer', async () => {
  const h = harness();
  const results = await Promise.all([h.answer(1, 0), h.answer(1, 3)]);
  assert.equal(results.filter((r) => r.status === 'accepted').length, 1);
  assert.equal(h.match().state.showdown.answers['A234-1'].choice, 0);
});

test('outsiders cannot finalize the showdown', async () => {
  const h = harness(); h.setClock(22000);
  await assert.rejects(h.call('finishShowdown', 'outsider'), { code: 'permission-denied' });
});

test('server read latency does not turn an in-time answer into a late one', async () => {
  const h = harness(); h.setClock(20900);
  h.afterRead(() => h.setClock(22000));
  assert.equal((await h.answer(1)).status, 'accepted');
  assert.equal(h.match().state.showdown.answers['A234-1'].at, 20900);
});

test('an answer outside the window is not saved', async () => {
  const h = harness(); h.setClock(500);
  assert.equal((await h.answer(1)).status, 'early');
  h.setClock(22000);
  assert.equal((await h.answer(1)).status, 'late');
  assert.equal(h.match().state.showdown.answers, undefined);
});

test('a stale screen cannot answer a different showdown question', async () => {
  const h = harness();
  const result = await h.call('submitShowdownAnswer', 'user1', { playerId: 'p1', questionId: 99, choice: 3 });
  assert.equal(result.status, 'stale');
  assert.equal(h.match().state.showdown.answers, undefined);
});

test('an old result request cannot reveal or award a newer question', async () => {
  const h = harness(); h.setClock(22000);
  h.beforeTransaction(() => {
    h.match().state.question.id = 99;
    h.match().state.showdown.number = 2;
  });
  assert.equal((await h.call('finishShowdown')).finished, false);
  assert.equal(h.match().state.phase, 'showdown');
  assert.equal(h.match().state.question.answer, -1);
});

test('a missing answer secret reports an error instead of waiting forever', async () => {
  const h = harness(); h.setClock(22000); delete h.data.matchSecrets.A234;
  await assert.rejects(h.call('finishShowdown'), { code: 'failed-precondition' });
});

test('three phones can each replay the solo challenge twelve times on shared Wi-Fi', async () => {
  const h = harness();
  for (let round = 0; round < 12; round += 1) {
    h.setClock(2000 + round * 30000);
    for (let phone = 1; phone <= 3; phone += 1) {
      const session = await h.call('startChallenge', `phone${phone}`);
      assert.equal(session.questions.length, 100);
      assert.ok(session.questions.every((q) => q.answer === -1));
    }
  }
});

test('solo rapid-request limit still blocks flooding and expires after a minute', async () => {
  const h = harness();
  for (let i = 0; i < 10; i += 1) await h.call('startChallenge', 'phone');
  await assert.rejects(h.call('startChallenge', 'phone'), { code: 'resource-exhausted' });
  h.setClock(62001);
  assert.equal((await h.call('startChallenge', 'phone')).questions.length, 100);
});

for (const type of ['multiple_choice', 'flag', 'memory']) {
  test(`three-team ${type}: two passes, three wrong answers, then next question`, async () => {
    const h = harness(true);
    const match = h.match();
    match.teamOrder.push('A234-3');
    match.teams['A234-3'] = { score: 200 };
    Object.values(match.teams).forEach((team) => Object.assign(team, { correctCount: 0, wrongCount: 0 }));
    match.timer = 20;
    match.state = { phase: 'question', round: 1, targetTeam: 'A234-1', originalTeam: 'A234-1', passCount: 0,
      question: { id: 42, type, level: 'easy', question: 'اختبار', options: ['أ','ب','ج','د'], answer: -1 } };
    h.data.matchSecrets.A234 = { questionId: 42, answer: 3, question: 'اختبار', options: ['أ','ب','ج','د'] };
    for (let team = 1; team <= 3; team += 1) {
      assert.equal(h.match().state.targetTeam, `A234-${team}`);
      if (type === 'memory' && team > 1) {
        assert.equal(h.match().state.question.options, undefined);
        h.setClock(h.match().state.viewUntil + 100);
        assert.equal((await h.call('revealQuestionPrompt')).accepted, true);
      }
      if (type === 'flag') await h.call('useAssist', 'host', { teamCode: `A234-${team}` });
      await h.call('judgeVerbal', 'host', { correct: false });
      if (team < 3) await h.call('passToNextTeam');
    }
    assert.equal(h.match().state.phase, 'revealed');
    assert.equal(h.match().state.question.answer, 3);
    assert.equal(h.match().state.attemptedTeams.length, 3);
    assert.equal(h.match().state.passCount, 2);
    assert.equal(Object.values(h.match().teams).reduce((sum, t) => sum + t.score, 0), 450);
    await assert.rejects(h.call('passToNextTeam'), { code: 'failed-precondition' });
    await h.call('advanceTurn');
    assert.equal(h.match().state.phase, 'choose');
  });
}

test('audience lobby gets unique short team codes that resolve to the right team', async () => {
  const h = harness();
  h.match().status = 'lobby';
  h.match().expiresAt = 999999;
  h.data.matchAccess.A234.teamKeys = { 'A234-1': 'SECRET11', 'A234-2': 'SECRET22' };
  const invites = await h.call('getTeamInvites', 'audience');
  const codes = Object.values(invites.shortTeamCodes);
  assert.equal(new Set(codes).size, 2);
  for (const value of codes) assert.match(value, /^[A-Z][0-9]{3}$/);
  for (const [teamCode, shortCode] of Object.entries(invites.shortTeamCodes)) {
    const result = await h.call('resolveTeamCode', 'guest', { shortCode });
    assert.equal(result.teamCode, teamCode);
    assert.equal(result.inviteKey, h.data.matchAccess.A234.teamKeys[teamCode]);
  }
  const again = await h.call('getTeamInvites', 'audience');
  assert.deepEqual(again.shortTeamCodes, invites.shortTeamCodes);
  h.match().status = 'ended';
  await assert.rejects(h.call('resolveTeamCode', 'guest', { shortCode: codes[0] }), { code: 'not-found' });
});

test('simple audience code cannot obtain invites after lobby, authorized viewer still can', async () => {
  const h = harness();
  h.data.matchAccess.A234.teamKeys = { 'A234-1': 'SECRET11' };
  h.data.matchAccess.A234.viewerKey = 'VIEWER11';
  await assert.rejects(h.call('getTeamInvites', 'outsider'), { code: 'permission-denied' });
  const invites = await h.call('getTeamInvites', 'viewer', { viewerKey: 'VIEWER11' });
  assert.match(invites.shortTeamCodes['A234-1'], /^[A-Z][0-9]{3}$/);
});

test('concurrent invite loading keeps a stable code for each team', async () => {
  const h = harness();
  h.data.matchAccess.A234.teamKeys = { 'A234-1': 'SECRET11' };
  const [a, b] = await Promise.all([h.call('getTeamInvites'), h.call('getTeamInvites')]);
  assert.equal(a.shortTeamCodes['A234-1'], b.shortTeamCodes['A234-1']);
  assert.equal(Object.keys(h.data.teamJoinCodes).length, 1);
});

test('rotation prevents repeating question assets during fifteen competitions', async () => {
  const h = harness(true);
  const pool = Array.from({ length: 45 }, (_, id) => ({ id, type: 'image', image: `/image-${id}.svg`, question: `flag ${id}`, options: ['a', 'b'], answer: 0 }));
  const recent = [];
  for (let game = 0; game < 35; game++) {
    const draw = await h.helpers.rotateQuestion(pool, `game${game}`, 'host');
    assert.equal(draw.reused, false);
    assert.ok(!recent.slice(-14).includes(draw.question.id));
    recent.push(draw.question.id);
  }
  assert.equal(h.data.questionRotation.host.games.length, 15);
});

test('rotation identifies same image/text despite different question ids and reports bank shortage', async () => {
  const h = harness();
  const a = { id: 1, type: 'acting', question: 'المثل نفسه', options: [], answer: 0 };
  const b = { ...a, id: 2, question: '  المثل   نفسه  ' };
  await h.helpers.rotateQuestion([a], 'one', 'host');
  await assert.rejects(h.helpers.rotateQuestion([b], 'two', 'host'), /15/);
  for (let game = 2; game <= 16; game++) await h.helpers.registerRotationMatch('host', `empty${game}`);
  const next = await h.helpers.rotateQuestion([b], 'empty16', 'host');
  assert.equal(next.question.id, 2);
  assert.equal(h.helpers.rotationAssetKey(a), h.helpers.rotationAssetKey(b));
  assert.equal(h.helpers.rotationAssetKey({ ...a, image: '/same.svg' }), h.helpers.rotationAssetKey({ ...b, image: '/same.svg' }));
});

function punishmentFixture() {
  const h = harness(true);
  h.match().enabledTypes = ['punishment'];
  h.match().questionsPerTeam = 8;
  h.match().turnIndex = 0;
  h.match().state = { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [] };
  return h;
}

async function preparedPunishment(h, mode = 'perform') {
  assert.equal((await h.call('chooseType', 'user1', { type: 'punishment', requestId: 'p-request' })).status, 'accepted');
  const questionId = h.match().state.question.id;
  await h.call('preparePunishment', 'user1', { questionId, targetTeam: 'A234-2', prompt: 'سؤال المنافس', answerText: 'إجابة سرية', penalty: 'يمثل حركة', mode });
  return questionId;
}

test('punishment answer remains private and only host can judge', async () => {
  const h = punishmentFixture();
  const questionId = await preparedPunishment(h);
  assert.equal(JSON.stringify(h.match()).includes('إجابة سرية'), false);
  await assert.rejects(h.call('getHostAnswer', 'user2'), { code: 'permission-denied' });
  assert.equal((await h.call('getHostAnswer')).answerText, 'إجابة سرية');
  await assert.rejects(h.call('judgePunishment', 'user1', { questionId, correct: false }), { code: 'permission-denied' });
  await assert.rejects(h.call('judgeVerbal', 'host', { correct: true }), { code: 'failed-precondition' });
});

test('preselected deduction is automatic only on wrong answer and cannot run twice', async () => {
  const success = punishmentFixture();
  const successId = await preparedPunishment(success, 'deduct');
  await success.call('judgePunishment', 'host', { questionId: successId, correct: true });
  assert.equal(success.match().state.punishment.stage, 'resolved');
  assert.equal(success.match().teams['A234-2'].score, 150);
  const h = punishmentFixture();
  const questionId = await preparedPunishment(h, 'deduct');
  const attempts = await Promise.allSettled([
    h.call('judgePunishment', 'host', { questionId, correct: false }),
    h.call('judgePunishment', 'host', { questionId, correct: false }),
  ]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(h.match().teams['A234-2'].score, -50);
  assert.equal(h.match().state.punishment.stage, 'resolved');
  assert.equal(h.match().state.punishment.mode, 'deduct');
  await assert.rejects(h.call('requestPunishmentOutcome', 'user2', { questionId, mode: 'perform' }), { code: 'failed-precondition' });
  await assert.rejects(h.call('resolvePunishment', 'host', { questionId, mode: 'deduct' }), { code: 'failed-precondition' });
  assert.equal(h.match().teams['A234-2'].score, -50);
});

test('physical punishment does not deduct points; preparation expires after sixty seconds', async () => {
  const h = punishmentFixture();
  const questionId = await preparedPunishment(h);
  await h.call('judgePunishment', 'host', { questionId, correct: false });
  await h.call('resolvePunishment', 'host', { questionId, mode: 'perform' });
  assert.equal(h.match().teams['A234-2'].score, 150);
  const expired = punishmentFixture();
  await expired.call('chooseType', 'user1', { type: 'punishment' });
  const oldId = expired.match().state.question.id;
  expired.setClock(62001);
  await assert.rejects(expired.call('preparePunishment', 'user1', { questionId: oldId, targetTeam: 'A234-2', prompt: 'سؤال', answerText: 'جواب', penalty: 'حركة' }), { code: 'deadline-exceeded' });
  await expired.call('cancelPunishment', 'host', { questionId: oldId });
  assert.equal(expired.match().state.punishment.mode, 'cancelled');
});

test('representative alone prepares and selects penalty; stale requests cannot affect a new question', async () => {
  const h = punishmentFixture();
  h.match().answerMode = 'representative';
  h.match().teams['A234-1'].captainId = 'p1';
  h.match().teams['A234-2'].captainId = 'p2';
  h.match().players.p3 = { id: 'p3', teamCode: 'A234-1', name: 'عضو' };
  h.data.matchAccess.A234.playerUids.p3 = 'user3';
  await assert.rejects(h.call('chooseType', 'user3', { type: 'punishment' }), { code: 'permission-denied' });
  const questionId = await preparedPunishment(h);
  await assert.rejects(h.call('preparePunishment', 'user3', { questionId }), { code: 'permission-denied' });
  await assert.rejects(h.call('judgePunishment', 'host', { questionId: questionId - 1, correct: false }), { code: 'failed-precondition' });
});

test('admin enrollment requires verified owner email from Google authentication', async () => {
  const h = harness();
  for (const token of [ {}, { email: 'other@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }, { email: 'fhd.alqahtani@gmail.com', email_verified: false, firebase: { sign_in_provider: 'google.com' } }, { email: 'fhd.alqahtani@gmail.com', email_verified: true, firebase: { sign_in_provider: 'password' } } ]) {
    await assert.rejects(h.authCall(token), { code: 'permission-denied' });
  }
  assert.equal((await h.authCall({ email: 'fhd.alqahtani@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } })).admin, true);
});

test('normal custom-section selection rotates across fifteen new matches for the same presenter', async () => {
  const h = harness();
  h.data.customQuestions = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [900000 + i, { id: 900000 + i, type: 'ct_rotation', category: 'custom', level: 'easy', question: `سؤال جديد ${i}`, options: ['أ', 'ب', 'ج', 'د'], answer: 0 }]));
  const seen = new Set();
  for (let i = 0; i < 15; i++) {
    const matchCode = `B${100 + i}`;
    h.data.matches[matchCode] = { ...clone(h.match()), enabledTypes: ['ct_rotation'], difficulty: 'easy', questionsPerTeam: 4, turnIndex: 0, state: { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [], usedAssets: [] } };
    h.data.matchAccess[matchCode] = clone(h.data.matchAccess.A234);
    const response = await h.call('chooseType', 'user1', { matchCode, type: 'ct_rotation', requestId: `request${i}` });
    assert.equal(response.status, 'accepted');
    const question = h.data.matches[matchCode].state.question;
    assert.equal(seen.has(question.id), false);
    seen.add(question.id);
  }
  assert.equal(seen.size, 15);
});

test('two simultaneous punishment drafts cannot mismatch prompt and private answer', async () => {
  const h = punishmentFixture();
  await h.call('chooseType', 'user1', { type: 'punishment' });
  const questionId = h.match().state.question.id;
  const results = await Promise.allSettled(['one', 'two'].map((suffix) => h.call('preparePunishment', 'user1', { questionId, targetTeam: 'A234-2', prompt: `prompt-${suffix}`, answerText: `answer-${suffix}`, penalty: 'حركة', mode: 'perform' })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const prompt = h.match().state.question.question;
  assert.equal(h.data.matchSecrets.A234.answerText, prompt.replace('prompt-', 'answer-'));
});


test('exhausted rotation leaves selection usable and marks only that section bank', async () => {
  const h = harness();
  const question = { id: 900001, type: 'ct_rotation', category: 'custom', level: 'easy', question: 'السؤال الوحيد', options: ['أ', 'ب', 'ج', 'د'], answer: 0 };
  h.data.customQuestions = { 900001: question };
  await h.helpers.rotateQuestion([question], 'previous', 'host');
  Object.assign(h.match(), { enabledTypes: ['ct_rotation'], difficulty: 'easy', questionsPerTeam: 4, turnIndex: 0, state: { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [] } });
  const result = await h.call('chooseType', 'user1', { type: 'ct_rotation', requestId: 'no-repeat' });
  assert.equal(result.status, 'rotation');
  assert.equal(h.match().state.phase, 'choose');
  assert.equal(h.match().state.question, null);
  assert.equal(h.match().rotationBlocked['A234-1'].ct_rotation.bank, true);
  assert.equal(h.match().typeCounts?.['A234-1']?.ct_rotation || 0, 0);
});

test('extra time rejects the exact deadline and later without spending balance or card', async () => {
  for (const clock of [21000, 30000]) {
    const h = harness();
    Object.assign(h.match(), { questionsPerTeam: 8, timer: 20 });
    Object.assign(h.match().state, { phase: 'question', targetTeam: 'A234-1', questionStartedAt: 1000, questionDuration: 20, question: { id: 42, type: 'mcq' } });
    Object.assign(h.match().teams['A234-1'], { cardBalance: 1000, powerCards: { extraTime: true } });
    h.setClock(clock);
    const result = await h.call('usePowerCard', 'user1', { teamCode: 'A234-1', card: 'extraTime' });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'expired');
    assert.equal(h.match().teams['A234-1'].cardBalance, 1000);
    assert.equal(h.match().teams['A234-1'].powerCards.extraTime, true);
    assert.equal(h.match().state.cardClaimId, undefined);
  }
});

test('extra time works just before deadline and during memory viewing, only once', async () => {
  for (const startsAt of [1000, 14000]) {
    const h = harness();
    Object.assign(h.match(), { questionsPerTeam: 8, timer: 20 });
    Object.assign(h.match().state, { phase: 'question', targetTeam: 'A234-1', questionStartedAt: startsAt, questionDuration: 20, question: { id: 42, type: 'mcq' } });
    Object.assign(h.match().teams['A234-1'], { cardBalance: 1000, powerCards: { extraTime: true } });
    h.setClock(startsAt === 1000 ? 20999 : 2000);
    assert.equal((await h.call('usePowerCard', 'user1', { teamCode: 'A234-1', card: 'extraTime' })).accepted, true);
    assert.equal(h.match().state.extraTimeUsed, true);
    assert.equal(h.match().teams['A234-1'].cardBalance, 950);
    assert.equal((await h.call('usePowerCard', 'user1', { teamCode: 'A234-1', card: 'extraTime' })).accepted, false);
    assert.equal(h.match().teams['A234-1'].cardBalance, 950);
  }
});

test('concurrent creation using the same audience code cannot overwrite the first match', async () => {
  const h = harness(false, true);
  const options = { teamNames: ['ألف', 'باء'], enabledTypes: ['mcq'], difficulty: 'easy', questionsPerTeam: 1 };
  const results = await Promise.allSettled([
    h.helpers.createMatch('host-one', { ...options, hostName: 'الأول' }),
    h.helpers.createMatch('host-two', { ...options, hostName: 'الثاني' }),
  ]);
  const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results[1 - winnerIndex].reason.code, 'resource-exhausted');
  const code = results[winnerIndex].value.code;
  assert.equal(h.data.matches[code].hostName, winnerIndex === 0 ? 'الأول' : 'الثاني');
  assert.equal(h.data.matchAccess[code].hostUid, winnerIndex === 0 ? 'host-one' : 'host-two');
});

test('shared game rate limit blocks excessive retries and resets next minute', async () => {
  const h = harness(); h.setClock(22000);
  for (let n = 0; n < 180; n++) await h.call('finishShowdown', 'user1');
  await assert.rejects(h.call('finishShowdown', 'user1'), { code: 'resource-exhausted' });
  h.setClock(82001);
  await h.call('finishShowdown', 'user1');
});

test('prototype action names cannot bypass or create independent rate buckets', async () => {
  const h = harness();
  for (const action of ['__proto__', 'constructor', 'toString']) {
    await assert.rejects(h.call(action), { code: 'invalid-argument' });
  }
  assert.deepEqual(Object.keys(h.data.securityRateLimits).sort(), ['game_ip', 'game_uid']);
  const bucket = Object.values(h.data.securityRateLimits.game_uid)[0];
  assert.equal(bucket.count, 3);
});

test('a section is blocked only for that team next turn and returns after another selection', async () => {
  const h = harness();
  Object.assign(h.match(), { enabledTypes: ['ct_a', 'ct_b'], difficulty: 'easy', questionsPerTeam: 4, totalRounds: 8, typeCaps: { ct_a: 2, ct_b: 2 } });
  h.data.customQuestions = Object.fromEntries(['ct_a', 'ct_b'].flatMap((type, index) => [1, 2].map((n) => {
    const id = 950000 + index * 10 + n;
    return [id, { id, type, category: 'custom', level: 'easy', question: `سؤال ${type} ${n}`, options: ['أ', 'ب', 'ج', 'د'], answer: 0 }];
  })));
  h.match().state = { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [], usedAssets: [] };
  const nextSelection = (teamCode) => Object.assign(h.match().state, { phase: 'choose', targetTeam: teamCode, question: null, selectionRequestId: null });
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_a', requestId: 'first' })).status, 'accepted');
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_a', requestId: 'first' })).status, 'accepted');
  nextSelection('A234-2');
  assert.equal((await h.call('chooseType', 'user2', { type: 'ct_a' })).status, 'accepted');
  nextSelection('A234-1');
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_a' })).status, 'cooldown');
  assert.equal(h.match().state.question, null);
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_b' })).status, 'accepted');
  nextSelection('A234-1');
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_a' })).status, 'empty');
  // Both A questions were used by the two teams; cooldown has cleared, asset reuse has not.
  assert.equal(h.match().lastChosenTypeByTeam['A234-1'], 'ct_b');
  h.data.customQuestions[950003] = { id: 950003, type: 'ct_a', category: 'custom', level: 'easy', question: 'سؤال ثالث', options: ['أ', 'ب', 'ج', 'د'], answer: 0 };
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_a' })).status, 'accepted');
  assert.equal(h.match().lastChosenTypeByTeam['A234-1'], 'ct_a');
});

test('punishment mode must be preselected and physical punishment cannot become a deduction', async () => {
  const h = punishmentFixture();
  const questionId = await preparedPunishment(h, 'perform');
  await h.call('judgePunishment', 'host', { questionId, correct: false });
  assert.equal(h.match().state.punishment.stage, 'failed');
  await assert.rejects(h.call('resolvePunishment', 'host', { questionId, mode: 'deduct' }), { code: 'failed-precondition' });
  await assert.rejects(h.call('requestPunishmentOutcome', 'user2', { questionId, mode: 'deduct' }), { code: 'failed-precondition' });
  assert.equal(h.match().teams['A234-2'].score, 150);
  await h.call('resolvePunishment', 'host', { questionId, mode: 'perform' });
  assert.equal(h.match().state.punishment.mode, 'perform');
  const invalid = punishmentFixture();
  await invalid.call('chooseType', 'user1', { type: 'punishment' });
  await assert.rejects(invalid.call('preparePunishment', 'user1', { questionId: invalid.match().state.question.id, targetTeam: 'A234-2', prompt: 'سؤال', answerText: 'جواب', mode: 'other' }), { code: 'invalid-argument' });
  assert.equal(invalid.match().state.punishment.stage, 'prepare');
});

test('all enabled sections must be used per team before any section repeats', async () => {
  const h = harness(true);
  Object.assign(h.match(), { enabledTypes: ['ct_a', 'ct_b', 'punishment'], difficulty: 'easy', questionsPerTeam: 6, typeCaps: { ct_a: 3, ct_b: 3, punishment: 3 } });
  h.data.customQuestions = { a: { id: 960001, type: 'ct_a', category: 'custom', level: 'easy', question: 'ألف', options: ['أ', 'ب'], answer: 0 }, b: { id: 960002, type: 'ct_b', category: 'custom', level: 'easy', question: 'باء', options: ['أ', 'ب'], answer: 0 } };
  h.match().state = { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [] };
  const next = () => Object.assign(h.match().state, { phase: 'choose', question: null, selectionRequestId: null, targetTeam: 'A234-1' });
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_a' })).status, 'accepted');
  next();
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_b' })).status, 'accepted');
  next();
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_a' })).status, 'cooldown');
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_b' })).status, 'cooldown');
  assert.equal(h.helpers.sectionCycle(h.match(), 'A234-2').used.length, 0);
  assert.equal((await h.call('chooseType', 'user1', { type: 'punishment' })).status, 'accepted');
  assert.equal(h.helpers.sectionCycle(h.match(), 'A234-1').number, 2);
  assert.equal(h.helpers.sectionCycle(h.match(), 'A234-1').used.length, 0);
  next();
  assert.equal((await h.call('chooseType', 'user1', { type: 'punishment' })).status, 'accepted');
  next();
  assert.equal((await h.call('chooseType', 'user1', { type: 'punishment' })).status, 'cooldown');
});

test('single-section cycle resets and card prices match the client at all match lengths', () => {
  const h = harness();
  const single = { enabledTypes: ['flag'], sectionCycleByTeam: {} };
  single.sectionCycleByTeam.one = h.helpers.nextSectionCycle(single, 'one', 'flag');
  assert.equal(h.helpers.sectionCycle(single, 'one').used.length, 0);
  assert.equal(single.sectionCycleByTeam.one.number, 2);
  const frontend = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/types/game.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { exports: frontend });
  const prices = { extraTime: 50, swapQuestion: 100, pickPlayer: 150, doublePoints: 150, freeze: 150, steal: 200 };
  for (const [card, price] of Object.entries(prices)) {
    assert.equal(h.helpers.powerCardCost(card, 8), price);
    for (const size of [1, 4, 8, 12, 16]) assert.equal(h.helpers.powerCardCost(card, size), frontend.powerCardCost(card, size));
  }
});


test('question gallery is admin-only and omits answers and options', async () => {
  const h = harness();
  await assert.rejects(h.adminCall('getAdminQuestions', {}, false), { code: 'permission-denied' });
  const { questions } = await h.adminCall('getAdminQuestions');
  assert.ok(questions.length > 100);
  assert.ok(questions.some((q) => q.type === 'flag' && q.image));
  for (const q of questions) {
    assert.equal(Object.hasOwn(q, 'answer'), false);
    assert.equal(Object.hasOwn(q, 'options'), false);
  }
});

test('bulk exclusion applies to builtin and custom questions and can be restored', async () => {
  const h = harness();
  h.data.customQuestions = { 900001: { id: 900001, type: 'ct_test', level: 'easy', question: 'خاص', options: ['أ', 'ب'], answer: 0 } };
  const { questions } = await h.adminCall('getAdminQuestions');
  const builtin = questions.find((q) => !q.custom && q.type === 'flag');
  const ids = [builtin.id, 900001];
  await assert.rejects(h.adminCall('setAdminQuestionAvailability', { ids, disabled: true }, false), { code: 'permission-denied' });
  assert.equal(h.data.questionExclusions, undefined);
  assert.equal((await h.adminCall('setAdminQuestionAvailability', { ids, disabled: true })).count, 2);
  const bank = await h.helpers.questionBank();
  assert.equal(bank.find((q) => q.id === builtin.id).disabled, true);
  assert.equal(bank.find((q) => q.id === 900001).disabled, true);
  assert.equal((await h.adminCall('getAdminQuestions')).questions.find((q) => q.id === builtin.id).disabled, true);
  await h.adminCall('setAdminQuestionAvailability', { ids, disabled: false });
  const restored = await h.helpers.questionBank();
  assert.equal(restored.find((q) => q.id === builtin.id).disabled, false);
  assert.equal(restored.find((q) => q.id === 900001).disabled, false);
});

test('invalid bulk ids leave all availability unchanged', async () => {
  const h = harness();
  const { questions } = await h.adminCall('getAdminQuestions');
  await assert.rejects(h.adminCall('setAdminQuestionAvailability', { ids: [questions[0].id, 'bad'], disabled: true }), { code: 'invalid-argument' });
  await assert.rejects(h.adminCall('setAdminQuestionAvailability', { ids: [], disabled: true }), { code: 'invalid-argument' });
  assert.equal(h.data.questionExclusions, undefined);
});

test('admin inventory counts exactly the playable bank and explains a 739 to 723 difference', async () => {
  const h = harness();
  const base = await h.adminCall('getAdminQuestions');
  const builtin = base.questions.filter((q) => q.type === 'multiple_choice' && !q.disabled && !q.custom);
  assert.equal(builtin.length, 739);
  h.data.questionDeletions = Object.fromEntries(builtin.slice(0, 10).map((q) => [q.id, true]));
  h.data.questionExclusions = Object.fromEntries(builtin.slice(10, 16).map((q) => [q.id, true]));
  // A deleted and excluded marker must not subtract the same question twice.
  h.data.questionExclusions[builtin[0].id] = true;
  const catalog = await h.adminCall('getAdminQuestions');
  const counts = catalog.inventory.multiple_choice;
  assert.equal(counts.builtin, 789);
  assert.equal(counts.legacyDisabled, 50);
  assert.equal(counts.deleted, 10);
  assert.equal(counts.excluded, 6);
  assert.equal(counts.available, 723);
  const bank = await h.helpers.questionBank();
  for (const [type, inventory] of Object.entries(catalog.inventory)) {
    assert.equal(inventory.available, bank.filter((q) => q.type === type && !q.disabled).length);
    assert.equal(inventory.available, catalog.questions.filter((q) => q.type === type && !q.disabled).length);
    assert.equal(inventory.available, inventory.builtin - inventory.legacyDisabled - inventory.deleted - inventory.excluded + inventory.customAvailable);
  }
  const questions = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
  const expectedRevision = createHash('sha256').update(JSON.stringify(questions)).digest('hex');
  assert.equal(catalog.bankRevision, expectedRevision);
  assert.equal(JSON.parse(readFileSync(new URL('../src/data/questionBankVersion.json', import.meta.url), 'utf8')).sha256, expectedRevision);
  assert.ok(catalog.questions.every((q) => !('answer' in q) && !('options' in q)));
});

test('admin inventory refreshes after custom additions and permanent deletion', async () => {
  const h = harness();
  h.data.customQuestions = { 900001: { id: 900001, type: 'multiple_choice', question: 'خاص', options: ['أ', 'ب'], answer: 0 } };
  let catalog = await h.adminCall('getAdminQuestions');
  assert.equal(catalog.inventory.multiple_choice.customAvailable, 1);
  assert.equal(catalog.inventory.multiple_choice.available, 740);
  await h.adminCall('deleteAdminQuestions', { ids: [900001] });
  catalog = await h.adminCall('getAdminQuestions');
  assert.equal(catalog.inventory.multiple_choice.customAvailable, 0);
  assert.equal(catalog.inventory.multiple_choice.available, 739);
});

test('solo challenge never draws questions excluded by admin', async () => {
  const h = harness();
  const { questions } = await h.adminCall('getAdminQuestions');
  const ids = questions.filter((q) => q.type === 'multiple_choice').slice(0, 20).map((q) => q.id);
  await h.adminCall('setAdminQuestionAvailability', { ids, disabled: true });
  const session = await h.call('startChallenge', 'solo');
  assert.equal(session.questions.length, 100);
  assert.ok(session.questions.every((q) => !ids.includes(q.id)));
});

test('team selection skips excluded questions while keeping the rest of the section', async () => {
  const h = harness();
  h.data.customQuestions = Object.fromEntries([900001, 900002].map((id) => [id, { id, type: 'ct_gallery', category: 'custom', level: 'easy', question: `سؤال ${id}`, options: ['أ', 'ب'], answer: 0 }]));
  await h.adminCall('setAdminQuestionAvailability', { ids: [900001], disabled: true });
  Object.assign(h.match(), { enabledTypes: ['ct_gallery'], difficulty: 'easy', questionsPerTeam: 4, turnIndex: 0, state: { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [] } });
  assert.equal((await h.call('chooseType', 'user1', { type: 'ct_gallery' })).status, 'accepted');
  assert.equal(h.match().state.question.id, 900002);
});

test('permanent deletion removes builtin and custom questions from gallery and all banks', async () => {
  const h = harness();
  h.data.customQuestions = { 900001: { id: 900001, type: 'ct_test', level: 'easy', question: 'خاص', options: ['أ', 'ب'], answer: 0 } };
  const { questions } = await h.adminCall('getAdminQuestions');
  const builtin = questions.find((q) => !q.custom && q.type === 'multiple_choice');
  const ids = [builtin.id, 900001];
  await assert.rejects(h.adminCall('deleteAdminQuestions', { ids }, false), { code: 'permission-denied' });
  assert.equal(h.data.questionDeletions, undefined);
  await h.adminCall('setAdminQuestionAvailability', { ids, disabled: true });
  assert.equal((await h.adminCall('deleteAdminQuestions', { ids })).count, 2);
  assert.equal(h.data.customQuestions[900001], undefined);
  assert.ok(ids.every((id) => h.data.questionDeletions[id] === true));
  assert.ok(ids.every((id) => !h.data.questionExclusions[id]));
  for (const bank of [(await h.adminCall('getAdminQuestions')).questions, await h.helpers.questionBank(), await h.helpers.questionBank(false)]) {
    assert.ok(bank.every((q) => !ids.includes(q.id)));
  }
  await assert.rejects(h.adminCall('setAdminQuestionAvailability', { ids, disabled: false }), { code: 'invalid-argument' });
  assert.equal((await h.adminCall('deleteAdminQuestions', { ids })).count, 2);
  const session = await h.call('startChallenge', 'solo');
  assert.ok(session.questions.every((q) => !ids.includes(q.id)));
});

test('permanent delete validates the whole batch before changing any question', async () => {
  const h = harness();
  const { questions } = await h.adminCall('getAdminQuestions');
  await assert.rejects(h.adminCall('deleteAdminQuestions', { ids: [questions[0].id, 'bad'] }), { code: 'invalid-argument' });
  await assert.rejects(h.adminCall('deleteAdminQuestions', { ids: [] }), { code: 'invalid-argument' });
  assert.equal(h.data.questionDeletions, undefined);
});

test('the 160 flags form a full persistent cycle across competitions before any reuse', async () => {
  const h = harness(true);
  const bank = await h.helpers.questionBank();
  const flags = bank.filter((q) => q.type === 'flag' && !q.disabled);
  const countries = JSON.parse(readFileSync(new URL('../src/data/flagCountries.json', import.meta.url), 'utf8'));
  assert.equal(flags.length, 160);
  assert.equal(new Set(flags.map((q) => q.image)).size, 160);
  assert.deepEqual(new Set(flags.map((q) => q.options[q.answer])), new Set(countries.map((c) => c.name)));
  const seen = new Set();
  for (let i = 0; i < 160; i++) {
    const draw = await h.helpers.rotateQuestion(flags, `game-${i}`, 'host', flags);
    assert.equal(draw.reused, false);
    assert.equal(seen.has(draw.question.image), false);
    seen.add(draw.question.image);
    assert.equal('level' in draw.question, false);
    assert.equal(new Set(draw.question.options).size, 4);
    assert.equal(readFileSync(new URL(`../public${draw.question.image}`, import.meta.url)).subarray(8, 12).toString(), 'WEBP');
  }
  assert.equal(seen.size, 160);
  const next = await h.helpers.rotateQuestion(flags, 'game-next', 'host', flags);
  assert.equal(next.reused, true);
  assert.ok(seen.has(next.question.image));
  assert.equal(h.data.flagRotation.v1.host.cycle, 2);
});

test('concurrent flag draws cannot give two teams the same flag and owners rotate independently', async () => {
  const h = harness(true);
  const flags = (await h.helpers.questionBank()).filter((q) => q.type === 'flag' && !q.disabled);
  const draws = await Promise.all(Array.from({ length: 8 }, (_, i) => h.helpers.rotateQuestion(flags, `game-${i}`, 'host', flags)));
  assert.equal(new Set(draws.map((draw) => draw.question.image)).size, 8);
  await h.helpers.rotateQuestion(flags, 'other-game', 'other-host', flags);
  assert.equal(h.data.flagRotation.v1['other-host'].used.length, 1);
  assert.equal(h.data.flagRotation.v1.host.used.length, 8);
});

test('flag rotation cannot reset early when the remaining flags are unavailable in this match', async () => {
  const h = harness(true);
  const flags = (await h.helpers.questionBank()).filter((q) => q.type === 'flag' && !q.disabled).slice(0, 3);
  const first = await h.helpers.rotateFlagQuestion(flags, 'host', flags);
  await assert.rejects(h.helpers.rotateFlagQuestion([first.question], 'host', flags), { code: 'resource-exhausted' });
  assert.equal(h.data.flagRotation.v1.host.cycle, 1);
  const second = await h.helpers.rotateFlagQuestion(flags, 'host', flags);
  assert.notEqual(second.question.image, first.question.image);
});

test('unified sections ignore legacy difficulty for selection and count all questions in their cap', async () => {
  const h = harness();
  const questions = ['easy', 'medium', 'hard', 'hard'].map((level, i) => ({ id: 900100 + i, type: 'ct_unified', category: 'custom', level, question: `سؤال البنك ${i}`, options: ['أ', 'ب'], answer: 0 }));
  assert.equal(h.helpers.fairTypeCaps(['ct_unified'], 2, 4, questions).ct_unified, 2);
  h.data.customQuestions = { 900103: questions[3] };
  Object.assign(h.match(), { enabledTypes: ['ct_unified'], difficulty: 'easy', difficultyLevels: ['easy'], questionsPerTeam: 4, turnIndex: 0, state: { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [] } });
  const response = await h.call('chooseType', 'user1', { type: 'ct_unified', requestId: 'unified-bank' });
  assert.equal(response.status, 'accepted');
  assert.equal(h.match().state.question.id, 900103);
  assert.equal('level' in h.match().state.question, false);
});
