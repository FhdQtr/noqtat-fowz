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
runInNewContext(readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8') + '\nexports.lifecycle = { cleanupMatchArtifacts, settleRotationReservations, publishShowdown };', {
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
  const call = (action, transition, extra = {}, callerUid = uid) => exports.gameAction({ auth: { uid: callerUid }, rawRequest: { ip: '192.0.2.99' }, data: { action, matchCode: room, transition, ...extra } });
  return { ref, match, read, context, call, uid };
}

test('real lifecycle cleanup preserves pending consumption and current private answer then compacts settled expiry', async () => {
  const f = await fixture(), past = Date.now() - 1000;
  const generation = randomUUID();
  await f.ref.update({ rotationPublications: { [generation]: 'published', legacy: 'cancelled' },
    rotationPublicationExpiries: { [generation]: past } });
  await f.ref.child('state/secretVersion').set('current');
  await db.ref(`matchSecrets/${f.ref.key}/versions`).set({
    current: { questionId: 42, answer: 3, stagingExpiresAt: past },
    orphan: { questionId: 99, answer: 1, stagingExpiresAt: past },
    picture: { questionId: 800001, mode: 'picture_guess', pictures: { A: { id: 'qa' } }, stagingExpiresAt: past },
    legacy: { questionId: 41, answer: 2 },
  });
  const ledger = db.ref(`questionRotation/${f.uid}`);
  await ledger.set({ policyVersion: 2, pending: { qa: { room: f.ref.key, publicationKey: generation, expiresAt: past,
    gameId: 'Hermes-QA-consumed', type: 'multiple_choice', cycleNumber: 1, assets: ['qa-asset'], baseUsed: [],
    receiptKey: 'qa-receipt', outcome: { id: 42 } } } });
  await Promise.all([exports.lifecycle.cleanupMatchArtifacts(f.ref.key, f.uid), exports.lifecycle.cleanupMatchArtifacts(f.ref.key, f.uid)]);
  assert.equal((await f.read()).rotationPublications[generation], 'published');
  const secrets = (await db.ref(`matchSecrets/${f.ref.key}`).get()).val();
  assert.equal(secrets.versions.orphan, undefined); assert.equal(secrets.versions.picture, undefined);
  assert.equal(secrets.versions.current.answer, 3); assert.equal(secrets.versions.legacy.answer, 2); assert.equal(secrets.answer, 3);
  assert.equal((await f.call('getHostAnswer')).answer, 3);
  await exports.lifecycle.settleRotationReservations(f.uid);
  await exports.lifecycle.cleanupMatchArtifacts(f.ref.key, f.uid);
  assert.equal((await f.read()).rotationPublications[generation], undefined);
  assert.equal((await f.read()).rotationPublications.legacy, 'cancelled');
  const settled = (await ledger.get()).val();
  assert.equal(settled.pending, undefined);
  assert.deepEqual(settled.games[0].assets, ['qa-asset']);
  assert.deepEqual(settled.cycles.multiple_choice.used, ['qa-asset']);
});

test('real late staging after room expiry is removed without recreating the room or private root', async () => {
  const f = await fixture();
  await f.ref.remove();
  await db.ref(`matchSecrets/${f.ref.key}`).remove();
  await db.ref(`matchSecrets/${f.ref.key}/versions/late`).set({ answer: 1, stagingExpiresAt: Date.now() + 30000 });
  await exports.lifecycle.cleanupMatchArtifacts(f.ref.key, f.uid);
  assert.equal((await f.ref.get()).exists(), false);
  assert.equal((await db.ref(`matchSecrets/${f.ref.key}`).get()).exists(), false);
});

test('real expired staged publication cannot replace the current context after cleanup', async () => {
  const f = await fixture(), before = await f.read();
  const reservation = { key: randomUUID(), expiresAt: Date.now() - 1000 };
  const result = await exports.lifecycle.publishShowdown(f.ref.key, { ...before, hostUid: f.uid },
    { ...before.state, phase: 'showdown' }, { questionId: 800001, mode: 'picture_guess', pictures: { A: { id: 'qa' } } },
    1, 'qa-obsolete-picture', reservation);
  assert.equal(result.showdown, false);
  assert.deepEqual((await f.read()).state, before.state);
  assert.deepEqual((await f.read()).teams, before.teams);
  assert.equal((await db.ref(`matchSecrets/${f.ref.key}/versions`).get()).exists(), false);
});

