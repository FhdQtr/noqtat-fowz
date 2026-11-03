import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(name, globals = {}, modules = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected dependency: ${name}`);
    return modules[name];
  }, setTimeout, clearTimeout, ...globals });
  return exports;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('blocked storage does not prevent joining, leaving or muting a game', () => {
  const blocked = () => { throw new Error('storage disabled'); };
  const api = load('storage', { localStorage: { getItem: blocked, setItem: blocked, removeItem: blocked } });
  assert.equal(api.readStored('player'), null);
  assert.doesNotThrow(() => api.writeStored('player', 'session'));
  assert.doesNotThrow(() => api.writeStored('player', null));
  const audio = load('sounds', { window: {} }, { './storage': api });
  assert.doesNotThrow(() => audio.setAudioMuted(false));
  assert.doesNotThrow(() => audio.sfx.correct());
});

test('storage preserves values and removes the previous player on leave', () => {
  const values = new Map();
  const api = load('storage', { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  api.writeStored('player', 'team-one');
  assert.equal(api.readStored('player'), 'team-one');
  api.writeStored('player', null);
  assert.equal(api.readStored('player'), null);
});

test('YouTube shares loading, releases failed requests and retries the next clip', async () => {
  const scripts = [];
  const timers = new Set();
  const window = {};
  const api = load('youtube', {
    window,
    document: {
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { appendChild: (tag) => scripts.push(tag) },
    },
    setTimeout: (fn) => { timers.add(fn); return fn; },
    clearTimeout: (fn) => timers.delete(fn),
  });
  const first = api.loadYouTubeAPI();
  assert.equal(first, api.loadYouTubeAPI());
  assert.equal(scripts.length, 1);
  scripts[0].onerror();
  assert.equal(await first, null);
  assert.equal(scripts[0].removed, true);
  assert.equal(timers.size, 0);
  const retry = api.loadYouTubeAPI();
  assert.equal(scripts.length, 2);
  window.YT = { Player() {} };
  window.onYouTubeIframeAPIReady();
  assert.equal(await retry, window.YT);
  assert.equal(timers.size, 0);
});

function connection() {
  const timers = new Map();
  let nextId = 0, live, unsubscribeCalls = 0, actionCalls = 0;
  const auth = deferred();
  const rest = deferred();
  const api = load('matchConnection', {
    window: {
      setTimeout: (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id; },
      clearTimeout: (id) => timers.delete(id),
    },
    fetch: () => rest.promise,
    AbortController,
  }, {
    'firebase/database': {
      ref: (_, path) => path,
      onValue: (_, cb) => { live = cb; return () => { unsubscribeCalls++; }; },
    },
    './firebase': {
      db: { app: { options: { databaseURL: 'https://example.invalid' } } },
      ensureAuth: () => auth.promise,
    },
    './gameAction': { gameAction: async () => { actionCalls++; return { match: { version: 'fallback' } }; } },
    './normalizeMatch': { normalizeMatch: (match) => match },
  });
  return { api, auth, rest, live: (value) => live({ exists: () => true, val: () => value }),
    tick: (ms) => { for (const [id, entry] of [...timers]) if (entry.ms === ms) { timers.delete(id); entry.fn(); } },
    timers, unsubscribed: () => unsubscribeCalls, actionCalls: () => actionCalls,
  };
}

test('a late REST response cannot overwrite a newer realtime match', async () => {
  const h = connection();
  const received = [];
  const stop = h.api.subscribeMatch('A234', (value) => received.push(value));
  h.auth.resolve({ getIdToken: async () => 'test-token' });
  await flush();
  h.tick(1200);
  await flush();
  h.live({ version: 'latest' });
  h.rest.resolve({ ok: true, status: 200, json: async () => ({ version: 'stale' }) });
  await flush();
  assert.deepEqual(received, [{ version: 'latest' }]);
  assert.equal(h.timers.size, 0);
  stop();
  assert.equal(h.unsubscribed(), 1);
});

test('unsubscribing during a failed poll prevents a callable fallback and callbacks', async () => {
  const h = connection();
  const stop = h.api.subscribeMatch('A234', () => assert.fail('late match callback'), () => assert.fail('late error callback'));
  h.auth.resolve({ getIdToken: async () => 'test-token' });
  await flush();
  h.tick(1200);
  await flush();
  stop();
  h.rest.reject(new Error('offline'));
  await flush();
  assert.equal(h.actionCalls(), 0);
  assert.equal(h.timers.size, 0);
});

test('auth failure after unmount does not update a discarded screen', async () => {
  const h = connection();
  const stop = h.api.subscribeMatch('A234', () => assert.fail('late match'), () => assert.fail('late auth error'));
  stop();
  h.auth.reject(new Error('offline'));
  await flush();
  assert.equal(h.unsubscribed(), 0);
});

test('custom-bank consumers share a listener and release private data after the last unmount', async () => {
  const { createLiveList } = load('liveList');
  let connections = 0, stopped = 0, receive;
  const list = createLiveList(async () => {}, (next) => {
    connections++;
    receive = next;
    return () => stopped++;
  });
  const first = [], second = [];
  const stopFirst = list.subscribe((value) => first.push(value));
  const stopSecond = list.subscribe((value) => second.push(value));
  await flush();
  assert.equal(connections, 1);
  receive(['private-answer']);
  assert.equal(first.at(-1)[0], 'private-answer');
  assert.equal(second.at(-1)[0], 'private-answer');
  stopFirst();
  assert.equal(stopped, 0);
  stopSecond();
  assert.equal(stopped, 1);
  assert.equal(list.get().length, 0);
  receive(['stale-answer']);
  assert.equal(list.get().length, 0);
});

test('custom-bank auth failure retries while mounted and cancels retries on unmount', async () => {
  const timers = new Set();
  const { createLiveList } = load('liveList', {
    setTimeout: (fn) => { timers.add(fn); return fn; },
    clearTimeout: (fn) => timers.delete(fn),
  });
  let attempts = 0, connected = 0;
  const list = createLiveList(async () => {
    if (++attempts === 1) throw new Error('offline');
  }, () => { connected++; return () => {}; });
  const stop = list.subscribe(() => {});
  await flush();
  assert.equal(timers.size, 1);
  const retry = [...timers][0];
  timers.delete(retry);
  retry();
  await flush();
  assert.equal(connected, 1);
  stop();
  assert.equal(timers.size, 0);
});

test('custom-bank unmount during authentication never starts a detached listener', async () => {
  const { createLiveList } = load('liveList');
  const auth = deferred();
  const list = createLiveList(() => auth.promise, () => assert.fail('detached subscription'));
  const stop = list.subscribe(() => {});
  stop();
  auth.resolve();
  await flush();
});
