import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const file = readFileSync(new URL('../src/lib/firebase.ts', import.meta.url), 'utf8');
const source = ts.transpileModule(file.slice(file.indexOf('let ready:')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function api(auth, signInAnonymously, timers = {}) {
  const exports = {};
  runInNewContext(source, { exports, auth, signInAnonymously, appCheckReady: Promise.resolve(), Promise, Error, setTimeout, clearTimeout, ...timers });
  return exports;
}

test('a failed guest sign-in is retried, instead of caching the rejected promise', async () => {
  let attempts = 0;
  const user = { uid: 'guest' };
  const auth = { currentUser: null, authStateReady: async () => {} };
  const helper = api(auth, async () => {
    if (++attempts === 1) throw new Error('network failure');
    return { user };
  });
  await assert.rejects(helper.ensureAuth(), /network failure/);
  assert.equal(await helper.ensureAuth(), user);
  assert.equal(attempts, 2);
});

test('persisted Google session is restored before creating an anonymous session', async () => {
  let attempts = 0;
  const user = { uid: 'google-owner' };
  const auth = { currentUser: null, authStateReady: async () => { auth.currentUser = user; } };
  const helper = api(auth, async () => { attempts++; return { user: { uid: 'guest' } }; });
  assert.equal(await helper.ensureAuth(), user);
  assert.equal(attempts, 0);
});

test('simultaneous callers share one sign-in and timeout permits a retry', async () => {
  let attempts = 0;
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const user = { uid: 'guest' };
  const auth = { currentUser: null, authStateReady: async () => {} };
  const helper = api(auth, async () => { attempts++; await wait; return { user }; });
  const first = helper.ensureAuth();
  const second = helper.ensureAuth();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [user, user]);

  let timeoutCallback;
  const timed = api(auth, async () => { if (++attempts === 2) return new Promise(() => {}); return { user }; }, { setTimeout: (fn) => { timeoutCallback = fn; return 1; }, clearTimeout: () => {} });
  const pending = timed.ensureAuth();
  await new Promise((resolve) => setImmediate(resolve));
  timeoutCallback();
  await assert.rejects(pending, /الاتصال/);
  assert.equal(await timed.ensureAuth(), user);
});