test('real punishment preparation isolates private versions, serializes drafts and replays deduction once', async () => {
  const f = await fixture();
  const actor = `${f.uid}-player`;
  await db.ref(`matchAccess/${f.ref.key}/playerUids/p1`).set(actor);
  await f.ref.update({ enabledTypes: ['punishment'] });
  await f.ref.child('state').set({ phase: 'choose', round: 0, revision: 0, targetTeam: 'A' });
  const pick = f.context((await f.read()).state);
  assert.equal((await f.call('chooseType', pick, { type: 'punishment', requestId: pick.requestId }, actor)).status, 'accepted');
  const before = await f.read();
  const secretRef = db.ref(`matchSecrets/${f.ref.key}`);
  const original = (await secretRef.get()).val();
  const transition = f.context(before.state);
  const draft = { questionId: before.state.question.id, targetTeam: 'B', prompt: 'Hermes QA punishment prompt', answerText: 'fixture private answer', mode: 'deduct' };
  const results = await Promise.allSettled([
    f.call('preparePunishment', transition, draft, actor),
    f.call('preparePunishment', transition, draft, actor),
  ]);
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  const prepared = await f.read();
  assert.equal(prepared.state.punishment.stage, 'answering');
  assert.equal(prepared.state.revision, before.state.revision + 1);
  assert.equal(prepared.state.punishmentLease ?? null, null);
  assert.equal(JSON.stringify(prepared).includes(draft.answerText), false);
  const root = (await secretRef.get()).val();
  assert.equal(root.answer, original.answer);
  assert.equal(Object.keys(root.versions).length, 1);
  assert.equal(root.versions[prepared.state.secretVersion].answerText, draft.answerText);
  assert.equal((await f.call('getHostAnswer')).answerText, draft.answerText);
  await assert.rejects(f.call('getHostAnswer', null, {}, actor), { code: 'permission-denied' });
  await f.call('preparePunishment', transition, draft, actor);
  assert.deepEqual(await f.read(), prepared);
  assert.deepEqual((await secretRef.get()).val(), root);
  await assert.rejects(f.call('preparePunishment', transition, { ...draft, answerText: 'altered answer' }, actor), { code: 'failed-precondition' });
  const judge = f.context(prepared.state), judgment = { questionId: draft.questionId, correct: false };
  await Promise.all([f.call('judgePunishment', judge, judgment), f.call('judgePunishment', judge, judgment)]);
  const judged = await f.read();
  assert.equal(judged.teams.B.score, -150);
  assert.equal(judged.state.revision, prepared.state.revision + 1);
  assert.equal(judged.state.punishment.stage, 'resolved');
  await f.call('judgePunishment', judge, judgment);
  assert.deepEqual(await f.read(), judged);
});

test('real punishment preparation recovers an expired executor but respects a live lease and ended-room fence', async () => {
  const f = await fixture(), actor = `${f.uid}-player`;
  await db.ref(`matchAccess/${f.ref.key}/playerUids/p1`).set(actor);
  await f.ref.update({ enabledTypes: ['punishment'] });
  await f.ref.child('state').set({ phase: 'choose', round: 0, revision: 0, targetTeam: 'A' });
  const pick = f.context((await f.read()).state);
  await f.call('chooseType', pick, { type: 'punishment', requestId: pick.requestId }, actor);
  const before = await f.read();
  const draft = { questionId: before.state.question.id, targetTeam: 'B', prompt: 'Hermes QA recovery prompt', answerText: 'private', mode: 'perform' };
  await f.ref.child('state/punishmentLease').set({ owner: 'crashed-owner', expiresAt: Date.now() + 30000 });
  await assert.rejects(f.call('preparePunishment', f.context(before.state), draft, actor), { code: 'failed-precondition' });
  assert.equal((await db.ref(`matchSecrets/${f.ref.key}/versions`).get()).val(), null);
  await f.ref.child('state/punishmentLease/expiresAt').set(Date.now() - 1);
  await f.call('preparePunishment', f.context(before.state), draft, actor);
  const prepared = await f.read();
  assert.equal(prepared.state.punishment.stage, 'answering');
  assert.notEqual(prepared.state.secretVersion, 'crashed-owner');
  await f.call('endMatch');
  const ended = await f.read();
  await assert.rejects(f.call('judgePunishment', f.context(ended.state), { questionId: draft.questionId, correct: false }), { code: 'failed-precondition' });
  assert.deepEqual(await f.read(), ended);
});

