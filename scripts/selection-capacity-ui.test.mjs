import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function render(props) {
  const path = new URL('../src/components/SelectionRecovery.tsx', import.meta.url);
  assert.ok(existsSync(path), 'selection exhaustion needs an actionable shared recovery panel');
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(source, { exports, require });
  return renderToStaticMarkup(exports.default(props));
}

test('exhausted selection explains both constraints and host recovery without offering hidden repeats', () => {
  const html = render({ host: true, paused: true, onRecheck: () => {}, onEnd: () => {} });
  assert.match(html, /role="status"/);
  assert.match(html, /آخر 10 مسابقات/);
  assert.match(html, /دورة القسم/);
  assert.match(html, /إعادة فحص المخزون/);
  assert.match(html, /إنهاء الميدان الحالي/);
  assert.doesNotMatch(html, /حذف السجل|السماح بالتكرار|الفائز/);
});

test('team recovery has no host controls and busy state does not blame another teammate', () => {
  const html = render({ host: false, paused: true, busyInventory: true });
  assert.match(html, /حجز مؤقت/);
  assert.match(html, /المقدم/);
  assert.doesNotMatch(html, /<button|سبقك/);
});

test('TV recovery uses a concise large-screen announcement instead of mobile instructions', () => {
  const html = render({ paused: true, tv: true });
  assert.match(html, /max-w-4xl/);
  assert.match(html, /text-3xl/);
  assert.doesNotMatch(html, /تغيير هوية جهازك|<button/);
});

test('available selection has no alarming pause but host can proactively recheck', () => {
  assert.equal(render({ host: false, paused: false }), '');
  const html = render({ host: true, paused: false, pending: true, onRecheck: () => {} });
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /اللعب متوقف/);
});
