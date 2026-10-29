import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const raw = readFileSync(new URL('../src/lib/matchApi.ts', import.meta.url), 'utf8');
const source = ts.transpileModule(raw.slice(raw.indexOf('export async function submitAnswer('), raw.indexOf('export async function submitShowdownAnswer(')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function api(gameAction) { const exports = {}; runInNewContext(source, { exports, gameAction }); return exports; }
const context = { questionId: 42, attemptId: '1:A234-1:0:selection-1', revision: 4, requestId: 'answer-1' };
test('client explicitly requests advisory ordinary timers, including a no-timer setup', async () => {
  const exports = {}, calls = [];
  const createSource = ts.transpileModule(raw.slice(raw.indexOf('export async function createMatch('), raw.indexOf('export function subscribeMatch(')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(createSource, { exports, gameAction: async (action, payload) => { calls.push({ action, payload }); return { code: 'Q234' }; } });
  assert.equal(await exports.createMatch({ timer: 0 }), 'Q234');
  assert.equal(calls[0].payload.options.timerMode, 'advisory');
  assert.equal(calls[0].payload.options.timer, 0);
});

test('section selection freezes the displayed choose context across a lost-response retry', async () => {
  const exports = {}, calls = [];
  const fragment = raw.slice(raw.indexOf('export async function chooseType('), raw.indexOf('export interface AnswerContext'));
  const state = { phase: 'choose', round: 2, targetTeam: 'A', revision: 7 };
  runInNewContext(ts.transpileModule(fragment, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, crypto: { randomUUID: () => 'selection-request' }, window: { setTimeout: (f) => f() },
    captureHostTransition: (s, requestId) => ({ phase: s.phase, round: s.round, revision: s.revision, requestId }),
    gameAction: async (action, payload) => {
      calls.push(JSON.parse(JSON.stringify({ action, payload })));
      if (calls.length === 1) { state.revision = 99; throw new Error('response lost'); }
      return { status: 'accepted' };
    },
  });
  assert.equal(await exports.chooseType('A234', 'brand', { state }), 'accepted');
  assert.equal(calls[0].payload.transition?.revision, 7);
  assert.equal(calls[0].payload.transition?.phase, 'choose');
  assert.deepEqual(calls[0], calls[1]);
});

test('card client freezes displayed context and exact command for a lost-response retry', async () => {
  const exports = {}, calls = [];
  const fragment = raw.slice(raw.indexOf('export async function usePowerCard('), raw.indexOf('export function captureHostTransition('));
  const match = { state: { phase: 'choose', round: 2, revision: 7 } };
  runInNewContext(ts.transpileModule(fragment, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, captureHostTransition: (s) => ({ phase: s.phase, round: s.round, revision: s.revision, requestId: 'card-request' }),
    gameAction: async (action, payload) => {
      calls.push(JSON.parse(JSON.stringify({ action, payload })));
      if (calls.length === 1) { match.state.revision = 99; throw new Error('response lost'); }
      return { accepted: true };
    },
  });
  assert.equal((await exports.usePowerCard('A234', 'A', 'doublePoints', undefined, match)).accepted, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.transition?.revision, 7);
  assert.deepEqual(calls[0], calls[1]);
});

test('presenter APIs freeze turn context and reuse the same payload after a lost response', async () => {
  const exports = {}, calls = [];
  const start = raw.indexOf('export function captureHostTransition(');
  const fragment = start < 0 ? raw.slice(raw.indexOf('export async function judgeVerbal('), raw.indexOf('export async function endMatch(')) : raw.slice(start, raw.indexOf('export async function endMatch('));
  runInNewContext(ts.transpileModule(fragment, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, crypto: { randomUUID: () => 'immutable-request' },
    gameAction: async (action, payload) => {
      calls.push(JSON.parse(JSON.stringify({ action, payload })));
      if (calls.length % 2) throw new Error('response lost');
      return { ok: true };
    },
  });
  const state = { question: { id: 42 }, phase: 'revealed', round: 2, targetTeam: 'A234-1', passCount: 1, selectionRequestId: 'pick', revision: 7 };
  for (const action of ['judgeVerbal', 'revealAnswer', 'passToNextTeam', 'advanceTurn']) {
    await exports[action]('A234', { state }, true);
    const pair = calls.slice(-2);
    assert.deepEqual(pair[0], pair[1]);
    assert.deepEqual(pair[0].payload.transition, { questionId: 42, phase: 'revealed', round: 2, attemptId: '2:A234-1:1:pick', revision: 7, requestId: 'immutable-request' });
  }
});

test('ordinary API preserves captured context and retry identity on every request', async () => {
  const calls = [];
  const helper = api(async (action, payload) => { calls.push({ action, payload }); return { status: 'accepted' }; });
  for (let i = 0; i < 2; i++) assert.equal(await helper.submitAnswer('A234', 'p1', 'name', 3, context), 'accepted');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { action: 'submitAnswer', payload: { matchCode: 'A234', playerId: 'p1', playerName: 'name', choice: 3, ...context } });
  assert.deepEqual(calls[0], calls[1]);
});
test('ordinary API distinguishes transport failure from server late and stale results', async () => {
  assert.equal(await api(async () => { throw new Error('offline'); }).submitAnswer('A234', 'p1', 'name', 3, context), 'error');
  for (const status of ['late', 'stale']) assert.equal(await api(async () => ({ status })).submitAnswer('A234', 'p1', 'name', 3, context), status);
});

test('frontend scoring matches server including full-value steals and assistance', () => {
  const types = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/types/game.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: types });
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const points = runInNewContext(server.slice(server.indexOf('function points(state)'), server.indexOf('function cardReward(state)')) + '; points');
  for (const base of [0, 50, 100, 150]) for (const passCount of [0, 1, 2]) for (const assistUsed of [false, true]) for (const stealFullValue of [false, true]) for (const pointMultiplier of [1, 2]) {
    const state = { question: { id: 42 }, questionValue: base, passCount, assistUsed, stealFullValue, pointMultiplier };
    assert.equal(types.questionPoints(state), points(state), JSON.stringify(state));
  }
});

function playerUI(send) {
  const transpile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const types = {}; runInNewContext(transpile('../src/types/game.ts'), { exports: types });
  const match = { answerMode: 'anyone', teams: { 'A234-1': { code: 'A234-1', name: 'QA', color: 'maroon' } }, players: {}, teamOrder: ['A234-1'], state: { phase: 'question', question: { id: 42, type: 'multiple_choice', options: ['a','b','c','d'] }, targetTeam: 'A234-1', round: 1, passCount: 0 } };
  const values = [match, { id: 'p1', name: 'QA', teamCode: 'A234-1' }];
  const refs = []; let index = 0, refIndex = 0;
  const exports = {};
  const mocked = (name) => {
    if (name === 'react') return { useState: (initial) => { const n = index++; if (!(n in values)) values[n] = typeof initial === 'function' ? initial() : initial; return [values[n], (x) => { values[n] = typeof x === 'function' ? x(values[n]) : x; }]; }, useEffect: () => {}, useMemo: (fn) => fn(), useRef: (x) => refs[refIndex++] ||= { current: x } };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-router') return { useParams: () => ({ teamCode: 'A234-1' }), useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams()] };
    if (name.endsWith('/types/game')) return types;
    if (name.endsWith('/matchApi')) return { submitAnswer: send, captureAnswerContext: () => context };
    if (name.endsWith('/sounds')) return { sfx: { lock: () => {} }, unlockAudio: () => {} };
    if (name.endsWith('/useNow')) return { useNow: () => 2000 };
    if (name.endsWith('/useShowdownFinish')) return { useShowdownFinish: () => ({}) };
    if (name.endsWith('/answers')) return { ANSWER_LETTERS: ['a','b','c','d'] };
    return new Proxy({ __esModule: true, default: () => null }, { get: (o,k) => o[k] || (() => null) });
  };
  runInNewContext(transpile('../src/pages/Play.tsx'), { exports, require: mocked, console, URLSearchParams });
  return () => { index = 0; refIndex = 0; return exports.default(); };
}
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
test('player UI offers a frozen-choice retry after network failure instead of blaming a teammate', async () => {
  const sent = []; let attempts = 0;
  const render = playerUI(async (...args) => { sent.push(args); return ++attempts === 1 ? 'error' : 'accepted'; });
  const option = nodes(render()).find((n) => n.type === 'button' && n.props.className?.includes('m-answer-option'));
  assert.ok(option); await option.props.onClick();
  const tree = nodes(render());
  const retry = tree.find((n) => n.type === 'button' && n.props.children === 'إعادة إرسال الإجابة');
  assert.ok(retry, 'network failure needs an explicit retry, not a late/teammate message');
  await retry.props.onClick();
  assert.deepEqual(sent[0], sent[1], 'retry must preserve choice and exact context/request ID');
});