test('real capacity recheck pauses exhausted sections, replays concurrent retries and recovers without history deletion', async (t) => {
  const f = await fixture();
  const type = `ct_qa_${randomUUID().replaceAll('-', '')}`;
  const q = { id: 996201, type, category: 'custom', question: 'Hermes QA used capacity fixture', options: ['A','B','C','D'], answer: 0 };
  const q2 = { ...q, id: 996202, question: 'Hermes QA fresh capacity fixture' };
  t.after(async () => { await Promise.all([db.ref(`customQuestions/${q.id}`).remove(), db.ref(`customQuestions/${q2.id}`).remove()]); });
  const { createHash } = require('node:crypto');
  const key = createHash('sha256').update(`text:${q.question.toLowerCase()}`).digest('hex');
  const history = { policyVersion: 2, games: [{ id: 'prior-consumed', assets: [key] }], cycles: { [type]: { number: 1, used: [key] } } };
  await db.ref(`questionRotation/${f.uid}`).set(history);
  await db.ref(`customQuestions/${q.id}`).set(q);
  await f.ref.update({ enabledTypes: [type], typeCaps: { [type]: 4 } });
  await f.ref.child('state').set({ phase: 'choose', round: 0, targetTeam: 'A', revision: 0 });
  const transition = f.context((await f.read()).state);
  const results = await Promise.all([f.call('recheckSelectionCapacity', transition), f.call('recheckSelectionCapacity', transition)]);
  for (const r of results) assert.equal(r.available, false);
  const paused = await f.read();
  assert.equal(paused.state.selectionPause.reason, 'capacity');
  assert.equal(paused.state.revision, 1);
  assert.equal(paused.rotationBlocked.A[type].bank, true);
  assert.deepEqual((await db.ref(`questionRotation/${f.uid}`).get()).val(), history);
  assert.deepEqual(clone(await f.call('recheckSelectionCapacity', transition)), clone(results[0]));
  assert.deepEqual(await f.read(), paused);
  await db.ref(`customQuestions/${q2.id}`).set(q2);
  assert.equal((await f.call('recheckSelectionCapacity', f.context(paused.state))).available, true);
  const recovered = await f.read();
  assert.equal(recovered.state.selectionPause ?? null, null);
  assert.equal(recovered.rotationBlocked?.A?.[type]?.bank, undefined);
  assert.deepEqual((await db.ref(`questionRotation/${f.uid}`).get()).val(), history);
  const pick = f.context(recovered.state);
  await db.ref(`matchAccess/${f.ref.key}/playerUids/p1`).set(`${f.uid}-player`);
  assert.equal((await f.call('chooseType', pick, { type, requestId: pick.requestId }, `${f.uid}-player`)).status, 'accepted');
  assert.equal((await f.read()).state.question.id, q2.id);
});

test('real pure-empty marking cannot trap other sections or consume history', async () => {
  const f = await fixture();
  await f.ref.update({ enabledTypes: ['ct_qa_absent', 'brand'], typeCaps: { ct_qa_absent: 2, brand: 4 },
    sectionCycleByTeam: { A: { number: 1, used: ['brand'] } } });
  await f.ref.child('state').set({ phase: 'choose', round: 0, targetTeam: 'A', revision: 0 });
  const transition = f.context((await f.read()).state);
  await db.ref(`matchAccess/${f.ref.key}/playerUids/p1`).set(`${f.uid}-player`);
  assert.equal((await f.call('chooseType', transition, { type: 'ct_qa_absent', requestId: transition.requestId }, `${f.uid}-player`)).status, 'empty');
  assert.equal((await f.read()).rotationBlocked.A.ct_qa_absent.bank, true);
  assert.equal((await db.ref(`questionRotation/${f.uid}`).get()).val(), null);
  const pick = f.context((await f.read()).state);
  assert.equal((await f.call('chooseType', pick, { type: 'brand', requestId: pick.requestId }, `${f.uid}-player`)).status, 'accepted');
});

