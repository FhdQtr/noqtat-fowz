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

const normalize = (s) => s.normalize('NFKC').replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g,'').replace(/\s+/g,' ').trim();
test('specific internally invalid or non-unique questions remain reversibly quarantined', () => {
  for (const id of [815,816,820,828,837,847,849,932,946]) {
    const q = bank.find((q) => q.id === id);
    assert.equal(q.disabled, true, `editorial quarantine ${id}`);
    assert.ok(q.question && q.options.length && Number.isInteger(q.answer), 'preserve original content and answer');
  }
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
