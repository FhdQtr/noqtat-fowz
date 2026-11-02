import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const raw = readFileSync(new URL('../src/lib/matchApi.ts', import.meta.url), 'utf8');
const source = ts.transpileModule(raw.slice(raw.indexOf('export function subscribeMatch('), raw.indexOf('/** يراقب')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(auth = async () => ({})) {
  let now = 0, next = 0, calls = 0, direct = 0, fail = false, held;
  const timers = new Map(), listeners = new Map(), errors = [], values = [];
  const window = { setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: (id) => timers.delete(id) };
  const exports = {};
  runInNewContext(source, { exports, window, ensureAuth: auth, normalizeMatch: (x) => x, ref: (_, path) => path, db: {},
    onValue: (path, fn, error) => { listeners.set(path, { fn, error }); return () => listeners.delete(path); },
    fetchMatchDirect: async () => { direct++; throw new Error('REST forbidden'); },
    gameAction: async () => { calls++; if (held) return held; if (fail) throw new Error('offline'); return { match: { revision: 2 } }; },
  });
  const stop = exports.subscribeMatch('Q234', (x) => values.push(x), (x) => errors.push(x));
  return { stop, errors, values, listeners, timers,
    get calls() { return calls; }, get direct() { return direct; },
    fail: () => { fail = true; },
    hold: (promise) => { held = promise; },
    snapshot: (path, value) => { assert.ok(listeners.has(path), `Missing subscription ${path}`); listeners.get(path).fn({ exists: () => value != null, val: () => value }); },
    tick: async (ms) => { const end = now + ms; for (;;) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0]; if (!due) break; now = due[1].at; timers.delete(due[0]); due[1].fn(); await flush(); } now = end; await flush(); },
  };
}

test('socket loss after an initial snapshot reports reconnecting and restarts fallback', async () => {
  const h = harness(); await flush();
  h.snapshot('matches/Q234', { revision: 1 });
  h.snapshot('.info/connected', false); await flush();
  assert.ok(h.errors.some(Boolean));
  assert.ok(h.calls >= 1, 'socket disconnect restarts polling after previous success');
  h.stop();
});

test('fallback uses the authenticated callable, never an external token-in-URL REST request', async () => {
  const h = harness(); await flush(); await h.tick(1200);
  assert.equal(h.direct, 0);
  assert.equal(h.calls, 1);
  h.stop();
});

test('a late fallback response cannot replace a newer realtime snapshot', async () => {
  const h = harness(); await flush();
  let release; h.hold(new Promise((resolve) => { release = resolve; }));
  await h.tick(1200);
  h.snapshot('matches/Q234', { revision: 3 });
  release({ match: { revision: 2 } }); await flush();
  assert.equal(h.values.at(-1).revision, 3);
  h.stop();
});

test('cached snapshots during socket loss do not hide the warning or cancel recovery', async () => {
  const h = harness(); await flush();
  h.snapshot('.info/connected', true); h.snapshot('matches/Q234', { revision: 1 });
  h.fail(); h.snapshot('.info/connected', false); await flush();
  h.snapshot('matches/Q234', { revision: 1 });
  await h.tick(5000);
  assert.ok(h.calls >= 2);
  assert.ok(h.errors.at(-1), 'cached snapshot is not a live recovery confirmation');
  h.stop();
});

test('reconnect confirms freshness and unsubscribe cancels both listeners and all timers', async () => {
  const h = harness(); await flush();
  h.snapshot('.info/connected', true); h.snapshot('matches/Q234', { revision: 1 });
  h.snapshot('.info/connected', false); await flush();
  assert.ok(h.errors.at(-1));
  h.snapshot('.info/connected', true); await h.tick(2000);
  assert.equal(h.errors.at(-1), '');
  assert.equal(h.values.at(-1).revision, 2);
  h.stop(); const count = h.calls;
  assert.equal(h.listeners.size, 0);
  await h.tick(60000); assert.equal(h.calls, count); assert.equal(h.timers.size, 0);
});

test('late failed in-flight requests cannot emit errors after unsubscribe', async () => {
  const h = harness(); await flush(); let reject;
  h.hold(new Promise((_, no) => { reject = no; })); await h.tick(1200);
  h.stop(); const errors = h.errors.length;
  reject(new Error('late failure')); await flush();
  assert.equal(h.errors.length, errors); assert.equal(h.timers.size, 0);
});

test('unsubscribing during authentication suppresses late auth failure callbacks', async () => {
  let reject; const h = harness(() => new Promise((_, no) => { reject = no; }));
  h.stop(); reject(new Error('late auth failure')); await flush();
  assert.equal(h.errors.length, 0); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
});

test('post-success fallback failure is visible and retries back off instead of hammering', async () => {
  const h = harness(); await flush();
  h.snapshot('matches/Q234', { revision: 1 }); h.fail();
  h.listeners.get('matches/Q234').error(new Error('socket failed'));
  await flush();
  assert.ok(h.errors.some(Boolean), 'errors after a previous successful snapshot are not swallowed');
  await h.tick(30000);
  assert.ok(h.calls >= 3 && h.calls <= 5, `bounded exponential retry calls: ${h.calls}`);
  h.stop();
});
