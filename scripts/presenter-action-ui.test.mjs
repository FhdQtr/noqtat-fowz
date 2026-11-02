import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/HostRoom.tsx', import.meta.url), 'utf8');
function controller() {
  const states = { busy: false, error: '', audio: 0 };
  const actionInFlight = { current: false };
  const fragment = source.slice(source.indexOf('  const act = async'), source.indexOf('  const shareTv ='));
  const js = ts.transpileModule(fragment + '\nexports.act = act;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, actionInFlight, setBusy: (x) => { states.busy = x; }, setActionError: (x) => { states.error = x; }, unlockAudio: () => { states.audio++; } });
  return { states, act: exports.act };
}

test('presenter action handles a rejected request, releases busy and gives safe recovery without replaying it', async () => {
  const h = controller();
  let calls = 0;
  await assert.doesNotReject(h.act(async () => { calls++; throw new Error('internal diagnostic not for public display'); }));
  assert.equal(calls, 1, 'the generic controller must not silently re-run consequential actions');
  assert.equal(h.states.busy, false);
  assert.match(h.states.error, /حالة|تحديث/);
  assert.doesNotMatch(h.states.error, /internal diagnostic/);
  await h.act(async () => {});
  assert.equal(h.states.error, '');
  assert.equal(h.states.busy, false);
});

test('presenter recovery callback still receives failure without an unhandled rejection', async () => {
  const h = controller(); let recovery = false;
  await assert.doesNotReject(h.act(async () => { throw new Error('network'); }, () => { recovery = true; }));
  assert.equal(recovery, true);
});

test('presenter serializes rapid actions before React can render disabled controls', async () => {
  const h = controller();
  let release; let firstCalls = 0; let secondCalls = 0;
  const pending = h.act(() => { firstCalls++; return new Promise((resolve) => { release = resolve; }); });
  await h.act(async () => { secondCalls++; });
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0, 'a second click must not issue a competing request while the first is in flight');
  assert.equal(h.states.busy, true, 'a suppressed click must not release the first operation');
  release(); await pending;
  assert.equal(h.states.busy, false);
  await h.act(async () => { secondCalls++; });
  assert.equal(secondCalls, 1, 'an intentional later action remains possible');
});

// Fixture rendering only: execute the real page handlers, never Firebase or user records.
function presenterPage(phase, accepted = false) {
  const calls = []; const prompts = [];
  const match = {
    status: phase === 'ended' ? 'ended' : 'playing', answerMode: 'anyone',
    enabledTypes: ['multiple_choice'], teamOrder: ['A', 'B'], totalRounds: 8,
    teams: Object.fromEntries(['A', 'B'].map(code => [code, { code, name: `Hermes QA ${code}`, color: 'maroon', score: 0 }])),
    players: { p1: { id: 'p1', name: 'Hermes QA player', teamCode: 'A' } }, state: { phase, round: 1, turnIndex: 0, revision: 2, attemptId: 'fixture-attempt',
      question: { id: 1, type: 'multiple_choice', question: 'Fixture only', options: ['A', 'B'] }, targetTeam: 'A' },
  };
  let stateIndex = 0;
  const api = new Proxy({ typeProgress: () => ({ available: true }), isShowdownDue: () => false }, {
    get: (target, key) => target[key] ?? (async (...args) => { calls.push([key, args]); }),
  });
  const load = name => {
    if (name === 'react') return { ...require('react'), useEffect: () => {}, useMemo: fn => fn(),
      useRef: value => ({ current: value }), useState: value => [stateIndex++ === 0 ? match : value, () => {}] };
    if (name === 'react-router') return { useParams: () => ({ code: '1234' }), useNavigate: () => () => {} };
    if (name === '../lib/matchApi') return api;
    if (name === '../types/game') return { TEAM_COLORS: { maroon: { light: '#fff', hex: '#800' } },
      viewSecondsFor: () => null, usesVerbalChoices: () => false, questionPoints: () => 50, canPassQuestion: () => false };
    if (name === '../lib/useShowdownFinish') return { useShowdownFinish: () => ({}) };
    if (name === '../lib/useNow') return { useNow: () => 0 };
    if (name === '../lib/sounds') return { unlockAudio: () => {}, sfx: {} };
    if (name === '../lib/answers') return { ANSWER_LETTERS: ['أ', 'ب'] };
    if (name.startsWith('../components/')) return new Proxy({}, { get: () => () => null });
    return require(name);
  };
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: load, window: { confirm: message => { prompts.push(message); return accepted; } } });
  const tree = exports.default(); const buttons = [];
  function text(node) { return Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : typeof node === 'string' ? node : ''; }
  function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function' && node.type.name === 'AnswerModeControls') return visit(node.type(node.props));
    if (node.type === 'button') buttons.push(node); visit(node.props?.children); }
  visit(tree);
  return { calls, prompts, match, buttons, button: label => {
    const found = buttons.find(node => text(node).trim() === label || node.props['aria-label'] === label || node.props.title === label);
    assert.ok(found, `missing button ${label}`); return found;
  } };
}

test('presenter answer-mode controls expose selection independently of color or disabled state', () => {
  const h = presenterPage('question');
  const modes = h.buttons.filter(button => ['ممثل الفريق', 'المقدم فقط', 'أي لاعب'].some(label => JSON.stringify(button.props.children).includes(label)));
  assert.equal(modes.length, 3);
  assert.deepEqual(modes.map(button => button.props['aria-pressed']), [false, false, true]);
});

test('presenter representative controls expose current selection and suppress interaction while busy', () => {
  const h = presenterPage('question');
  const button = h.button('Hermes QA player');
  assert.equal(button.props['aria-pressed'], false);
  assert.equal(button.props.disabled, false);
});

test('presenter end action is cancelled without a request and explains current-score finality', async () => {
  const h = presenterPage('question');
  await h.button('إنهاء').props.onClick();
  assert.equal(h.calls.length, 0, 'cancel must not end an in-progress room');
  assert.equal(h.prompts.length, 1);
  assert.match(h.prompts[0], /النقاط الحالية/);
});

test('presenter confirms room deletion without claiming comprehensive erasure or history reset', async () => {
  const cancelled = presenterPage('ended');
  await cancelled.button('حذف الغرفة').props.onClick();
  assert.equal(cancelled.calls.length, 0, 'cancelled deletion must issue no request');
  assert.match(cancelled.prompts[0], /روابط/);
  assert.match(cancelled.prompts[0], /سجل.*الأسئلة/);
  const accepted = presenterPage('ended', true);
  await accepted.button('حذف الغرفة').props.onClick();
  assert.equal(accepted.calls.length, 1);
  assert.equal(accepted.calls[0][0], 'deleteMatch');
  assert.equal(accepted.calls[0][1][0], '1234');
});

test('presenter unanswered skip requires confirmation and retains the displayed transition context', async () => {
  const cancelled = presenterPage('question');
  await cancelled.button('تخطي السؤال').props.onClick();
  assert.equal(cancelled.calls.length, 0);
  assert.match(cancelled.prompts[0], /بلا نقاط/);
  const accepted = presenterPage('question', true);
  await accepted.button('تخطي السؤال').props.onClick();
  assert.equal(accepted.calls.length, 1);
  assert.equal(accepted.calls[0][0], 'advanceTurn');
  assert.equal(accepted.calls[0][1][1], accepted.match);
  assert.equal(accepted.calls[0][1][2], true);
});