for (const teamCount of [2, 3, 4]) test(`real ${teamCount}-team create/join/start, earned swap, two tied cycles and natural finish with immutable retries`, async (t) => {
  const uid = `HQA-series-${randomUUID()}`;
  const type = `ct_qa_${randomUUID().replaceAll('-', '')}`;
  const ids = Array.from({ length: 24 }, (_, i) => 997000 + teamCount * 100 + i);
  const questions = ids.map((id) => ({ id, type, category: 'custom', question: `Hermes QA series ${type} item ${id}`, options: ['A','B','C','D'], answer: 0 }));
  for (const q of questions) await db.ref(`customQuestions/${q.id}`).set(q);
  t.after(async () => { await Promise.all(ids.map((id) => db.ref(`customQuestions/${id}`).remove())); });
  const send = (action, extra = {}, actor = uid) => exports.gameAction({ auth: { uid: actor }, rawRequest: { ip: `192.0.2.${110 + teamCount}` }, data: { action, ...extra } });
  const room = (await send('createMatch', { options: { teamNames: Array.from({ length: teamCount }, (_, i) => `Hermes QA ${i + 1}`), enabledTypes: [type], questionsPerTeam: 2, answerMode: 'anyone', timerMode: 'advisory' } })).code;
  const read = async () => (await db.ref(`matches/${room}`).get()).val();
  const context = (state, requestId = randomUUID()) => ({ questionId: state.question?.id ?? null, phase: state.phase, round: state.round || 0,
    attemptId: `${state.round || 0}:${state.targetTeam || ''}:${state.passCount || 0}:${state.selectionRequestId || ''}`, revision: state.revision || 0, requestId });
  const invites = await send('getTeamInvites', { matchCode: room });
  const initial = await read(), actors = {};
  for (const [i, team] of initial.teamOrder.entries()) {
    actors[team] = `${uid}-player-${i}`;
    await send('joinTeam', { matchCode: room, teamCode: team, inviteKey: invites.teamKeys[team], name: `Hermes QA ${i + 1}` }, actors[team]);
  }
  await send('startMatch', { matchCode: room, firstTeamCode: initial.teamOrder[0] });
  let swapped = false, maxTieCycle = 0;
  const seen = new Set();
  for (let i = 0; i < teamCount * 4; i++) {
    let match = await read();
    assert.equal(match.state.phase, 'choose');
    const team = match.state.targetTeam, actor = actors[team];
    const transition = context(match.state), pick = { matchCode: room, type, requestId: transition.requestId, transition };
    assert.equal((await send('chooseType', pick, actor)).status, 'accepted');
    match = await read();
    assert.equal(seen.has(match.state.question.id), false); seen.add(match.state.question.id);
    assert.equal((await send('chooseType', pick, actor)).status, 'accepted', 'lost selection response must replay');
    if (!swapped && (match.teams[team].cardBalance || 0) >= 50) {
      const command = { matchCode: room, teamCode: team, card: 'swapQuestion', transition: context(match.state) };
      const balance = match.teams[team].cardBalance;
      assert.equal((await send('usePowerCard', command, actor)).accepted, true);
      match = await read();
      assert.equal(seen.has(match.state.question.id), false); seen.add(match.state.question.id);
      assert.equal(match.teams[team].cardBalance, balance - 50);
      assert.equal((await send('usePowerCard', command, actor)).accepted, true);
      assert.deepEqual(await read(), match);
      swapped = true;
    }
    maxTieCycle = Math.max(maxTieCycle, match.tieBreaker?.cycle || 0);
    const correct = !match.tieBreaker?.active || (match.tieBreaker.cycle >= 2 && team === initial.teamOrder[0]);
    const judge = { matchCode: room, correct, transition: context(match.state) };
    await send('judgeVerbal', judge);
    const judged = await read();
    await send('judgeVerbal', judge); assert.deepEqual(await read(), judged);
    const advance = { matchCode: room, transition: context(judged.state) };
    await send('advanceTurn', advance);
    const advanced = await read();
    await send('advanceTurn', advance); assert.deepEqual(await read(), advanced);
    if (advanced.status === 'ended') break;
  }
  const ended = await read();
  assert.equal(swapped, true);
  assert.equal(maxTieCycle, 2);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.state.phase, 'ended');
  assert.equal(ended.state.round, teamCount * 4);
  assert.equal(seen.size, teamCount * 4 + 1, 'each swap consumes one extra unique published question');
  assert.ok(ended.teams[initial.teamOrder[0]].score > ended.teams[initial.teamOrder[1]].score);
  const games = (await db.ref(`questionRotation/${uid}`).get()).val().games;
  assert.equal(Object.values(games).length, 1);
  assert.equal(Object.values(Object.values(games)[0].assets).length, seen.size);
});

