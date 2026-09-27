import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const realRequire = createRequire(new URL('../functions/index.js', import.meta.url));
const clone = (value) => JSON.parse(JSON.stringify(value));

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
function harness(firebaseEmptyNodes = false) {
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
    get: async () => { const snap = snapshot(read(path)); afterRead?.(); return snap; },
    set: async (value) => write(path, value),
    remove: async () => write(path, null),
    update: async (values) => { for (const [key, value] of Object.entries(values)) write(`${path}/${key}`, value); },
    transaction: async (update) => {
      beforeTransaction?.();
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
    if (name === 'firebase-functions/v2/https') return { onCall: (_, fn) => fn, HttpsError };
    if (name === 'firebase-functions/v2/scheduler') return { onSchedule: (_, fn) => fn };
    if (name === 'firebase-admin/app') return { initializeApp: () => {} };
    if (name === 'firebase-admin/database') return { getDatabase: () => ({ ref }), ServerValue: {} };
    return realRequire(name);
  };
  mockedRequire.resolve = realRequire.resolve;
  const exports = {};
  runInNewContext(source, { require: mockedRequire, exports, Buffer, process: { env: {} },
    Date: class extends Date { static now() { return clock; } }, console });
  const call = (action, uid = 'host', extra = {}) => exports.gameAction({ auth: { uid }, rawRequest: { ip: '192.0.2.1' }, data: { action, matchCode: 'A234', ...extra } });
  return { data, call, match: () => data.matches.A234,
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
