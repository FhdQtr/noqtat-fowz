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

function presenterContext(state, requestId) {
  return { questionId: state.question?.id ?? null, phase: state.phase, round: state.round || 0,
    attemptId: `${state.round || 0}:${state.targetTeam || ''}:${state.passCount || 0}:${state.selectionRequestId || ''}`,
    revision: state.revision || 0, requestId };
}

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
    get: async () => { const snap = snapshot(clone(read(path))); afterRead?.(path); return snap; },
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
  runInNewContext(source + '\nexports.testHelpers = { rotateQuestion, rotationAssetKey, registerRotationMatch, createMatch, sectionCycle, nextSectionCycle, powerCardCost, questionBank, fairTypeCaps };', { require: mockedRequire, exports, Buffer, process: { env: {} },
    Date: class extends Date { static now() { return clock; } }, console });
  let presenterSequence = 0;
  const call = (action, uid = 'host', extra = {}) => exports.gameAction({ auth: { uid }, rawRequest: { ip: '192.0.2.1' }, data: {
    action, matchCode: 'A234',
    ...(['passToNextTeam', 'advanceTurn', 'judgeVerbal', 'revealAnswer'].includes(action)
      ? { transition: presenterContext(data.matches.A234.state, `presenter-${++presenterSequence}`) } : {}), ...extra,
  } });
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

test('new and legacy create requests persist an explicit advisory timer contract', async () => {
  for (const timerMode of [undefined, 'advisory']) {
    const h = harness();
    const created = await h.helpers.createMatch('timer-host', { teamNames: ['Hermes QA A', 'Hermes QA B'], questionsPerTeam: 4, enabledTypes: ['multiple_choice'], timer: 10, ...(timerMode ? { timerMode } : {}) });
    const match = h.data.matches[created.code];
    assert.equal(match.timerMode, 'advisory');
    assert.equal(match.timer, 10);
  }
});

test('unsupported strict timers are rejected before a misleading advisory lobby can be created', async () => {
  const h = harness();
  await assert.rejects(h.helpers.createMatch('timer-host', { teamNames: ['Hermes QA A', 'Hermes QA B'], questionsPerTeam: 4, enabledTypes: ['multiple_choice'], timer: 10, timerMode: 'strict' }), { code: 'invalid-argument' });
  assert.equal(Object.keys(h.data.matches).length, 1);
});

test('room endpoints reject missing and malformed codes before any room read', async () => {
  for (const action of ['getMatch', 'getTeamInvites', 'getHostAnswer', 'submitAnswer', 'advanceTurn']) {
    for (const matchCode of [undefined, '', ' ', '../', 'A234/players', 'A2345', {}, 1234]) {
      const h = harness();
      let reads = 0;
      h.afterRead(() => { reads += 1; });
      await assert.rejects(h.call(action, 'host', { matchCode }), { code: 'invalid-argument' }, `${action}: ${String(matchCode)}`);
      assert.equal(reads, 0, 'invalid room paths never reach Admin SDK reads');
    }
  }
});

function joinFixture() {
  const h = harness();
  h.match().status = 'lobby';
  h.match().players = {};
  h.data.matchAccess.A234.teamKeys = { 'A234-1': 'invite-one' };
  return h;
}

test('join capacity is reserved atomically across different identities', async () => {
  const h = joinFixture();
  for (let i = 0; i < 19; i++) h.match().players[`existing-${i}`] = { id: `existing-${i}`, teamCode: 'A234-1', name: 'QA' };
  const results = await Promise.allSettled(['new-one', 'new-two'].map((uid) => h.call('joinTeam', uid, { teamCode: 'A234-1', inviteKey: 'invite-one', name: 'Hermes QA' })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(h.match().players).length, 20);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'resource-exhausted');
});

test('join capacity is rechecked after a competing last-slot reservation', async () => {
  const h = joinFixture();
  for (let i = 0; i < 19; i++) h.match().players[`existing-${i}`] = { id: `existing-${i}`, teamCode: 'A234-1', name: 'QA' };
  let reads = 0;
  h.afterRead((path) => {
    if (path === 'matches/A234' && ++reads === 2) h.match().players.last = { id: 'last', teamCode: 'A234-1', name: 'QA last slot' };
  });
  await assert.rejects(h.call('joinTeam', 'new-one', { teamCode: 'A234-1', inviteKey: 'invite-one', name: 'Hermes QA' }), { code: 'resource-exhausted' });
  assert.equal(Object.keys(h.match().players).length, 20);
});

test('public TV can view a lobby but cannot enumerate private invitations', async () => {
  const h = joinFixture();
  assert.ok((await h.call('getMatch', 'audience')).match);
  await assert.rejects(h.call('getTeamInvites', 'audience'), { code: 'permission-denied' });
  const invites = await h.call('getTeamInvites', 'host');
  assert.equal(invites.teamKeys['A234-1'], 'invite-one');
});

test('join rejects start race and restores a committed reservation after missing mapping', async () => {
  const closed = joinFixture();
  closed.beforeTransaction(() => { closed.match().status = 'playing'; });
  await assert.rejects(closed.call('joinTeam', 'new-one', { teamCode: 'A234-1', inviteKey: 'invite-one' }), { code: 'failed-precondition' });
  assert.equal(Object.keys(closed.match().players).length, 0);
  const h = joinFixture();
  const request = { teamCode: 'A234-1', inviteKey: 'invite-one', name: 'Hermes QA' };
  const first = await h.call('joinTeam', 'new-one', request);
  delete h.data.matchAccess.A234.playerUids[first.player.id];
  const second = await h.call('joinTeam', 'new-one', request);
  assert.equal(second.player.id, first.player.id);
  assert.equal(Object.keys(h.match().players).length, 1);
  assert.equal(h.data.matchAccess.A234.playerUids[first.player.id], 'new-one');
  assert.equal('authUid' in second.player, false);
});

test('assist cannot copy old secret choices onto a replacement question', async () => {
  const h = harness();
  Object.assign(h.match().state, { phase: 'question', targetTeam: 'A234-1', question: { id: 42, type: 'brand', optionsHidden: true }, assistUsed: false });
  h.data.matchSecrets.A234.options = ['old a', 'old b'];
  h.afterRead((path) => { if (path === 'matchSecrets/A234') h.match().state.question = { id: 43, type: 'brand', optionsHidden: true }; });
  const result = await h.call('useAssist', 'user1', { teamCode: 'A234-1' });
  assert.equal(result.accepted, false);
  assert.equal(h.match().state.question.id, 43);
  assert.equal(h.match().state.question.options, undefined);
});

test('timed prompt reveal cannot overwrite a replacement memory question', async () => {
  const h = harness();
  Object.assign(h.match().state, { phase: 'question', question: { id: 42, type: 'memory', promptHidden: true }, viewUntil: 1000 });
  Object.assign(h.data.matchSecrets.A234, { question: 'old prompt', options: ['old a', 'old b'] });
  h.afterRead((path) => { if (path === 'matchSecrets/A234') h.match().state.question = { id: 43, type: 'memory', promptHidden: true }; });
  const result = await h.call('revealQuestionPrompt', 'user1');
  assert.equal(result.accepted, false);
  assert.equal(h.match().state.question.id, 43);
  assert.equal(h.match().state.question.question, undefined);
});

