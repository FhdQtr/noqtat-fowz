import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

function adminInitialization(env) {
  const realRequire = createRequire(new URL('../functions/index.js', import.meta.url));
  let options;
  const mockedRequire = (name) => {
    if (name === 'firebase-admin/app') return { initializeApp: (value) => { options = value; } };
    if (name === 'firebase-admin/database') return { getDatabase: () => ({}), ServerValue: {} };
    if (name === 'firebase-functions/v2/https') return { onCall: () => {}, HttpsError: Error };
    if (name === 'firebase-functions/v2/scheduler') return { onSchedule: () => {} };
    return realRequire(name);
  };
  mockedRequire.resolve = realRequire.resolve;
  runInNewContext(readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8'), { exports: {}, require: mockedRequire, process: { env }, Buffer });
  return options;
}

test('Functions emulator uses the same demo database namespace as the frontend', () => {
  const options = adminInitialization({ FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-al-midan', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' });
  assert.equal(options.databaseURL, 'https://demo-al-midan-default-rtdb.firebaseio.com');
  assert.equal(options.projectId, 'demo-al-midan');
});

test('Functions emulator rejects non-demo projects and non-loopback database targets', () => {
  for (const env of [
    { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'noqtat-fowz-d13aa', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' },
    { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-al-midan' },
    { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-al-midan', FIREBASE_DATABASE_EMULATOR_HOST: 'example.com:9000' },
  ]) assert.throws(() => adminInitialization(env), /isolated demo/);
  assert.equal(adminInitialization({}).databaseURL, 'https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app');
});

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
