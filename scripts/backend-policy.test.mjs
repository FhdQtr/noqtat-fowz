import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

function creationHarness(capabilities, unavailable = false) {
  const calls = [];
  const bankVersion = JSON.parse(readFileSync(new URL('../src/data/questionBankVersion.json', import.meta.url), 'utf8'));
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/matchApi.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require: (name) => {
    if (name === '../data/questionBankVersion.json') return bankVersion;
    if (name === './firebase') return { ensureAuth: async () => {}, functions: {} };
    if (name === 'firebase/functions') return { httpsCallable: () => async (payload) => {
      calls.push(payload.action);
      if (payload.action === 'getGameCapabilities') {
        if (unavailable) throw new Error('network unavailable');
        return { data: capabilities };
      }
      return { data: { code: 'A234' } };
    } };
    return {};
  } });
  return { calls, create: exports.createMatch, bankVersion };
}

test('new competition fails closed against legacy or mismatched backend before any room write', async () => {
  for (const capabilities of [{ pictureGuessManual: true }, { protocol: 'al-midan-contextual-rotation2-presets1', builtinBankSha256: 'wrong-bank' }]) {
    const h = creationHarness(capabilities);
    await assert.rejects(h.create({ enabledTypes: ['multiple_choice'], challengeMode: 'classic' }), /تحديث|توافق/);
    assert.deepEqual(h.calls, ['getGameCapabilities']);
  }
});

test('capability transport failure is distinct from unsupported version and is retryable without room writes', async () => {
  const h = creationHarness({}, true);
  await assert.rejects(h.create({ enabledTypes: ['multiple_choice'] }), /الاتصال/);
  assert.deepEqual(h.calls, ['getGameCapabilities']);
});

test('matching backend and bank allow mixed or reviewed competition without claiming deployed rules verification', async () => {
  const bankVersion = JSON.parse(readFileSync(new URL('../src/data/questionBankVersion.json', import.meta.url), 'utf8'));
  const h = creationHarness({ protocol: 'al-midan-contextual-rotation2-presets1', builtinBankSha256: bankVersion.sha256, pictureGuessManual: true });
  assert.equal(await h.create({ enabledTypes: ['multiple_choice'], contentPreset: 'reviewed_challenge' }), 'A234');
  assert.deepEqual(h.calls, ['getGameCapabilities', 'createMatch']);
});

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
