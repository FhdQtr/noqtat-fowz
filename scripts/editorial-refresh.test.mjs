import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const batch = JSON.parse(readFileSync(new URL('../src/data/editorialVariedBatch2.json', import.meta.url), 'utf8'));
const withBatch = (mutate, check) => {
  const dir = mkdtempSync(join(tmpdir(), 'al-midan-editorial-'));
  try {
    const fixture = structuredClone(batch);
    mutate(fixture);
    const path = join(dir,'batch.json');
    writeFileSync(path, JSON.stringify(fixture));
    check(run('--batch', path));
  } finally { rmSync(dir,{recursive:true,force:true}); }
};

test('controlled refresh rejects a source manifest whose answer no longer matches the bank', () => {
  withBatch(b => { b.entries[0].correctAnswer = 'مخازن اللؤلؤ'; }, result => {
    assert.equal(result.status, 1, 'must reject answer drift rather than produce a success report');
    assert.match(result.stderr, /410201.*answer/i);
    assert.equal(result.stdout, '');
  });
});
const run = (...args) => spawnSync(process.execPath, ['scripts/review-editorial-batch.mjs', ...args], { cwd: root, encoding: 'utf8' });

test('controlled refresh rejects duplicate or oversized batches and incomplete provenance/difficulty metadata', () => {
  const mutations = [
    b => { b.entries.push(b.entries[0]); },
    b => { b.entries = []; },
    b => { b.entries = Array.from({length:26}, () => b.entries[0]); },
    b => { b.entries[0].sourceUrl = 'http://example.org/unreviewed'; },
    b => { delete b.entries[0].evidenceQuote; },
    b => { b.entries[0].difficulty = 'easy'; },
    b => { b.batch = 'renamed-batch'; },
  ];
  for (const mutate of mutations) withBatch(mutate, result => {
    assert.equal(result.status, 1, 'invalid editorial metadata must fail closed');
    assert.equal(result.stdout, '');
  });
  assert.equal(run('--batch','src/data/editorialVariedBatch2.json','--apply').status,1);
});

test('controlled refresh emits an honest read-only coverage report for the reviewed batch', () => {
  const before = readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8');
  const result = run('--batch', 'src/data/editorialVariedBatch2.json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.batch, 'varied-refresh-2');
  assert.equal(report.entries, 8);
  assert.equal(report.sourceVerifiedByTool, false);
  assert.equal(report.liveCapacityVerified, false);
  assert.equal(report.writesPerformed, false);
  assert.deepEqual(report.difficultyEstimates, {easy:1,medium:4,hard:3});
  assert.deepEqual(report.byType, {completion:2,multiple_choice:3,ordering:2,true_false:1});
  assert.equal(report.bank.active, 1307);
  assert.equal(report.bank.uncalibratedActive, 1293);
  assert.equal(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'), before);
});
