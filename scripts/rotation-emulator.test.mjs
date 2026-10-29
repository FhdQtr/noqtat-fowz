import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { after, test } from 'node:test';

// Real Admin SDK transactions, exclusively against the loopback demo namespace.
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9000');
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const exports = {};
runInNewContext(readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8') + '\nexports.rotationTests = { rotateQuestion, rotationAssetKey };', {
  require, exports, Buffer, console,
  process: { env: { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-al-midan', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' } },
});
const { rotateQuestion, rotationAssetKey } = exports.rotationTests;
const { getDatabase } = require('firebase-admin/database');
const { getApp, deleteApp } = require('firebase-admin/app');
const db = getDatabase();
after(async () => { await deleteApp(getApp()); });
const host = () => `Hermes-QA-${randomUUID()}`;
const question = (id, type = 'multiple_choice', extra = {}) => ({ id, type, question: `Emulator fixture ${id}`, options: ['A', 'B', 'C', 'D'], answer: 1, ...extra });
const read = async (owner) => (await db.ref(`questionRotation/${owner}`).get()).val();

test('real RTDB preserves exhaustion AND all ten intervening consumed-competition boundaries', async () => {
  const owner = host(), pool = [1,2,3].map((id) => question(id));
  const fillers = Array.from({ length: 10 }, (_, i) => question(100+i, 'true_false'));
  const bank = [...pool, ...fillers];
  const used = [];
  for (let i = 0; i < pool.length; i++) used.push((await rotateQuestion(pool, 'g0', owner, bank, `draw-${i}`)).question.id);
  assert.equal(new Set(used).size, pool.length, 'full section traversed without replacement');
  await assert.rejects(rotateQuestion(pool, 'g0', owner, bank, 'same-match-exhausted'), { code: 'resource-exhausted' });
  for (let n = 1; n <= 10; n++) {
    await assert.rejects(rotateQuestion(pool, `g${n}`, owner, bank, `blocked-${n}`), { code: 'resource-exhausted' }, `g${n} must not recycle g0`);
    await rotateQuestion([fillers[n-1]], `g${n}`, owner, bank, `filler-${n}`);
  }
  const permitted = await rotateQuestion(pool, 'g11', owner, bank, 'after-ten');
  assert.ok(used.includes(permitted.question.id));
  assert.equal(permitted.reused, true);
  assert.equal((await read(owner)).cycles.multiple_choice.number, 2);
});

test('real concurrent retry receipts return identical shuffled answers and consume one reservation', async () => {
  const owner = host(), pool = [10,11,12].map((id) => question(id));
  const replies = await Promise.all(Array.from({ length: 3 }, () => rotateQuestion(pool, 'g0', owner, pool, 'same-request')));
  for (const reply of replies) assert.deepEqual(JSON.parse(JSON.stringify(reply)), JSON.parse(JSON.stringify(replies[0])));
  const ledger = await read(owner);
  assert.equal(Object.keys(ledger.games[0].reservations).length, 1);
  assert.equal(ledger.games[0].assets.length, 1);
  const next = await Promise.all(['different-1','different-2'].map((id) => rotateQuestion(pool, 'g0', owner, pool, id)));
  assert.equal(new Set([replies[0], ...next].map((r) => r.question.id)).size, 3);
});

test('real persistent flags obey the same finite-cycle and recent-game restrictions', async () => {
  const owner = host(), pool = [20,21,22].map((id) => question(id, 'flag', { image: `/fixture/${id}.webp` }));
  const used = [];
  for (let i = 0; i < pool.length; i++) used.push((await rotateQuestion(pool, 'g0', owner, pool, `flag-${i}`)).question.id);
  assert.equal(new Set(used).size, 3);
  await assert.rejects(rotateQuestion(pool, 'g1', owner, pool, 'flags-exhausted'), { code: 'resource-exhausted' });
  const other = await rotateQuestion(pool, 'g1', host(), pool, 'separate-host');
  assert.ok(pool.some((q) => q.id === other.question.id));
});

test('real receipts restore empty acting choices after RTDB pruning and semantic/image aliases stay excluded', async () => {
  const owner = host();
  const acting = question(30, 'acting', { options: [], answer: -1 });
  const first = await rotateQuestion([acting], 'g0', owner, [acting], 'acting-request');
  const replay = await rotateQuestion([acting], 'g0', owner, [acting], 'acting-request');
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(replay)));
  assert.deepEqual(JSON.parse(JSON.stringify(replay.question.options)), []);
  const images = [question(31, 'image', { image: '/fixture/same.webp' }), question(32, 'image', { image: '/fixture/same.webp' })];
  await rotateQuestion(images, 'g1', owner, images, 'image-first');
  await assert.rejects(rotateQuestion(images, 'g2', owner, images, 'image-alias'), { code: 'resource-exhausted' });
  const concepts = [question(33, 'riddle', { conceptId: 'emulator-same-concept' }), question(34, 'riddle', { conceptId: 'emulator-same-concept' })];
  await rotateQuestion(concepts, 'g3', owner, concepts, 'concept-first');
  await assert.rejects(rotateQuestion(concepts, 'g4', owner, concepts, 'concept-alias'), { code: 'resource-exhausted' });
});

test('legacy15 and separate flag history migrate without deleting existing records', async () => {
  const owner = host(), pool = [40,41,42].map((id) => question(id));
  const games = Array.from({ length: 15 }, (_, i) => ({ id: `legacy-${i}`, assets: [i === 14 ? rotationAssetKey(pool[0]) : `old-${i}`] }));
  const flags = { cycle: 4, used: ['old-flag-key'] };
  await db.ref(`questionRotation/${owner}`).set({ games });
  await db.ref(`flagRotation/v1/${owner}`).set(flags);
  const next = await rotateQuestion(pool, 'new-game', owner, pool, 'new-selection');
  assert.notEqual(next.question.id, pool[0].id);
  const ledger = await read(owner);
  assert.equal(ledger.legacyGames.length, 15);
  assert.equal(ledger.policyVersion, 2);
  assert.deepEqual((await db.ref(`flagRotation/v1/${owner}`).get()).val(), flags);
  assert.deepEqual(ledger.flagMigration, flags);
});
