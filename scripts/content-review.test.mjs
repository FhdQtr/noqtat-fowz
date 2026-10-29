import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
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
