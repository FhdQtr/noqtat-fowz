import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/HostRoom.tsx', import.meta.url), 'utf8');
function controller() {
  const states = { busy: false, error: '', audio: 0 };
  const fragment = source.slice(source.indexOf('  const act = async'), source.indexOf('  const shareTv ='));
  const js = ts.transpileModule(fragment + '\nexports.act = act;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, setBusy: (x) => { states.busy = x; }, setActionError: (x) => { states.error = x; }, unlockAudio: () => { states.audio++; } });
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