test('editorial concept families block paraphrases and migrate legacy text history', async () => {
  const h = harness();
  const a = { id: 900001, type: 'multiple_choice', conceptId: 'qa-concept', question: 'First phrasing', options: ['a', 'b'], answer: 0 };
  const b = { ...a, id: 900002, question: 'Different wording of the same fact' };
  const first = await h.helpers.rotateQuestion([a], 'qa-game-one', 'host');
  assert.equal(first.question.id, a.id);
  await assert.rejects(h.helpers.rotateQuestion([b], 'qa-game-two', 'host'), { code: 'resource-exhausted' });
  const old = harness();
  const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
  const original = bank.find((q) => q.id === 62);
  const legacyHash = createHash('sha256').update(`text:${original.question.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()}`).digest('hex');
  old.data.questionRotation = { host: { games: [{ id: 'legacy-game', assets: [legacyHash] }] } };
  await assert.rejects(old.helpers.rotateQuestion([bank.find((q) => q.id === 899)], 'qa-game-new', 'host'), { code: 'resource-exhausted' });
});

test('a tied single-section match opens fresh section capacity for its deciding cycle', async () => {
  const h = harness();
  Object.assign(h.match(), { totalRounds: 8, turnIndex: 7, questionsPerTeam: 4, enabledTypes: ['multiple_choice'], typeCaps: { multiple_choice: 4 }, typeCounts: { 'A234-1': { multiple_choice: 4 }, 'A234-2': { multiple_choice: 4 } }, sectionCycleByTeam: { 'A234-1': { used: ['multiple_choice'], number: 4 }, 'A234-2': { used: ['multiple_choice'], number: 4 } } });
  h.match().teams['A234-2'].score = 100;
  Object.assign(h.match().state, { phase: 'revealed', round: 8 });
  assert.equal((await h.call('advanceTurn')).tieBreaker, true);
  assert.equal((await h.call('chooseType', 'user1', { type: 'multiple_choice', requestId: 'tie-pick-one' })).status, 'accepted');
  assert.equal(h.match().state.targetTeam, 'A234-1');
});

function ordinaryAnswerFixture() {
  const h = harness();
  Object.assign(h.match().state, { phase: 'question', round: 1, targetTeam: 'A234-1', passCount: 0, revision: 4, selectionRequestId: 'selection-1', answer: null });
  const context = { playerId: 'p1', choice: 3, questionId: 42, attemptId: '1:A234-1:0:selection-1', revision: 4, requestId: 'answer-1' };
  return { h, context };
}

test('passing a wrong answer cannot overwrite a replacement committed after the room read', async () => {
  const { h } = ordinaryAnswerFixture();
  Object.assign(h.match().state, { phase: 'revealed', isCorrect: false });
  h.afterRead((path) => {
    if (path !== 'matches/A234') return;
    h.afterRead(null);
    Object.assign(h.match().state, { phase: 'question', revision: 5, question: { id: 43, options: ['A', 'B'], answer: -1 } });
  });
  await assert.rejects(h.call('passToNextTeam'), { code: 'failed-precondition' });
  assert.equal(h.match().state.question.id, 43);
  assert.equal(h.match().state.targetTeam, 'A234-1');
  assert.equal(h.match().state.phase, 'question');
});

