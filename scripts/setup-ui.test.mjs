import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function renderSetup() {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/pages/HostSetup.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const load = (name) => {
    if (name === 'react-router') return { useNavigate: () => () => {}, Link: ({ to, children, ...props }) => require('react').createElement('a', { href: to, ...props }, children) };
    if (name === '../lib/useCustomBank') return { useCustomTypes: () => [] };
    if (name === '../lib/matchApi') return { createMatch: () => { throw new Error('No backend calls during setup rendering'); } };
    if (name === '../lib/sounds') return { sfx: {}, unlockAudio: () => {} };
    if (name === '../types/game') return { TEAM_COLORS: Object.fromEntries(['maroon', 'emerald', 'royal', 'gold'].map(c => [c, { light: '#fff', label: c }])) };
    if (name.startsWith('../components/')) return { default: () => null };
    return require(name);
  };
  runInNewContext(source, { exports, require: load });
  return renderToStaticMarkup(require('react').createElement(exports.default));
}

test('setup announces all existing selected states and explains each device without claiming phone-free mode', () => {
  const html = renderSetup();
  assert.match(html, /aria-pressed="true"[^>]*>8<\/button>/);
  assert.match(html, /aria-pressed="true"[^>]*><span[^>]*>ممثل الفريق/);
  assert.match(html, /aria-pressed="true"[^>]*>اختيار من متعدد<\/button>/);
  assert.match(html, /المقدم يدير اللعب ويحتسب النقاط/);
  assert.match(html, /جوال واحد على الأقل لكل فريق/);
  assert.match(html, /شاشة الجمهور للعرض/);
  assert.match(html, /حتى في وضع «المقدم فقط»/);
});

test('quick setup hides advanced controls by default but keeps their values in a visible summary', () => {
  const html = renderSetup();
  assert.match(html, /<details[^>]*id="advanced-setup"[^>]*><summary/);
  assert.doesNotMatch(html, /<details[^>]*id="advanced-setup"[^>]*open/);
  assert.match(html, /خيارات متقدمة/);
  assert.match(html, /id="setup-summary"/);
  assert.match(html, /11 قسمًا/);
  assert.match(html, /ممثل الفريق/);
  assert.match(html, /بدون وقت/);
  assert.match(html, /سؤال وعقاب مفعّل/);
  assert.equal((html.match(/ابدأ الميدان/g) || []).length, 1);
});
