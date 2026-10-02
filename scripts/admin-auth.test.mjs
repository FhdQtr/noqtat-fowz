import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/adminAuth.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function helpers(syncAdminAccess) {
  const exports = {};
  runInNewContext(source, { exports, require: () => ({ syncAdminAccess }), Map, Promise, Error });
  return exports;
}

test('Google auth iframe is allowed explicitly by the production CSP', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const firebase = readFileSync(new URL('../src/lib/firebase.ts', import.meta.url), 'utf8');
  const domain = firebase.match(/authDomain: "([^"]+)"/)[1];
  const csp = config.headers.flatMap((entry) => entry.headers).find((header) => header.key === 'Content-Security-Policy').value;
  const frames = csp.split(';').find((directive) => directive.trim().startsWith('frame-src')).trim().split(/\s+/);
  assert.ok(frames.includes(`https://${domain}`));
  assert.ok(!frames.includes('*'));
  assert.ok(csp.includes("object-src 'none'"));
});

test('listener and popup share one admin enrollment request and refresh the claim', async () => {
  let calls = 0;
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const api = helpers(async () => { calls++; await wait; });
  const user = { uid: 'owner', getIdTokenResult: async (refresh) => ({ claims: { admin: Boolean(refresh) } }) };
  const first = api.authorizeAdmin(user);
  const second = api.authorizeAdmin(user);
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  await first;
});

test('existing admin uses the verified claim and missing refreshed claim denies access', async () => {
  let calls = 0;
  const api = helpers(async () => { calls++; });
  await api.authorizeAdmin({ uid: 'admin', getIdTokenResult: async () => ({ claims: { admin: true } }) });
  assert.equal(calls, 0);
  await assert.rejects(api.authorizeAdmin({ uid: 'other', getIdTokenResult: async () => ({ claims: {} }) }), { code: 'functions/permission-denied' });
});

test('failed enrollment can be retried and errors distinguish login from access', async () => {
  let calls = 0;
  const api = helpers(async () => { if (++calls === 1) throw { code: 'functions/unavailable' }; });
  const user = { uid: 'owner', getIdTokenResult: async (refresh) => ({ claims: { admin: Boolean(refresh) } }) };
  await assert.rejects(api.authorizeAdmin(user), { code: 'functions/unavailable' });
  await api.authorizeAdmin(user);
  assert.equal(calls, 2);
  assert.match(api.adminError({ code: 'auth/popup-blocked' }, 'google'), /نافذة/);
  assert.match(api.adminError({ code: 'functions/invalid-argument' }, 'access'), /gameAction/);
  assert.match(api.adminError(new Error('private token'), 'access'), /صلاحية/);
  assert.ok(!api.adminError(new Error('private token'), 'access').includes('private token'));
});
