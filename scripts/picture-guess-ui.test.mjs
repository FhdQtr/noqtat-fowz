import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/components/PictureGuessPanel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const match = { teams: { A: { name: 'أ', score: 0 }, B: { name: 'ب', score: 0 } }, teamOrder: ['A', 'B'],
  state: { phase: 'showdown', question: { id: 800001 }, showdown: { kind: 'picture_guess', number: 1, points: 200, opensAt: 1000, closesAt: 121000 } } };
const view = { questionId: 800001, pictures: { A: { name: 'دباسة', image: '/img/picture-guess/01.webp', targetTeam: 'B' }, B: { name: 'طماط', image: '/img/picture-guess/02.webp', targetTeam: 'A' } } };
function render(props, clock = 10000) {
  let stateIndex = 0;
  const exports = {};
  const mockedRequire = (name) => {
    if (name === 'react') return { ...require(name), useEffect: () => {}, useState: (initial) => [stateIndex++ === 0 ? view : initial, () => {}] };
    if (name.endsWith('/useServerNow')) return { useServerNow: () => clock };
    if (name.endsWith('/matchApi')) return { getPictureGuessView: async () => view, judgePictureGuess: async () => true };
    return require(name);
  };
  runInNewContext(source, { exports, require: mockedRequire });
  return renderToStaticMarkup(exports.default({ match, ...props }));
}

test('team UI renders only its own image and no presenter answer or scoring controls', () => {
  const html = render({ matchCode: 'A234', teamCode: 'A' });
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(html, /\/01\.webp/);
  assert.doesNotMatch(html, /\/02\.webp|دباسة|طماط|منح النقاط|استفساره:/);
});
test('host UI renders both pictures and only three result choices after timer expiry', () => {
  const html = render({ matchCode: 'A234', host: true }, 121000);
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.match(html, /دباسة/);
  assert.match(html, /طماط/);
  assert.equal((html.match(/<button/g) || []).length, 3);
  assert.match(html, /فريق أ فاز/);
  assert.match(html, /فريق ب فاز/);
  assert.match(html, /ما أحد فاز/);
  assert.doesNotMatch(html, /استفساره:|منح النقاط|تثبيت انتهاء الوقت|ابدأ الوقت/);
  assert.match(html, /bg-white/);
});
test('host alone has a start button before timer; no winner controls while timer runs', () => {
  const prepared = { ...match, state: { ...match.state, showdown: { ...match.state.showdown, opensAt: 0, closesAt: 0 } } };
  const host = render({ match: prepared, matchCode: 'A234', host: true });
  assert.equal((host.match(/<button/g) || []).length, 1);
  assert.match(host, /ابدأ الوقت/);
  assert.doesNotMatch(host, /ما أحد فاز/);
  assert.doesNotMatch(render({ match: prepared, matchCode: 'A234', teamCode: 'A' }), /<button/);
  assert.doesNotMatch(render({ matchCode: 'A234', host: true }), /<button/);
});

test('shared scoreboard announces host score correction and reason to teams', () => {
  const scoreSource = ts.transpileModule(readFileSync(new URL('../src/components/ScoreBoard.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(scoreSource, { exports, require: (name) => name.endsWith('/types/game') ? { TEAM_COLORS: { gold: { hex: '#ffd700', light: '#fff' } } } : require(name) });
  const scored = { ...match, players: {}, teams: { A: { code: 'A', name: 'أ', color: 'gold', score: 200, scoreAdjustment: { delta: 100, reason: 'تصحيح نتيجة السؤال' } }, B: { code: 'B', name: 'ب', color: 'gold', score: 0 } } };
  const html = renderToStaticMarkup(exports.default({ match: scored }));
  assert.match(html, /الحكم زاد 100 نقطة لفريق أ/);
  assert.match(html, /تصحيح نتيجة السؤال/);
  scored.teams.A.scoreAdjustment.delta = -50;
  assert.match(renderToStaticMarkup(exports.default({ match: scored })), /الحكم خصم 50 نقطة لفريق أ/);
});
test('audience UI has no images or private answers even if a view were accidentally supplied', () => {
  const html = render({});
  assert.doesNotMatch(html, /<img |\/01\.webp|\/02\.webp|دباسة|طماط|منح النقاط/);
  assert.match(html, /الصور سرية/);
});
test('nineteen object assets are unique valid WebP files and source manifest matches', () => {
  const items = JSON.parse(readFileSync(new URL('../src/data/pictureGuessItems.json', import.meta.url), 'utf8'));
  const sources = JSON.parse(readFileSync(new URL('../src/data/pictureGuessImageSources.json', import.meta.url), 'utf8'));
  assert.equal(items.length, 19);
  assert.equal(sources.length, 19);
  assert.equal(new Set(items.map((i) => i.image)).size, 19);
  assert.equal(new Set(items.map((i) => i.name)).size, 19);
  for (const item of items) {
    const image = readFileSync(new URL(`../public${item.image}`, import.meta.url));
    assert.equal(image.subarray(0, 4).toString(), 'RIFF');
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
    assert.equal(sources.find((s) => s.id === item.id)?.name, item.name);
  }
});
