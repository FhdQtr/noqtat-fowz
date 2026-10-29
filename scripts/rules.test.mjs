import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { get, ref, set } from 'firebase/database';

// No fallback to a real project or production endpoint is permitted.
const projectId = 'demo-al-midan';
const endpoint = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.equal(endpoint, '127.0.0.1:9000', 'Run with the isolated loopback database emulator');
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId, database: {
    host: '127.0.0.1', port: 9000,
    rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
  } });
  await env.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), 'matches/Q234'), {
      status: 'playing', state: { phase: 'question', question: { id: 42 } },
      players: { p1: { name: 'Hermes QA' } },
    });
    await set(ref(context.database(), 'matchAccess/Q234'), { hostUid: 'host', playerUids: { p1: 'player-one' } });
  });
});
after(async () => { await env?.cleanup(); });

const presence = (uid = 'player-one') => ref(env.authenticatedContext(uid).database(), 'matches/Q234/questionWatch/p1');

test('presence rejects unknown children rather than broadcasting arbitrary payloads', async () => {
  await assertFails(set(presence(), { questionId: 42, status: 'active', extra: 'unexpected' }));
});

test('presence permits the owning player and never other players or unauthenticated guests', async () => {
  await assertSucceeds(set(presence(), { questionId: 42, status: 'active' }));
  await assertSucceeds(set(presence(), { questionId: 42, status: 'away', awayAt: Date.now() }));
  await assertFails(set(presence('other'), { questionId: 42, status: 'active' }));
  await assertFails(set(ref(env.unauthenticatedContext().database(), 'matches/Q234/questionWatch/p1'), { questionId: 42, status: 'active' }));
});

test('presence rejects stale questions, invalid status and malformed timestamp', async () => {
  for (const value of [
    { questionId: 41, status: 'active' }, { questionId: 42, status: 'hello' },
    { questionId: 42, status: 'away', awayAt: 'now' },
  ]) await assertFails(set(presence(), value));
});

test('presence bounds timestamps and rejects nested or oversized values', async () => {
  for (const awayAt of [-1, Date.now() + 120000, { nested: true }]) {
    await assertFails(set(presence(), { questionId: 42, status: 'away', awayAt }));
  }
  await assertFails(set(presence(), { questionId: { id: 42 }, status: 'active' }));
  await assertFails(set(presence(), { questionId: 42, status: { value: 'active' } }));
});

test('public TV can read an issued room but never enumerate rooms or read secrets', async () => {
  const db = env.authenticatedContext('tv').database();
  await assertSucceeds(get(ref(db, 'matches/Q234')));
  for (const path of ['matches', 'matchAccess/Q234', 'matchSecrets/Q234', 'questionRotation/host', 'customQuestions']) {
    await assertFails(get(ref(db, path)));
  }
});

test('ordinary authenticated users cannot mutate gameplay state or custom bank', async () => {
  const db = env.authenticatedContext('player-one').database();
  for (const path of ['matches/Q234/state', 'matches/Q234/teams', 'matchAccess/Q234', 'questionRotation/host', 'customQuestions/123']) {
    await assertFails(set(ref(db, path), { invalid: true }));
  }
});