for (const teamCount of [2, 3, 4]) test(`real scarce ${teamCount}-team repeated tie pauses without recycling and empty swap preserves balance before bounded refresh recovery`, async (t) => {
  const uid = `HQA-scarce-${randomUUID()}`, type = `ct_qa_${randomUUID().replaceAll('-', '')}`;
  const count = teamCount * 3 + 1;
  const ids = Array.from({ length: count + teamCount }, (_, i) => 998000 + teamCount * 100 + i);
  const items = ids.map((id) => ({ id, type, category: 'custom', question: `Hermes QA scarce ${type} item ${id}`, options: ['A','B','C','D'], answer: 0 }));
  t.after(async () => { await Promise.all(ids.map(id => db.ref(`customQuestions/${id}`).remove())); });
  for (const q of items.slice(0, count)) await db.ref(`customQuestions/${q.id}`).set(q);
  const send = (action, extra = {}, actor = uid) => exports.gameAction({ auth: { uid: actor }, rawRequest: { ip: `192.0.2.${150 + teamCount}` }, data: { action, ...extra } });
  const room = (await send('createMatch', { options: { teamNames: Array.from({ length: teamCount }, (_, i) => `Hermes QA ${i + 1}`), enabledTypes: [type], questionsPerTeam: 2, answerMode: 'anyone', timerMode: 'advisory' } })).code;
  const read = async () => (await db.ref(`matches/${room}`).get()).val();
  const context = (state) => ({ questionId: state.question?.id ?? null, phase: state.phase, round: state.round || 0,
    attemptId: `${state.round || 0}:${state.targetTeam || ''}:${state.passCount || 0}:${state.selectionRequestId || ''}`, revision: state.revision || 0, requestId: randomUUID() });
  const invites = await send('getTeamInvites', { matchCode: room });
  const initial = await read(), actors = {}, seen = new Set();
  for (const [i, team] of initial.teamOrder.entries()) {
    actors[team] = `${uid}-player-${i}`;
    await send('joinTeam', { matchCode: room, teamCode: team, inviteKey: invites.teamKeys[team], name: `Hermes QA ${i + 1}` }, actors[team]);
  }
  await send('startMatch', { matchCode: room, firstTeamCode: initial.teamOrder[0] });
  let swapped = false, emptySwap = false;
  for (let turn = 0; turn < teamCount * 3; turn++) {
    let match = await read(); const team = match.state.targetTeam;
    const transition = context(match.state), pick = { matchCode: room, type, transition, requestId: transition.requestId };
    assert.equal((await send('chooseType', pick, actors[team])).status, 'accepted');
    match = await read(); assert.equal(seen.has(match.state.question.id), false); seen.add(match.state.question.id);
    if (!swapped && match.teams[team].cardBalance >= 50) {
      const command = { matchCode: room, teamCode: team, card: 'swapQuestion', transition: context(match.state) };
      assert.equal((await send('usePowerCard', command, actors[team])).accepted, true);
      match = await read(); assert.equal(seen.has(match.state.question.id), false); seen.add(match.state.question.id);
      const replay = await send('usePowerCard', command, actors[team]); assert.equal(replay.accepted, true); assert.deepEqual(await read(), match);
      swapped = true;
    } else if (seen.size === count) {
      const command = { matchCode: room, teamCode: team, card: 'swapQuestion', transition: context(match.state) };
      const response = await send('usePowerCard', command, actors[team]);
      assert.equal(response.accepted, false); assert.equal(response.reason, 'empty');
      const after = await read();
      assert.deepEqual(after.teams, match.teams); assert.equal(after.state.question.id, match.state.question.id);
      assert.equal(after.state.revision, match.state.revision); assert.equal(after.state.cardUsedThisTurn, match.state.cardUsedThisTurn);
      emptySwap = true;
    }
    await send('judgeVerbal', { matchCode: room, correct: !match.tieBreaker?.active, transition: context((await read()).state) });
    await send('advanceTurn', { matchCode: room, transition: context((await read()).state) });
  }
  assert.equal(swapped, true); assert.equal(emptySwap, true); assert.equal(seen.size, count);
  let paused = await read(); assert.equal(paused.tieBreaker.cycle, 2); assert.equal(paused.status, 'playing');
  const beforeHistory = (await db.ref(`questionRotation/${uid}`).get()).val();
  const beforeScores = Object.values(paused.teams).map(team => team.score);
  const transition = context(paused.state), pick = { matchCode: room, type, transition, requestId: transition.requestId };
  assert.equal((await send('chooseType', pick, actors[paused.state.targetTeam])).status, 'empty');
  paused = await read();
  const check = { matchCode: room, transition: context(paused.state) };
  assert.equal((await send('recheckSelectionCapacity', check)).available, false);
  paused = await read(); assert.equal(paused.state.selectionPause.reason, 'capacity');
  assert.deepEqual(Object.values(paused.teams).map(team => team.score), beforeScores);
  assert.deepEqual((await db.ref(`questionRotation/${uid}`).get()).val(), beforeHistory);
  for (const q of items.slice(count)) await db.ref(`customQuestions/${q.id}`).set(q);
  assert.equal((await send('recheckSelectionCapacity', { matchCode: room, transition: context(paused.state) })).available, true);
  assert.deepEqual((await db.ref(`questionRotation/${uid}`).get()).val(), beforeHistory, 'refresh/recheck must preserve consumed history');
  for (let turn = 0; turn < teamCount; turn++) {
    let match = await read(); const team = match.state.targetTeam, transition = context(match.state);
    assert.equal((await send('chooseType', { matchCode: room, type, transition, requestId: transition.requestId }, actors[team])).status, 'accepted');
    match = await read(); assert.ok(ids.slice(count).includes(match.state.question.id)); assert.equal(seen.has(match.state.question.id), false); seen.add(match.state.question.id);
    await send('judgeVerbal', { matchCode: room, correct: team === initial.teamOrder[0], transition: context(match.state) });
    await send('advanceTurn', { matchCode: room, transition: context((await read()).state) });
  }
  const ended = await read(); assert.equal(ended.status, 'ended'); assert.equal(ended.state.phase, 'ended');
  assert.equal(seen.size, ids.length); assert.ok(ended.teams[initial.teamOrder[0]].score > ended.teams[initial.teamOrder[1]].score);
  const games = Object.values((await db.ref(`questionRotation/${uid}`).get()).val().games);
  assert.equal(games.length, 1); assert.equal(Object.values(games[0].assets).length, seen.size);
});

