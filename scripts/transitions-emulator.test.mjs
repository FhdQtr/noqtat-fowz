import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { after, test } from 'node:test';

// Actual RTDB transactions; callable auth/rate envelope is supplied by this fixture.
// Full HTTP callable + anonymous auth is separately exercised by the browser journey.
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9000');
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const exports = {};
const wrappedRequire = (name) => {
  if (name === 'firebase-functions/v2/https') return { ...require(name), onCall: (_, handler) => handler };
  if (name === 'firebase-functions/v2/scheduler') return { onSchedule: (_, handler) => handler };
  return require(name);
};
wrappedRequire.resolve = require.resolve;
runInNewContext(readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8'), {
  require: wrappedRequire, exports, Buffer, console,
  process: { env: { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-al-midan', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' } },
});
const { getDatabase } = require('firebase-admin/database');
const { getApp, deleteApp } = require('firebase-admin/app');
const db = getDatabase();
after(async () => { await deleteApp(getApp()); });
const clone = (v) => JSON.parse(JSON.stringify(v));
let number = 220;
async function fixture() {
  const room = `Z${number++}`, uid = `Hermes-QA-${randomUUID()}`;
  const ref = db.ref(`matches/${room}`);
  const match = { status: 'playing', answerMode: 'anyone', timer: 30, totalRounds: 16, turnIndex: 0,
    teamOrder: ['A', 'B'], enabledTypes: ['multiple_choice'], questionsPerTeam: 8,
    teams: { A: { score: 100, cardBalance: 1000, powerCards: { extraTime: true } }, B: { score: 50 } },
    players: { p1: { id: 'p1', name: 'Hermes QA', teamCode: 'A' } },
    state: { phase: 'revealed', round: 1, revision: 4, questionValue: 50, targetTeam: 'A', passCount: 0, selectionRequestId: 'selected', isCorrect: false,
      question: { id: 42, type: 'multiple_choice', question: 'Hermes QA fixture', options: ['A', 'B', 'C', 'D'], answer: -1 } } };
  await ref.set(match);
  await db.ref(`matchAccess/${room}`).set({ hostUid: uid, playerUids: { p1: uid } });
  await db.ref(`matchSecrets/${room}`).set({ questionId: 42, answer: 3 });
  const read = async () => (await ref.get()).val();
  const context = (state, requestId = randomUUID()) => ({ questionId: state.question?.id ?? null, phase: state.phase, round: state.round || 0,
    attemptId: `${state.round || 0}:${state.targetTeam || ''}:${state.passCount || 0}:${state.selectionRequestId || ''}`, revision: state.revision || 0, requestId });
  const call = (action, transition, extra = {}) => exports.gameAction({ auth: { uid }, rawRequest: { ip: '192.0.2.99' }, data: { action, matchCode: room, transition, ...extra } });
  return { ref, match, read, context, call };
}

test('real concurrent pass requests commit one attempt and replay a lost response immutably', async () => {
  const f = await fixture(), t = f.context(f.match.state);
  const replies = await Promise.all(Array.from({ length: 3 }, () => f.call('passToNextTeam', t)));
  for (const r of replies) assert.equal(r.ok, true);
  const saved = await f.read();
  assert.equal(saved.state.passCount, 1);
  assert.equal(saved.state.targetTeam, 'B');
  assert.equal(saved.state.revision, 5);
  assert.deepEqual(clone(await f.call('passToNextTeam', t)), { ok: true });
  assert.deepEqual(await f.read(), saved);
  await assert.rejects(f.call('advanceTurn', t), { code: 'failed-precondition' });
  await assert.rejects(f.call('passToNextTeam', { ...t, round: 999 }), { code: 'failed-precondition' });
});

test('real concurrent ordinary advance requests move one turn and stale clients cannot advance again', async () => {
  const f = await fixture(), t = f.context(f.match.state);
  const replies = await Promise.all(Array.from({ length: 3 }, () => f.call('advanceTurn', t)));
  for (const r of replies) assert.equal(r.ended, false);
  const saved = await f.read();
  assert.equal(saved.turnIndex, 1);
  assert.equal(saved.state.phase, 'choose');
  assert.equal(saved.state.revision, 5);
  assert.deepEqual(clone(await f.call('advanceTurn', t)), { ended: false });
  assert.deepEqual(await f.read(), saved);
  await assert.rejects(f.call('advanceTurn', { ...t, requestId: randomUUID() }), { code: 'failed-precondition' });
});

test('real concurrent adjudication scores once and preserves immutable correction direction', async () => {
  const f = await fixture();
  await f.ref.child('state').update({ phase: 'question', isCorrect: null });
  const t = f.context((await f.read()).state);
  const replies = await Promise.all(Array.from({ length: 3 }, () => f.call('judgeVerbal', t, { correct: true })));
  for (const r of replies) assert.equal(r.correct, true);
  const saved = await f.read();
  assert.equal(saved.teams.A.score, 150);
  assert.equal(saved.teams.A.correctCount, 1);
  assert.equal(saved.state.phase, 'revealed');
  assert.equal(saved.state.revision, 5);
  await assert.rejects(f.call('judgeVerbal', t, { correct: false }), { code: 'failed-precondition' });
  assert.deepEqual(await f.read(), saved);
});
