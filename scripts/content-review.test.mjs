import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
test('first sourced Qatar sports batch has four unique reviewed items with honest editorial difficulty', () => {
  const review = JSON.parse(readFileSync(new URL('../src/data/editorialSportsBatch1.json', import.meta.url), 'utf8'));
  assert.equal(review.entries.length, 4);
  assert.deepEqual(review.entries.map((e) => e.id), [410001,410002,410003,410004]);
  for (const entry of review.entries) {
    const q = bank.find((q) => q.id === entry.id);
    assert.ok(q && !q.disabled);
    assert.equal(q.category, 'sports');
    assert.equal(q.options[q.answer], entry.correctAnswer);
    assert.equal(q.editorialDifficulty, entry.difficulty);
    assert.ok(['medium','hard'].includes(entry.difficulty));
    assert.ok(q.conceptId && entry.sourceUrl.startsWith('https://www.olympics.com/'));
    assert.ok(entry.evidenceQuote && entry.rationale);
    assert.equal(new Set(q.options.map(normalize)).size, 4);
  }
});

test('published built-in counters match every enabled bank type after editorial refresh', async () => {
  const { BUILTIN_QUESTION_STATS, BUILTIN_QUESTION_COUNT } = await import('../src/data/questionStats.ts');
  const counts = {};
  for (const q of bank.filter((q) => !q.disabled)) counts[q.type] = (counts[q.type] || 0) + 1;
  assert.deepEqual(BUILTIN_QUESTION_STATS, counts);
  assert.equal(BUILTIN_QUESTION_COUNT, bank.filter((q) => !q.disabled).length);
});

test('varied refresh adds two original source-reviewed ordering questions without claiming calibrated difficulty', () => {
  const ids = [410101,410102];
  const expected = ['نانومتر ثم ميكرومتر ثم مليمتر ثم سنتيمتر', 'متحف الفن الإسلامي ثم متحف: المتحف العربي للفن الحديث ثم متحف قطر الوطني'];
  for (const [index, id] of ids.entries()) {
    const q = bank.find(q => q.id === id);
    assert.ok(q && !q.disabled, `new reviewed question ${id}`);
    assert.equal(q.type, 'ordering');
    assert.equal(q.options[q.answer], expected[index]);
    assert.ok(q.conceptId && q.editorialBatch === 'varied-refresh-1');
    assert.ok(['medium','hard'].includes(q.editorialDifficulty));
    assert.equal(new Set(q.options.map(normalize)).size, 4);
  }
  const lengths = [1e-9, 1e-6, 1e-3, 1e-2];
  assert.deepEqual([...lengths].sort((a,b) => a-b), lengths);
  assert.deepEqual([2008,2010,2019].sort((a,b) => a-b), [2008,2010,2019]);
});

test('reviewed poetry 920 keeps the exact missing words and correction aliases; 941 no longer gives away the sequence', () => {
  const poetry = bank.find(q => q.id === 920);
  assert.equal(poetry.options[poetry.answer], 'دون النجوم');
  assert.ok(poetry.conceptId && poetry.rotationLegacyPrompts.includes('أكمل: إذا غامرت في شرف مروم فلا تقنع بما ___'));
  const planets = bank.find(q => q.id === 941);
  assert.doesNotMatch(planets.question, /عطارد - الزهرة - الأرض - المريخ/);
  assert.equal(planets.options[planets.answer], 'عطارد - الزهرة - الأرض - المريخ');
  assert.ok(planets.conceptId && planets.rotationLegacyPrompts.includes('رتب الكواكب من الأقرب للشمس: عطارد - الزهرة - الأرض - المريخ'));
  assert.equal(bank.find(q => q.id === 924).options[1], 'طول حياته');
});

const normalize = (s) => s.normalize('NFKC').replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g,'').replace(/\s+/g,' ').trim();
test('specific internally invalid or non-unique questions remain reversibly quarantined', () => {
  for (const id of [815,816,820,828,837,847,849,932,946]) {
    const q = bank.find((q) => q.id === id);
    assert.equal(q.disabled, true, `editorial quarantine ${id}`);
    assert.ok(q.question && q.options.length && Number.isInteger(q.answer), 'preserve original content and answer');
  }
});
test('rotation copy states both owner constraints and never promises an unavailable fifteen-game policy', () => {
  const page = readFileSync(new URL('../src/pages/Play.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /آخر 15 مسابقة/);
  assert.match(page, /دورة القسم/);
  assert.match(page, /آخر 10 مسابقات/);
});

test('solo description does not promise non-existent difficulty progression', () => {
  const page = readFileSync(new URL('../src/pages/Challenge.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /متصاعدة الصعوبة/);
  assert.match(page, /عشوائي/);
});

test('completion 909 does not duplicate its own answer in the stem', () => {
  const q = bank.find((q) => q.id === 909);
  assert.equal(q.question.replace('___',q.options[q.answer]),'أكمل: من جدّ وجد');
});
test('active options cannot be equivalent after removing Arabic marks, while mathematical signs remain distinct', () => {
  assert.notEqual(normalize('-1'),normalize('1'));
  for (const q of bank.filter((q) => !q.disabled && q.type !== 'acting')) {
    assert.equal(new Set(q.options.map(normalize)).size,q.options.length,`equivalent options ${q.id}`);
  }
});