test('real concurrent classic and picture showdown publication commits one private assignment and replays it', async () => {
  for (const challengeMode of ['classic', 'picture_guess']) {
    const f = await fixture();
    await f.ref.update({ challengeMode, showdownCount: 0 });
    await f.ref.child('state/round').set(6);
    const transition = f.context((await f.read()).state);
    const results = await Promise.all([f.call('advanceTurn', transition), f.call('advanceTurn', transition)]);
    for (const r of results) assert.equal(r.showdown, true);
    const saved = await f.read();
    assert.equal(saved.showdownCount, 1);
    assert.equal(saved.state.phase, 'showdown');
    assert.equal(saved.state.revision, 5);
    assert.ok(saved.state.secretVersion);
    assert.equal(JSON.stringify(saved).includes('/img/picture-guess/'), false);
    const secret = (await db.ref(`matchSecrets/${f.ref.key}/versions/${saved.state.secretVersion}`).get()).val();
    assert.equal(secret.questionId, saved.state.question.id);
    assert.equal((await f.call('advanceTurn', transition)).showdown, true);
    assert.deepEqual(await f.read(), saved);
    if (challengeMode === 'picture_guess') {
      const view = await f.call('getPictureGuessView', null, { questionId: secret.questionId });
      assert.equal(Object.keys(view.pictures).length, 2);
    } else {
      assert.equal((await f.call('getHostAnswer')).questionId, secret.questionId);
      const versions = (await db.ref(`matchSecrets/${f.ref.key}/versions`).get()).val();
      assert.equal(Object.keys(versions).length, 1, 'concurrent bank preparation must stage one immutable version per reservation');
    }
  }
});

