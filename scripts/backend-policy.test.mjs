import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('disabled preview custom-bank subscriptions never start authentication or database reads', () => {
  let authCalls = 0;
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/customBank.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require: (name) => {
    if (name === './firebase') return { backend: { mode: 'disabled' }, ensureAuth: () => { authCalls++; return Promise.resolve(); } };
    return {};
  } });
  const stopTypes = exports.subscribeCustomTypes(() => {});
  const stopQuestions = exports.subscribeCustomQuestions(() => {});
  stopTypes(); stopQuestions();
  assert.equal(authCalls, 0);
});

test('preview and local origins fail closed; production requires official origin and build', async () => {
  const { backendTarget } = await import('../src/lib/backendPolicy.ts');
  for (const hostname of ['localhost', '127.0.0.1', 'preview.vercel.app', 'www.qtrgame.net.evil.test']) {
    assert.equal(backendTarget(hostname, true).mode, 'disabled');
  }
  for (const hostname of ['qtrgame.net', 'www.qtrgame.net']) {
    assert.equal(backendTarget(hostname, true).mode, 'production');
    assert.equal(backendTarget(hostname, false).mode, 'disabled');
  }
  assert.equal(backendTarget('localhost', false, 'emulator').mode, 'emulator');
  assert.equal(backendTarget('127.0.0.1', false, 'emulator').mode, 'emulator');
  assert.equal(backendTarget('preview.vercel.app', true, 'emulator').mode, 'disabled');
  assert.equal(backendTarget('preview.vercel.app', true, 'production').mode, 'disabled');
});
