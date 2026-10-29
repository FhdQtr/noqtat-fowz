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
let clock = Date.now();
runInNewContext(readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8') + '\nexports.rotationTests = { rotateQuestion, rotationAssetKey, settleRotationReservations, rotationPublicationAllowed, recordRotationPublication };', {
  require, exports, Buffer, console,
  Date: class extends Date { static now() { return clock; } },
  process: { env: { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-al-midan', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' } },
});
const { rotateQuestion, rotationAssetKey, settleRotationReservations, rotationPublicationAllowed, recordRotationPublication } = exports.rotationTests;
const { getDatabase } = require('firebase-admin/database');
const { getApp, deleteApp } = require('firebase-admin/app');
const db = getDatabase();
after(async () => { await deleteApp(getApp()); });
const host = () => `Hermes-QA-${randomUUID()}`;
const question = (id, type = 'multiple_choice', extra = {}) => ({ id, type, question: `Emulator fixture ${id}`, options: ['A', 'B', 'C', 'D'], answer: 1, ...extra });
const read = async (owner) => (await db.ref(`questionRotation/${owner}`).get()).val();
const room = async () => {
  const id = `Hermes-QA-room-${randomUUID()}`;
  await db.ref(`matches/${id}`).set({ status: 'playing' });
  return id;
};
const publish = async (id, draw) => db.ref(`matches/${id}`).transaction((current) => {
  if (!current) return current;
  if (current.status !== 'playing' || !rotationPublicationAllowed(current, draw.reservation)) return;
  recordRotationPublication(current, draw.reservation);
  return current;
}, undefined, false);

test('pending RTDB reservations hold distinct inventory without aging games; crash-after-publication recovers exactly once', async () => {
  const owner = host(), id = await room(), pool = [51,52,53].map((n) => question(n));
  const same = await Promise.all([1,2,3].map(() => rotateQuestion(pool, 'g0', owner, pool, 'same-pending', false, id)));
  assert.deepEqual(JSON.parse(JSON.stringify(same[0])), JSON.parse(JSON.stringify(same[1])));
  assert.deepEqual(JSON.parse(JSON.stringify(same[1])), JSON.parse(JSON.stringify(same[2])));
  const others = await Promise.all(['pull-a','pull-b'].map((request) => rotateQuestion(pool, 'g0', owner, pool, request, false, id)));
  assert.equal(new Set([same[0], ...others].map((item) => item.question.id)).size, 3);
  let ledger = await read(owner);
  assert.equal(Object.values(ledger.games || {}).length, 0);
  assert.equal(Object.values(ledger.cycles || {}).length, 0);
  assert.equal(Object.keys(ledger.pending).length, 3);
  await assert.rejects(rotateQuestion(pool, 'other-game', owner, pool, 'no-capacity', false, await room()), { code: 'unavailable' });
  assert.equal((await publish(id, same[0])).committed, true);
  // The response/finalization is deliberately lost after the durable room commit.
  await Promise.all([settleRotationReservations(owner), settleRotationReservations(owner)]);
  ledger = await read(owner);
  assert.equal(ledger.games.length, 1);
  assert.equal(Object.keys(ledger.games[0].reservations).length, 1);
  for (const item of others) assert.equal((await publish(id, item)).committed, true);
  await settleRotationReservations(owner);
  ledger = await read(owner);
  assert.equal(ledger.games[0].assets.length, 3);
  assert.equal(ledger.cycles.multiple_choice.used.length, 3);
  assert.equal(Object.keys(ledger.pending || {}).length, 0);
});

test('expired unshown RTDB preparation fences delayed publication and supports a new generation of the same request', async () => {
  const owner = host(), id = await room(), pool = [question(54, 'flag', { image: '/fixture/54.webp' })];
  const first = await rotateQuestion(pool, 'g0', owner, pool, 'crashed', false, id);
  clock += 30001;
  await Promise.all([settleRotationReservations(owner), settleRotationReservations(owner)]);
  assert.equal((await publish(id, first)).committed, false);
  assert.equal((await db.ref(`matches/${id}/rotationPublications/${first.reservation.key}`).get()).val(), 'cancelled');
  let ledger = await read(owner);
  assert.equal(Object.values(ledger.games || {}).length, 0);
  assert.equal(Object.values(ledger.cycles || {}).length, 0);
  const next = await rotateQuestion(pool, 'g0', owner, pool, 'crashed', false, id);
  assert.notEqual(next.reservation.key, first.reservation.key);
  assert.equal(next.question.id, first.question.id);
  assert.equal((await publish(id, next)).committed, true);
  await settleRotationReservations(owner);
  ledger = await read(owner);
  assert.equal(ledger.games.length, 1);
  assert.equal(ledger.games[0].assets.length, 1);
});

test('pending/publication path enforces complete exhaustion and g1 through g10 exclusion, earliest g11', async () => {
  const owner = host(), id = await room(), pool = [61,62,63].map((n) => question(n, 'flag', { image: `/fixture/${n}.webp` }));
  const fillers = Array.from({ length: 10 }, (_, i) => question(200+i, 'true_false'));
  const bank = [...pool, ...fillers], used = [];
  const consume = async (candidates, game, request) => {
    const next = await rotateQuestion(candidates, game, owner, bank, request, false, id);
    assert.equal((await publish(id, next)).committed, true);
    await settleRotationReservations(owner);
    return next;
  };
  for (let i = 0; i < pool.length; i++) used.push((await consume(pool, 'g0', `draw-${i}`)).question.id);
  assert.equal(new Set(used).size, 3);
  for (let n = 1; n <= 10; n++) {
    await assert.rejects(rotateQuestion(pool, `g${n}`, owner, bank, `blocked-${n}`, false, id), { code: 'resource-exhausted' });
    await consume([fillers[n-1]], `g${n}`, `filler-${n}`);
  }
  const permitted = await consume(pool, 'g11', 'eligible');
  assert.equal(permitted.reused, true);
  assert.ok(used.includes(permitted.question.id));
  assert.equal((await read(owner)).cycles.flag.number, 2);
});

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