test('real ordinary selection serializes concurrent retries, stages a private secret and replays the exact choice', async () => {
  const f = await fixture(), playerUid = `Hermes-QA-player-${randomUUID()}`;
  await f.ref.update({ enabledTypes: ['brand'], turnIndex: 0 });
  await f.ref.child('state').set({ phase: 'choose', round: 0, targetTeam: 'A', revision: 0 });
  const room = f.ref.key;
  await db.ref(`matchAccess/${room}/playerUids/p1`).set(playerUid);
  const transition = f.context((await f.read()).state), requestId = transition.requestId;
  const payload = { action: 'chooseType', matchCode: room, type: 'brand', requestId, transition };
  const send = (data = payload) => exports.gameAction({ auth: { uid: playerUid }, rawRequest: { ip: '192.0.2.100' }, data });
  const results = await Promise.all([send(), send(), send()]);
  assert.ok(results.some((r) => r.status === 'accepted'));
  const selected = await f.read();
  assert.equal(selected.state.phase, 'question');
  assert.equal(selected.state.revision, 1);
  assert.equal(selected.typeCounts.A.brand, 1);
  assert.equal(selected.state.selectionLease ?? null, null);
  assert.ok(selected.state.secretVersion);
  assert.equal(selected.state.question.answer, -1);
  const secret = (await db.ref(`matchSecrets/${room}/versions/${selected.state.secretVersion}`).get()).val();
  assert.equal(secret.questionId, selected.state.question.id);
  assert.equal((await f.call('getHostAnswer')).questionId, secret.questionId);
  assert.equal((await send()).status, 'accepted');
  assert.deepEqual(await f.read(), selected);
  assert.equal((await send({ ...payload, type: 'multiple_choice' })).status, 'late');
  await f.call('judgeVerbal', f.context(selected.state), { correct: true });
  const scored = await f.read();
  assert.equal(scored.state.phase, 'revealed');
  assert.equal(scored.teams.A.score, 150);
});

test('real selection lease permits expired recovery and prevents stale executors from publishing', async () => {
  const f = await fixture(), playerUid = `Hermes-QA-player-${randomUUID()}`;
  await f.ref.update({ enabledTypes: ['brand'], turnIndex: 0 });
  await f.ref.child('state').set({ phase: 'choose', round: 0, targetTeam: 'A', revision: 0, selectionRequestId: 'crashed', selectionLease: { owner: 'crashed-executor', expiresAt: Date.now() + 60000 } });
  await db.ref(`matchAccess/${f.ref.key}/playerUids/p1`).set(playerUid);
  const send = async () => {
    const transition = f.context((await f.read()).state);
    return exports.gameAction({ auth: { uid: playerUid }, rawRequest: { ip: '192.0.2.101' }, data: { action: 'chooseType', matchCode: f.ref.key, type: 'brand', requestId: transition.requestId, transition } });
  };
  assert.equal((await send()).status, 'late');
  await f.ref.child('state/selectionLease/expiresAt').set(Date.now() - 1);
  assert.equal((await send()).status, 'accepted');
  assert.equal((await f.read()).typeCounts.A.brand, 1);
});

test('real card lease recovery and concurrent immutable retries spend once without changing command identity', async () => {
  const f = await fixture();
  await f.ref.child('teams/A/powerCards').set({ doublePoints: true });
  await f.ref.child('state').set({ phase: 'choose', round: 0, targetTeam: 'A', revision: 0,
    cardClaimId: 'crashed', cardLease: { owner: 'crashed', expiresAt: Date.now() + 60000 } });
  const transition = f.context((await f.read()).state);
  const extra = { teamCode: 'A', card: 'doublePoints' };
  assert.equal((await f.call('usePowerCard', transition, extra)).reason, 'busy');
  await f.ref.child('state/cardLease/expiresAt').set(Date.now() - 1);
  const results = await Promise.all([1,2,3].map(() => f.call('usePowerCard', transition, extra)));
  assert.ok(results.some((r) => r.accepted));
  const saved = await f.read();
  assert.equal(saved.state.revision, 1);
  assert.equal(saved.state.pointMultiplier, 2);
  assert.equal(saved.state.selectionRequestId ?? null, null);
  assert.equal(saved.state.cardLease ?? null, null);
  assert.equal(saved.state.cardClaimId ?? null, null);
  assert.equal(saved.teams.A.cardBalance, 850);
  assert.equal((await f.call('usePowerCard', transition, extra)).accepted, true);
  assert.deepEqual(await f.read(), saved);
  assert.equal((await f.call('usePowerCard', transition, { ...extra, card: 'extraTime' })).accepted, false);
  assert.deepEqual(await f.read(), saved);
});

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