test('concurrent pass requests commit exactly one new attempt', async () => {
  const { h } = ordinaryAnswerFixture();
  Object.assign(h.match().state, { phase: 'revealed', isCorrect: false });
  const results = await Promise.allSettled([h.call('passToNextTeam'), h.call('passToNextTeam')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(h.match().state.targetTeam, 'A234-2');
  assert.equal(h.match().state.passCount, 1);
  assert.equal(h.match().state.revision, 5);
});

test('ordinary advance cannot skip an unanswered question or overwrite a newer turn', async () => {
  const active = ordinaryAnswerFixture();
  await assert.rejects(active.h.call('advanceTurn'), { code: 'failed-precondition' });
  assert.equal(active.h.match().state.phase, 'question');
  const { h } = ordinaryAnswerFixture();
  h.match().state.phase = 'revealed';
  h.afterRead((path) => {
    if (path !== 'matches/A234') return;
    h.afterRead(null);
    Object.assign(h.match().state, { phase: 'question', revision: 5, question: { id: 43, options: ['A', 'B'] } });
  });
  await assert.rejects(h.call('advanceTurn'), { code: 'failed-precondition' });
  assert.equal(h.match().state.question.id, 43);
});

test('concurrent ordinary advance commits one turn and preserves a concurrent score correction for tie resolution', async () => {
  const { h } = ordinaryAnswerFixture(); h.match().state.phase = 'revealed';
  const replies = await Promise.allSettled([h.call('advanceTurn'), h.call('advanceTurn')]);
  assert.equal(replies.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(h.match().turnIndex, 6);
  assert.equal(h.match().state.revision, 5);
  const ending = ordinaryAnswerFixture().h;
  Object.assign(ending.match(), { totalRounds: 1, turnIndex: 0, enabledTypes: ['multiple_choice'] });
  ending.match().state.phase = 'revealed';
  ending.afterRead((path) => {
    if (path !== 'matches/A234') return;
    ending.afterRead(null);
    ending.match().teams['A234-1'].score = 150;
  });
  assert.equal((await ending.call('advanceTurn')).tieBreaker, true);
  assert.equal(ending.match().status, 'playing');
});

test('presenter transitions reject missing or delayed client context before touching a newer attempt', async () => {
  for (const action of ['passToNextTeam', 'advanceTurn', 'judgeVerbal', 'revealAnswer']) {
    for (const bad of [{ transition: undefined }, { transition: { phase: 'revealed', round: 0, revision: 3, questionId: 41, attemptId: 'old', requestId: 'old-request' } }]) {
      const { h } = ordinaryAnswerFixture();
      Object.assign(h.match().state, { phase: 'revealed', isCorrect: false, answer: { choice: 3 } });
      const before = clone(h.match());
      await assert.rejects(h.call(action, 'host', { correct: true, ...bad }), { code: 'failed-precondition' });
      assert.deepEqual(h.match(), before);
    }
  }
});

test('pass and ordinary advance replay a lost-response request without advancing again', async () => {
  for (const action of ['passToNextTeam', 'advanceTurn']) {
    const { h } = ordinaryAnswerFixture();
    Object.assign(h.match().state, { phase: 'revealed', isCorrect: false });
    const transition = presenterContext(h.match().state, 'fixed-lost-response');
    const first = await h.call(action, 'host', { transition });
    const committed = clone(h.match());
    assert.deepEqual(clone(await h.call(action, 'host', { transition })), clone(first));
    assert.deepEqual(h.match(), committed);
    await assert.rejects(h.call(action, 'host', { transition: { ...transition, round: 999 } }), { code: 'failed-precondition' });
  }
});

test('reveal cannot score a stale answer if an answer or assistance commits after its read', async () => {
  for (const mutation of ['answer', 'assist']) {
    const { h } = ordinaryAnswerFixture();
    h.afterRead((path) => {
      if (path !== 'matchSecrets/A234') return;
      h.afterRead(null);
      h.match().state.revision += 1;
      if (mutation === 'answer') { h.match().state.phase = 'locked'; h.match().state.answer = { choice: 3 }; }
      else h.match().state.assistUsed = true;
    });
    await assert.rejects(h.call('judgeVerbal', 'host', { correct: true }), { code: 'failed-precondition' });
    assert.equal(h.match().teams['A234-1'].score, 100);
    assert.notEqual(h.match().state.phase, 'revealed');
  }
});

test('reveal lost-response retries do not double-score and reject a changed adjudication', async () => {
  const { h } = ordinaryAnswerFixture();
  const transition = presenterContext(h.match().state, 'reveal-lost-response');
  const payload = { transition, correct: true };
  assert.equal((await h.call('judgeVerbal', 'host', payload)).correct, true);
  const after = clone(h.match());
  assert.equal((await h.call('judgeVerbal', 'host', payload)).correct, true);
  assert.deepEqual(h.match(), after);
  await assert.rejects(h.call('judgeVerbal', 'host', { ...payload, correct: false }), { code: 'failed-precondition' });
});

test('presenter may explicitly skip the displayed unanswered question without inventing a wrong answer', async () => {
  const { h } = ordinaryAnswerFixture();
  const transition = presenterContext(h.match().state, 'explicit-host-skip');
  const reply = await h.call('advanceTurn', 'host', { transition, skipUnanswered: true });
  assert.equal(reply.ended, false);
  assert.equal(h.match().state.phase, 'choose');
  assert.equal(h.match().teams['A234-1'].score, 100);
  assert.equal(h.match().teams['A234-1'].wrongCount, undefined);
  assert.deepEqual(clone(await h.call('advanceTurn', 'host', { transition, skipUnanswered: true })), clone(reply));
  await assert.rejects(h.call('advanceTurn', 'host', { transition, skipUnanswered: false }), { code: 'failed-precondition' });
});

test('unavailable optional showdown preserves an explicit skip and its retry receipt', async () => {
  const { h } = ordinaryAnswerFixture();
  Object.assign(h.match(), { showdownCount: 0, challengeMode: 'classic' });
  h.match().state.round = 6;
  h.data.customQuestions = { 993001: { id: 993001, type: 'true_false', question: 'Hermes fixture', options: ['Yes', 'No'], answer: 0 } };
  const bank = await h.helpers.questionBank();
  h.data.questionExclusions = Object.fromEntries(bank.filter((q) => q.id !== 993001).map((q) => [q.id, true]));
  const transition = presenterContext(h.match().state, 'skip-with-empty-showdown');
  assert.equal((await h.call('advanceTurn', 'host', { transition, skipUnanswered: true })).ended, false);
  assert.equal(h.match().state.phase, 'choose');
  assert.equal((await h.call('advanceTurn', 'host', { transition, skipUnanswered: true })).ended, false);
});

test('ordinary answers require exact question attempt and revision context', async () => {
  for (const change of [{ questionId: undefined }, { questionId: 41 }, { attemptId: undefined }, { attemptId: 'old' }, { revision: undefined }, { revision: 3 }, { requestId: undefined }]) {
    const { h, context } = ordinaryAnswerFixture();
    const result = await h.call('submitAnswer', 'user1', { ...context, ...change });
    assert.equal(result.status, 'stale');
    assert.equal(h.match().state.phase, 'question');
    assert.equal(h.match().state.answer, null);
  }
});

test('ordinary answer cannot lock a question replaced between read and commit', async () => {
  const { h, context } = ordinaryAnswerFixture();
  h.beforeTransaction(() => { h.match().state.question.id = 43; });
  const result = await h.call('submitAnswer', 'user1', context);
  assert.equal(result.status, 'stale');
  assert.equal(h.match().state.phase, 'question');
  assert.equal(h.match().state.answer, null);
});

test('accepted ordinary answer retries are idempotent and cannot change the choice', async () => {
  const { h, context } = ordinaryAnswerFixture();
  assert.equal((await h.call('submitAnswer', 'user1', context)).status, 'accepted');
  const accepted = clone(h.match().state);
  assert.equal((await h.call('submitAnswer', 'user1', context)).status, 'accepted');
  assert.deepEqual(h.match().state, accepted);
  assert.equal((await h.call('submitAnswer', 'user1', { ...context, choice: 0 })).status, 'stale');
  assert.equal((await h.call('submitAnswer', 'user2', context)).status, 'stale');
  assert.deepEqual(h.match().state, accepted);
});

test('presenter ordinary answers enforce context, atomic mode checks and safe retries', async () => {
  const { h, context } = ordinaryAnswerFixture();
  h.match().answerMode = 'host';
  assert.equal((await h.call('submitHostAnswer', 'host', { ...context, questionId: 41 })).status, 'stale');
  assert.equal((await h.call('submitHostAnswer', 'host', context)).status, 'accepted');
  assert.equal((await h.call('submitHostAnswer', 'host', context)).status, 'accepted');
  assert.equal(h.match().state.answer.playerId, 'host');
  const other = ordinaryAnswerFixture(); other.h.match().answerMode = 'host';
  other.h.beforeTransaction(() => { other.h.match().answerMode = 'anyone'; });
  await assert.rejects(other.h.call('submitHostAnswer', 'host', other.context), { code: 'failed-precondition' });
  assert.equal(other.h.match().state.phase, 'question');
});

test('solo excludes memory questions until a real view-hide phase exists', async () => {
  const h = harness(false, true);
  const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
  const enabled = bank.filter((q) => !q.disabled && q.type === 'multiple_choice').slice(0, 100);
  const memory = bank.filter((q) => !q.disabled && q.type === 'memory');
  const keep = new Set([...enabled, ...memory].map((q) => q.id));
  h.data.questionExclusions = Object.fromEntries(bank.filter((q) => !keep.has(q.id)).map((q) => [q.id, true]));
  const result = await h.call('startChallenge', 'solo-user');
  assert.equal(result.questions.length, 100);
  assert.equal(result.questions.some((q) => q.type === 'memory'), false);
});

test('twenty logo questions have unique native assets and verified private presenter metadata', async () => {
  const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
  const logos = bank.filter((q) => q.type === 'brand' && !q.disabled);
  const sources = JSON.parse(readFileSync(new URL('../src/data/brandSources.json', import.meta.url), 'utf8'));
  assert.equal(logos.length, 20);
  assert.equal(new Set(logos.map((q) => q.image)).size, 20);
  const stats = await import('../src/data/questionStats.ts');
  assert.equal(stats.BUILTIN_QUESTION_STATS.brand, 20);
  for (const q of logos) {
    const credit = sources.find((s) => s.questionId === q.id);
    assert.ok(credit?.industrySource.startsWith('https://'));
    assert.ok(credit.downloadUrl.startsWith('https://'));
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.brandInfo.acceptedNames.includes(q.options[q.answer]));
    assert.ok(q.brandInfo.industry && q.brandInfo.name);
    assert.equal('level' in q, false);
    const svg = readFileSync(new URL(`../public${q.image}`, import.meta.url), 'utf8');
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /<(?:title|desc|text|metadata)\b|<script\b|aria-label=/);
    assert.equal(svg.toLowerCase().includes(credit.brand.toLowerCase()), false);
  }
});

function logoFixture() {
  const h = harness();
  Object.assign(h.match(), { enabledTypes: ['brand'], questionsPerTeam: 8, totalRounds: 16, timer: 30, turnIndex: 0,
    state: { phase: 'choose', round: 0, targetTeam: 'A234-1', question: null, usedIds: [], usedAssets: [] } });
  return h;
}

function pictureGuessFixture() {
  const h = harness(true);
  Object.assign(h.match(), { challengeMode: 'picture_guess', showdownCount: 0, questionsPerTeam: 8, timer: 30,
    state: { phase: 'revealed', round: 6, targetTeam: 'A234-2', question: { id: 43, options: ['أ', 'ب', 'ج', 'د'], answer: 0 }, usedIds: [43], usedAssets: [] } });
  return h;
}

test('picture challenge prepares private pictures after three questions per team and waits for host timer', async () => {
  const h = pictureGuessFixture();
  await h.call('advanceTurn');
  const s = h.match().state;
  assert.equal(s.showdown.kind, 'picture_guess');
  assert.equal(s.showdown.opensAt, 0);
  assert.equal(s.showdown.closesAt, 0);
  assert.equal(s.round, 6);
  assert.equal(s.question.image, undefined);
  assert.equal(s.question.options, undefined); // RTDB prunes deliberately empty arrays.
  assert.equal(JSON.stringify(h.match()).includes('/img/picture-guess/'), false);
  assert.equal('pictures' in s.showdown, false);
  const pictures = h.data.matchSecrets.A234.pictures;
  assert.notEqual(pictures['A234-1'].id, pictures['A234-2'].id);
  assert.equal(pictures['A234-1'].targetTeam, 'A234-2');
  assert.equal(pictures['A234-2'].targetTeam, 'A234-1');
  await assert.rejects(h.call('advanceTurn'), { code: 'failed-precondition' });
});

test('picture challenge views are scoped to each authenticated team and both images only to the host', async () => {
  const h = pictureGuessFixture(); await h.call('advanceTurn');
  const questionId = h.match().state.question.id;
  const first = await h.call('getPictureGuessView', 'user1', { questionId, teamCode: 'A234-2', host: true });
  assert.deepEqual(Object.keys(first.pictures), ['A234-1']);
  const second = await h.call('getPictureGuessView', 'user2', { questionId });
  assert.deepEqual(Object.keys(second.pictures), ['A234-2']);
  assert.equal(Object.keys((await h.call('getPictureGuessView', 'host', { questionId })).pictures).length, 2);
  await assert.rejects(h.call('getPictureGuessView', 'outsider', { questionId }), { code: 'permission-denied' });
  assert.equal((await h.call('getPictureGuessView', 'user1', { questionId: questionId - 1 })).questionId, null);
});

test('only host starts two-minute timer once and chooses a winner after expiry exactly once', async () => {
  const h = pictureGuessFixture(); await h.call('advanceTurn');
  const questionId = h.match().state.question.id;
  const extra = { questionId, teamCode: 'A234-1', result: 'win' };
  await assert.rejects(h.call('judgePictureGuess', 'user1', extra), { code: 'permission-denied' });
  assert.equal((await h.call('judgePictureGuess', 'host', extra)).accepted, false);
  await assert.rejects(h.call('startPictureGuessTimer', 'user1', { questionId }), { code: 'permission-denied' });
  assert.equal((await h.call('startPictureGuessTimer', 'host', { questionId: questionId - 1 })).accepted, false);
  assert.equal((await h.call('startPictureGuessTimer', 'host', { questionId })).accepted, true);
  assert.equal(h.match().state.showdown.closesAt - h.match().state.showdown.opensAt, 120000);
  const deadline = h.match().state.showdown.closesAt;
  h.setClock(deadline - 1);
  assert.equal((await h.call('startPictureGuessTimer', 'host', { questionId })).accepted, false);
  assert.equal(h.match().state.showdown.closesAt, deadline);
  assert.equal((await h.call('judgePictureGuess', 'host', extra)).accepted, false);
  await assert.rejects(h.call('judgePictureGuess', 'host', { ...extra, result: 'yes' }), { code: 'invalid-argument' });
  assert.equal(h.match().teams['A234-1'].score, 100);
  assert.equal(h.match().state.phase, 'showdown');
  h.setClock(deadline);
  assert.equal((await h.call('finishShowdown', 'user1', { questionId })).finished, false);
  assert.equal(h.match().state.phase, 'showdown');
  assert.equal((await h.call('judgePictureGuess', 'host', { ...extra, questionId: questionId - 1, result: 'win' })).accepted, false);
  assert.equal((await h.call('judgePictureGuess', 'host', { ...extra, result: 'win' })).accepted, true);
  assert.equal(h.match().teams['A234-1'].score, 300);
  assert.equal(h.match().state.showdown.winnerTeam, 'A234-1');
  assert.equal((await h.call('judgePictureGuess', 'host', { ...extra, result: 'win' })).accepted, false);
  await h.call('finishShowdown');
  assert.equal(h.match().teams['A234-1'].score, 300);
  await h.call('advanceTurn');
  assert.equal(h.match().state.phase, 'choose');
  assert.equal(h.match().state.targetTeam, 'A234-1');
});

test('two concurrent picture winner decisions cannot award both teams or double-score', async () => {
  const h = pictureGuessFixture(); await h.call('advanceTurn');
  const questionId = h.match().state.question.id;
  await h.call('startPictureGuessTimer', 'host', { questionId });
  h.setClock(h.match().state.showdown.closesAt);
  const results = await Promise.all(h.match().teamOrder.map((teamCode) => h.call('judgePictureGuess', 'host', { questionId, teamCode, result: 'win' })));
  assert.equal(results.filter((r) => r.accepted).length, 1);
  assert.equal(h.match().teams['A234-1'].score + h.match().teams['A234-2'].score, 450);
});

test('picture timeout waits for host no-winner decision without awarding points and resumes play', async () => {
  const h = pictureGuessFixture(); await h.call('advanceTurn');
  const questionId = h.match().state.question.id;
  assert.equal((await h.call('finishShowdown', 'user1', { questionId })).finished, false);
  await h.call('startPictureGuessTimer', 'host', { questionId });
  h.setClock(h.match().state.showdown.closesAt);
  await assert.rejects(h.call('finishShowdown', 'outsider', { questionId }), { code: 'permission-denied' });
  const results = await Promise.all([h.call('finishShowdown', 'host', { questionId }), h.call('finishShowdown', 'user2', { questionId })]);
  assert.ok(results.every((r) => !r.finished));
  await assert.rejects(h.call('advanceTurn'), { code: 'failed-precondition' });
  assert.equal((await h.call('judgePictureGuess', 'host', { questionId, teamCode: '', result: 'none' })).accepted, true);
  assert.equal(h.match().state.showdown.winnerTeam, undefined);
  assert.equal(h.match().teams['A234-1'].score, 100);
  assert.equal(h.match().teams['A234-2'].score, 150);
  await h.call('advanceTurn');
  assert.equal(h.match().state.phase, 'choose');
});

test('host score corrections allow increases and deductions, record reason, reject outsiders and invalid input', async () => {
  const h = harness(true);
  const request = { teamCode: 'A234-1', delta: 200, reason: 'تصحيح نتيجة', requestId: 'score-request-0001' };
  await assert.rejects(h.call('adjustTeamScore', 'user1', request), { code: 'permission-denied' });
  for (const extra of [{ delta: 0 }, { delta: 1.5 }, { delta: 100001 }, { delta: '200' }, { reason: '' }, { teamCode: 'NOPE' }, { requestId: 'bad.id' }]) {
    await assert.rejects(h.call('adjustTeamScore', 'host', { ...request, ...extra }), { code: 'invalid-argument' });
  }
  const results = await Promise.all([h.call('adjustTeamScore', 'host', request), h.call('adjustTeamScore', 'host', request)]);
  assert.ok(results.every((r) => r.accepted));
  assert.equal(h.match().teams['A234-1'].score, 300);
  assert.equal(h.match().teams['A234-2'].score, 150);
  assert.equal(h.match().teams['A234-1'].scoreAdjustment.reason, request.reason);
  assert.equal(h.match().scoreAdjustments[request.requestId].before, 100);
  assert.equal((await h.call('adjustTeamScore', 'host', { ...request, delta: 300 })).accepted, false);
  await h.call('adjustTeamScore', 'host', { ...request, delta: -400, reason: 'مخالفة', requestId: 'score-request-0002' });
  assert.equal(h.match().teams['A234-1'].score, -100);
  assert.equal(h.match().teams['A234-1'].scoreAdjustment.delta, -400);
});

test('simultaneous host score correction and ordinary question judgment preserve both awards', async () => {
  const h = logoFixture();
  await h.call('chooseType', 'user1', { type: 'brand' });
  const value = h.match().state.questionValue;
  await Promise.all([
    h.call('judgeVerbal', 'host', { correct: true }),
    h.call('adjustTeamScore', 'host', { teamCode: 'A234-1', delta: 50, reason: 'تصحيح', requestId: 'score-request-0003' }),
  ]);
  assert.equal(h.match().teams['A234-1'].score, 150 + value);
  assert.equal(h.match().teams['A234-1'].correctCount, 1);
});

test('picture mode never starts early, does not accept option submissions, and creation requires two teams', async () => {
  const h = pictureGuessFixture();
  h.match().state.round = 3;
  await h.call('advanceTurn');
  assert.equal(h.match().state.phase, 'choose');
  h.match().state.phase = 'revealed'; h.match().state.round = 6;
  await h.call('advanceTurn');
  h.setClock(h.match().state.showdown.opensAt + 1);
  assert.equal((await h.call('submitShowdownAnswer', 'user1', { questionId: h.match().state.question.id, playerId: 'p1', choice: 0 })).status, 'late');
  await assert.rejects(h.call('createMatch', 'host', { options: { teamNames: ['أ', 'ب', 'ج'], challengeMode: 'picture_guess', enabledTypes: ['multiple_choice'], questionsPerTeam: 4 } }), { code: 'invalid-argument' });
});

test('logo name and industry are available only to the presenter, with hidden contestant choices', async () => {
  const h = logoFixture();
  assert.equal((await h.call('chooseType', 'user1', { type: 'brand' })).status, 'accepted');
  const q = h.match().state.question;
  assert.equal(q.answer, -1);
  assert.equal(q.optionsHidden, true);
  assert.equal(q.options.length, 0);
  assert.equal('brandInfo' in q, false);
  assert.equal(h.match().state.viewUntil, null);
  await assert.rejects(h.call('getHostAnswer', 'user1'), { code: 'permission-denied' });
  const details = await h.call('getHostAnswer');
  assert.equal(details.questionId, q.id);
  assert.ok(details.brandInfo.acceptedNames.includes(details.answerText));
  assert.ok(details.brandInfo.industry);
  h.data.matchSecrets.A234.questionId += 1;
  const stale = await h.call('getHostAnswer');
  assert.equal(stale.brandInfo, null);
  assert.equal(stale.answerText, null);
});

test('logo assistance requires the active team and awards half points without exposing industry', async () => {
  const h = logoFixture();
  await h.call('chooseType', 'user1', { type: 'brand' });
  const value = h.match().state.questionValue;
  await assert.rejects(h.call('useAssist', 'user2', { teamCode: 'A234-1' }), { code: 'permission-denied' });
  assert.equal((await h.call('useAssist', 'user1', { teamCode: 'A234-1' })).accepted, true);
  assert.equal(h.match().state.question.options.length, 4);
  assert.equal('brandInfo' in h.match().state.question, false);
  await h.call('judgeVerbal', 'host', { correct: true });
  assert.equal(h.match().teams['A234-1'].score, 100 + Math.round(value / 2));
  assert.equal('brandInfo' in h.match().state.question, false);
});

test('swapping a logo refreshes presenter details and avoids reuse for the other team', async () => {
  const h = logoFixture();
  await h.call('chooseType', 'user1', { type: 'brand' });
  const first = clone(h.match().state.question);
  Object.assign(h.match().teams['A234-1'], { cardBalance: 1000, powerCards: { swapQuestion: true } });
  assert.equal((await h.call('usePowerCard', 'user1', { card: 'swapQuestion', teamCode: 'A234-1' })).accepted, true);
  const second = clone(h.match().state.question);
  assert.notEqual(second.image, first.image);
  assert.equal('brandInfo' in second, false);
  const details = await h.call('getHostAnswer');
  assert.equal(details.questionId, second.id);
  assert.ok(details.brandInfo.industry);
  Object.assign(h.match().state, { phase: 'choose', targetTeam: 'A234-2', question: null, selectionRequestId: null });
  await h.call('chooseType', 'user2', { type: 'brand' });
  assert.ok(![first.image, second.image].includes(h.match().state.question.image));
});

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

test('host lobby gets unique short team codes that resolve to the right team', async () => {
  const h = harness();
  h.match().status = 'lobby';
  h.match().expiresAt = 999999;
  h.data.matchAccess.A234.teamKeys = { 'A234-1': 'SECRET11', 'A234-2': 'SECRET22' };
  const invites = await h.call('getTeamInvites', 'host');
  const codes = Object.values(invites.shortTeamCodes);
  assert.equal(new Set(codes).size, 2);
  for (const value of codes) assert.match(value, /^[A-Z][0-9]{3}$/);
  for (const [teamCode, shortCode] of Object.entries(invites.shortTeamCodes)) {
    const result = await h.call('resolveTeamCode', 'guest', { shortCode });
    assert.equal(result.teamCode, teamCode);
    assert.equal(result.inviteKey, h.data.matchAccess.A234.teamKeys[teamCode]);
  }
  const again = await h.call('getTeamInvites', 'host');
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

test('rotation retains eleven consumed games and does not recycle an unfinished section', async () => {
  const h = harness(true);
  const pool = Array.from({ length: 45 }, (_, id) => ({ id, type: 'image', image: `/image-${id}.svg`, question: `flag ${id}`, options: ['a', 'b'], answer: 0 }));
  const recent = [];
  for (let game = 0; game < 35; game++) {
    const draw = await h.helpers.rotateQuestion(pool, `game${game}`, 'host');
    assert.equal(draw.reused, false);
    assert.ok(!recent.includes(draw.question.id));
    recent.push(draw.question.id);
  }
  assert.equal(h.data.questionRotation.host.games.length, 11);
});

test('rotation identifies same image/text despite different question ids and reports bank shortage', async () => {
  const h = harness();
  const a = { id: 1, type: 'acting', question: 'المثل نفسه', options: [], answer: 0 };
  const b = { ...a, id: 2, question: '  المثل   نفسه  ' };
  await h.helpers.rotateQuestion([a], 'one', 'host');
  await assert.rejects(h.helpers.rotateQuestion([b], 'two', 'host'), /10/);
  for (let game = 2; game <= 16; game++) await h.helpers.registerRotationMatch('host', `empty${game}`);
  await assert.rejects(h.helpers.rotateQuestion([b], 'empty16', 'host'), /10/);
  for (let game = 1; game <= 10; game++) await h.helpers.rotateQuestion([{ ...a, id: 990000 + game, type: 'ct_age', question: `age ${game}` }], `consumed${game}`, 'host');
  const next = await h.helpers.rotateQuestion([b], 'consumed11', 'host');
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

test('a non-swap card cannot spend balance or modify a replaced question after validation', async () => {
  const { h } = ordinaryAnswerFixture();
  Object.assign(h.match(), { timer: 30, questionsPerTeam: 8 });
  Object.assign(h.match().state, { questionStartedAt: 1000, questionDuration: 30 });
  Object.assign(h.match().teams['A234-1'], { cardBalance: 1000, powerCards: { extraTime: true } });
  let reads = 0;
  h.afterRead((path) => {
    if (path !== 'matches/A234' || ++reads !== 2) return;
    h.afterRead(null);
    h.match().state.question.id = 43;
    h.match().state.revision += 1;
  });
  const result = await h.call('usePowerCard', 'user1', { teamCode: 'A234-1', card: 'extraTime' });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'stale');
  assert.equal(h.match().teams['A234-1'].cardBalance, 1000);
  assert.equal(h.match().teams['A234-1'].powerCards.extraTime, true);
  assert.equal(h.match().state.extraTimeUsed, undefined);
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
  const options = { teamNames: ['ألف', 'باء'], enabledTypes: ['multiple_choice'], difficulty: 'easy', questionsPerTeam: 1 };
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

test('admin inventory counts exactly the playable bank and explains deletion/exclusion differences', async () => {
  const h = harness();
  const base = await h.adminCall('getAdminQuestions');
  const builtin = base.questions.filter((q) => q.type === 'multiple_choice' && !q.disabled && !q.custom);
  assert.equal(builtin.length, 743);
  h.data.questionDeletions = Object.fromEntries(builtin.slice(0, 10).map((q) => [q.id, true]));
  h.data.questionExclusions = Object.fromEntries(builtin.slice(10, 16).map((q) => [q.id, true]));
  // A deleted and excluded marker must not subtract the same question twice.
  h.data.questionExclusions[builtin[0].id] = true;
  const catalog = await h.adminCall('getAdminQuestions');
  const counts = catalog.inventory.multiple_choice;
  assert.equal(counts.builtin, 793);
  assert.equal(counts.legacyDisabled, 50);
  assert.equal(counts.deleted, 10);
  assert.equal(counts.excluded, 6);
  assert.equal(counts.available, 727);
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
  assert.equal(catalog.inventory.multiple_choice.available, 744);
  await h.adminCall('deleteAdminQuestions', { ids: [900001] });
  catalog = await h.adminCall('getAdminQuestions');
  assert.equal(catalog.inventory.multiple_choice.customAvailable, 0);
  assert.equal(catalog.inventory.multiple_choice.available, 743);
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

test('owner contract: every section traverses its entire pool before reuse across new games', async () => {
  const h = harness(true, true);
  const pool = Array.from({ length: 30 }, (_, id) => ({ id: 980000 + id, type: 'ct_cycle', question: `cycle question ${id}`, options: ['a', 'b'], answer: 0 }));
  const seen = new Set();
  for (let i = 0; i < pool.length; i++) {
    const { question } = await h.helpers.rotateQuestion(pool, `cycle-game-${i}`, 'host', pool);
    assert.equal(seen.has(question.id), false, `repeated before exhaustion at draw ${i}`);
    seen.add(question.id);
  }
  assert.equal(seen.size, pool.length);
});

test('owner contract: recent protection includes g10 and ends at g11 only after exhaustion', async () => {
  const h = harness(true, true);
  const pool = Array.from({ length: 11 }, (_, id) => ({ id: 981000 + id, type: 'ct_boundary', question: `boundary ${id}`, options: ['a', 'b'], answer: 0 }));
  const first = (await h.helpers.rotateQuestion(pool, 'g0', 'host', pool)).question;
  for (let i = 1; i <= 10; i++) {
    await assert.rejects(h.helpers.rotateQuestion([first], `g${i}`, 'host', pool), { code: 'resource-exhausted' });
    await h.helpers.rotateQuestion(pool, `g${i}`, 'host', pool);
  }
  const reused = await h.helpers.rotateQuestion([first], 'g11', 'host', pool);
  assert.equal(reused.question.id, first.id);
  assert.equal(reused.reused, true);
});

test('owner contract: flags cannot recycle recent assets even after their cycle is exhausted', async () => {
  const h = harness(true, true);
  const flags = (await h.helpers.questionBank()).filter((q) => q.type === 'flag' && !q.disabled).slice(0, 3);
  for (let i = 0; i < flags.length; i++) await h.helpers.rotateQuestion(flags, `flag-small-${i}`, 'host', flags);
  await assert.rejects(h.helpers.rotateQuestion(flags, 'flag-small-3', 'host', flags), { code: 'resource-exhausted' });
});

test('owner contract: empty competitions cannot age protection or discard cycle metadata', async () => {
  const h = harness(true, true);
  const pool = Array.from({ length: 20 }, (_, id) => ({ id: 982000 + id, type: 'ct_empty', question: `empty ${id}`, options: ['a', 'b'], answer: 0 }));
  const first = (await h.helpers.rotateQuestion(pool, 'consumed', 'host', pool)).question;
  const before = JSON.stringify(h.data.questionRotation.host);
  for (let i = 0; i < 20; i++) await h.helpers.registerRotationMatch('host', `lobby-${i}`);
  assert.equal(JSON.stringify(h.data.questionRotation.host), before);
  await assert.rejects(h.helpers.rotateQuestion([first], 'next-consumed', 'host', pool), { code: 'resource-exhausted' });
});

test('owner contract: migration keeps legacy text cycles and separate flag usage without deleting records', async () => {
  const h = harness(true, true);
  const pool = Array.from({ length: 20 }, (_, id) => ({ id: 983000 + id, type: 'ct_migrate', question: `legacy ${id}`, options: ['a', 'b'], answer: 0 }));
  const first = pool[0];
  const legacy = { games: [{ id: 'old-used', assets: [h.helpers.rotationAssetKey(first)] }], unrelated: 'keep' };
  h.data.questionRotation = { host: structuredClone(legacy) };
  // Age recent protection using other sections; the old section cycle must survive.
  for (let i = 0; i < 11; i++) await h.helpers.rotateQuestion([{ id: 984000 + i, type: 'ct_other', question: `other ${i}`, options: ['a', 'b'], answer: 0 }], `age-${i}`, 'host');
  await assert.rejects(h.helpers.rotateQuestion([first], 'new', 'host', pool), { code: 'resource-exhausted' });
  assert.equal(h.data.questionRotation.host.unrelated, 'keep');
  const flags = (await h.helpers.questionBank()).filter((q) => q.type === 'flag' && !q.disabled).slice(0, 3);
  const oldFlags = { cycle: 7, used: flags.slice(0, 2).map(h.helpers.rotationAssetKey) };
  h.data.flagRotation = { v1: { host: structuredClone(oldFlags) } };
  const selected = await h.helpers.rotateQuestion(flags, 'new-flag', 'host', flags);
  assert.equal(selected.question.id, flags[2].id);
  assert.equal(JSON.stringify(h.data.flagRotation.v1.host), JSON.stringify(oldFlags), 'legacy flag node is preserved');
});

test('owner contract: mixed showdown draws share per-section cycles with ordinary draws', async () => {
  const h = harness(true, true);
  const a = { id: 985001, type: 'ct_mixed_a', question: 'mixed a1', options: ['a', 'b'], answer: 0 };
  const b = { ...a, id: 985002, question: 'mixed a2' };
  const c = { ...a, id: 985003, type: 'ct_mixed_b', question: 'mixed b' };
  await h.helpers.rotateQuestion([a], 'start', 'host', [a, b, c]);
  for (let i = 0; i < 11; i++) await h.helpers.rotateQuestion([{ ...c, id: 986000 + i, question: `age mixed ${i}` }], `mixed-age-${i}`, 'host');
  await h.helpers.rotateQuestion([c], 'mixed-final', 'host', [a, b, c]);
  await assert.rejects(h.helpers.rotateQuestion([c, a], 'mixed-final', 'host', [a, b, c]), { code: 'resource-exhausted' }, 'mixed pool cannot bypass unfinished a section');
});

test('owner contract: concurrent lost-response retries reserve once and replay identical shuffled content', async () => {
  const h = harness(true);
  const pool = Array.from({ length: 12 }, (_, id) => ({ id: 987000 + id, type: 'ct_retry', question: `retry ${id}`, options: ['a', 'b', 'c', 'd'], answer: 2 }));
  const draws = await Promise.all(Array.from({ length: 5 }, () => h.helpers.rotateQuestion(pool, 'retry-game', 'host', pool, 'selection-1')));
  assert.equal(new Set(draws.map((draw) => JSON.stringify(draw))).size, 1);
  assert.equal(h.data.questionRotation.host.games[0].assets.length, 1);
  const replay = await h.helpers.rotateQuestion(pool, 'retry-game', 'host', pool, 'selection-1');
  assert.equal(JSON.stringify(replay), JSON.stringify(draws[0]));
  const next = await h.helpers.rotateQuestion(pool, 'retry-game', 'host', pool, 'selection-2');
  assert.notEqual(next.question.id, replay.question.id);
});

test('owner contract: editorial families also exclude image variants, not only identical URLs', async () => {
  const h = harness(true);
  const a = { id: 988001, type: 'image', question: 'photo one', image: '/qa-one.webp', conceptId: 'qa-same-landmark', options: ['a', 'b'], answer: 0 };
  const b = { ...a, id: 988002, question: 'photo two', image: '/qa-two.webp' };
  await h.helpers.rotateQuestion([a], 'photo-first', 'host', [a, b]);
  await assert.rejects(h.helpers.rotateQuestion([b], 'photo-next', 'host', [a, b]), { code: 'resource-exhausted' });
});

test('owner contract: unknown legacy flag dates receive a conservative ten consumed-game quarantine', async () => {
  const h = harness(true, true);
  const flag = (await h.helpers.questionBank()).find((q) => q.type === 'flag' && !q.disabled);
  h.data.flagRotation = { v1: { host: { cycle: 4, used: [h.helpers.rotationAssetKey(flag)] } } };
  // Existing text history must not push the undated legacy flag import out of the window.
  h.data.questionRotation = { host: { games: Array.from({ length: 15 }, (_, i) => ({ id: `legacy-${i}`, assets: [`old-${i}`] })) } };
  await assert.rejects(h.helpers.rotateQuestion([flag], 'flag-too-early', 'host', [flag]), { code: 'resource-exhausted' });
  for (let i = 1; i <= 10; i++) {
    const q = { id: 989000 + i, type: 'ct_flag_age', question: `flag aging ${i}`, options: ['a', 'b'], answer: 0 };
    await h.helpers.rotateQuestion([q], `flag-age-${i}`, 'host', [q]);
    if (i < 10) await assert.rejects(h.helpers.rotateQuestion([flag], `flag-probe-${i}`, 'host', [flag]), { code: 'resource-exhausted' });
  }
  assert.equal((await h.helpers.rotateQuestion([flag], 'flag-safe', 'host', [flag])).question.id, flag.id);
});

test('owner contract: all ten active built-in types traverse their editorial assets before reuse', async () => {
  const base = harness(true, true);
  const bank = (await base.helpers.questionBank()).filter((q) => !q.disabled);
  const types = [...new Set(bank.map((q) => q.type))];
  assert.equal(types.length, 10);
  for (const type of types) {
    const h = harness(true, true);
    const pool = bank.filter((q) => q.type === type);
    const key = (q) => q.conceptId || q.image || h.helpers.rotationAssetKey(q);
    const count = new Set(pool.map(key)).size;
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const draw = await h.helpers.rotateQuestion(pool, `${type}-${i}`, `host-${type}`, bank);
      assert.equal(seen.has(key(draw.question)), false, `${type}: duplicate at ${i}`);
      seen.add(key(draw.question));
    }
    assert.equal(seen.size, count, type);
  }
});

test('owner contract: disabled, restored and newly added bank items do not reset valid cycle usage', async () => {
  const h = harness(true, true);
  const q = (i) => ({ id: 991000 + i, type: 'ct_version', question: `version ${i}`, options: ['a', 'b'], answer: 0 });
  const bank = [q(0), q(1), q(2)];
  await h.helpers.rotateQuestion([bank[0]], 'version-g0', 'host', bank);
  for (let i = 1; i <= 11; i++) await h.helpers.rotateQuestion([{ ...q(i + 10), type: 'ct_version_age' }], `version-age-${i}`, 'host');
  const changed = [bank[0], { ...bank[1], disabled: true }, bank[2], q(3)];
  assert.equal((await h.helpers.rotateQuestion(changed, 'version-g1', 'host', changed)).question.id, bank[2].id);
  await assert.rejects(h.helpers.rotateQuestion([bank[0]], 'version-g2', 'host', changed), { code: 'resource-exhausted' });
  const restored = [bank[0], bank[1], bank[2], q(3)];
  assert.equal((await h.helpers.rotateQuestion(restored, 'version-g3', 'host', restored)).question.id, bank[1].id);
});

test('owner contract: creation preflight rejects a section whose effective history capacity is insufficient', async () => {
  const h = harness(true, true);
  const bank = (await h.helpers.questionBank()).filter((q) => q.type === 'brand' && !q.disabled);
  h.data.questionRotation = { host: { games: [{ id: 'recent-brands', assets: bank.map(h.helpers.rotationAssetKey) }] } };
  const before = JSON.stringify(h.data.questionRotation.host);
  await assert.rejects(h.helpers.createMatch('host', { teamNames: ['Hermes QA One', 'Hermes QA Two'], enabledTypes: ['brand'], questionsPerTeam: 4 }), { code: 'failed-precondition' });
  assert.equal(JSON.stringify(h.data.questionRotation.host), before, 'preflight does not consume or clear history');
  assert.equal(Object.keys(h.data.matches).length, 1, 'no new lobby written');
});

test('owner contract: start rechecks effective capacity after another competition consumed the section', async () => {
  const h = harness(true);
  Object.assign(h.match(), { status: 'lobby', answerMode: 'host', enabledTypes: ['brand'], questionsPerTeam: 4, totalRounds: 8 });
  h.match().state.phase = 'lobby';
  const bank = (await h.helpers.questionBank()).filter((q) => q.type === 'brand' && !q.disabled);
  h.data.questionRotation = { host: { games: [{ id: 'consumed-after-lobby', assets: bank.map(h.helpers.rotationAssetKey) }] } };
  const history = JSON.stringify(h.data.questionRotation.host);
  await assert.rejects(h.call('startMatch', 'host', { firstTeamCode: 'A234-1' }), { code: 'failed-precondition' });
  assert.equal(h.match().status, 'lobby');
  assert.equal(JSON.stringify(h.data.questionRotation.host), history);
});

test('start cannot revive a lobby ended after the initial room read', async () => {
  const h = harness(true);
  Object.assign(h.match(), { status: 'lobby', answerMode: 'host', enabledTypes: ['multiple_choice'], questionsPerTeam: 4, totalRounds: 8 });
  h.match().state.phase = 'lobby';
  h.afterRead((path) => {
    if (path !== 'matches/A234') return;
    h.afterRead(null);
    h.match().status = 'ended'; h.match().state.phase = 'ended';
  });
  await assert.rejects(h.call('startMatch', 'host', { firstTeamCode: 'A234-1' }), { code: 'failed-precondition' });
  assert.equal(h.match().status, 'ended');
});

test('owner contract: an exhausted section cannot trap a team behind the section cooldown', () => {
  const h = harness(true);
  const match = { enabledTypes: ['ct_a', 'ct_b'], questionsPerTeam: 8, totalRounds: 16, teamOrder: ['one', 'two'], sectionCycleByTeam: { one: { number: 1, used: ['ct_a'] } }, rotationBlocked: { one: { ct_b: { bank: true } } } };
  assert.equal(h.helpers.sectionCycle(match, 'one').used.includes('ct_a'), false);
  const file = readFileSync(new URL('../src/lib/matchApi.ts', import.meta.url), 'utf8');
  const block = file.slice(file.indexOf('export function sectionCycleProgress'), file.indexOf('export async function chooseType'));
  const client = {};
  runInNewContext(ts.transpileModule(block, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: client });
  assert.equal(client.sectionCycleProgress(match, 'one').used.includes('ct_a'), false);
  assert.equal(client.sectionCycleProgress(match, 'one').remaining, 1);
});

test('owner contract: reservation retries preserve empty acting choices after RTDB array pruning', async () => {
  const h = harness(true);
  const q = { id: 992001, type: 'acting', question: 'act this', options: [], answer: 0 };
  const first = await h.helpers.rotateQuestion([q], 'acting-retry', 'host', [q], 'acting-selection');
  const replay = await h.helpers.rotateQuestion([q], 'acting-retry', 'host', [q], 'acting-selection');
  assert.ok(Array.isArray(first.question.options));
  assert.equal(first.question.options.length, 0);
  assert.equal(JSON.stringify(first), JSON.stringify(replay));
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
  assert.equal(h.data.questionRotation.host.cycles.flag.number, 2);
});

test('concurrent flag draws cannot give two teams the same flag and owners rotate independently', async () => {
  const h = harness(true);
  const flags = (await h.helpers.questionBank()).filter((q) => q.type === 'flag' && !q.disabled);
  const draws = await Promise.all(Array.from({ length: 8 }, (_, i) => h.helpers.rotateQuestion(flags, `game-${i}`, 'host', flags)));
  assert.equal(new Set(draws.map((draw) => draw.question.image)).size, 8);
  await h.helpers.rotateQuestion(flags, 'other-game', 'other-host', flags);
  assert.equal(h.data.questionRotation['other-host'].cycles.flag.used.length, 1);
  assert.equal(h.data.questionRotation.host.cycles.flag.used.length, 8);
});

test('flag rotation cannot reset early when the remaining flags are unavailable in this match', async () => {
  const h = harness(true);
  const flags = (await h.helpers.questionBank()).filter((q) => q.type === 'flag' && !q.disabled).slice(0, 3);
  const first = await h.helpers.rotateQuestion(flags, 'first', 'host', flags);
  await assert.rejects(h.helpers.rotateQuestion([first.question], 'first', 'host', flags), { code: 'resource-exhausted' });
  assert.equal(h.data.questionRotation.host.cycles.flag.number, 1);
  const second = await h.helpers.rotateQuestion(flags, 'first', 'host', flags);
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
