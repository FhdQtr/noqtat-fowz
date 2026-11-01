import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const counts = values => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(v => v === value).length]));
const args = process.argv.slice(2);
try {
  if (args.length !== 2 || args[0] !== '--batch') throw new Error('Usage: node scripts/review-editorial-batch.mjs --batch PATH (read-only; no deploy/apply mode)');
  const batch = JSON.parse(readFileSync(resolve(root,args[1]),'utf8'));
  const bank = JSON.parse(readFileSync(resolve(root,'src/data/questions.json'),'utf8'));
  if (typeof batch.batch !== 'string' || !batch.batch.trim() || !Array.isArray(batch.entries) || batch.entries.length < 1 || batch.entries.length > 25) throw new Error('A named batch must contain 1–25 reviewed entries');
  if (new Set(batch.entries.map(e => e.id)).size !== batch.entries.length) throw new Error('Duplicate IDs in editorial batch');
  const selected = batch.entries.map(entry => {
    const q = bank.find(q => q.id === entry.id);
    if (!q || q.disabled) throw new Error(`${entry.id}: missing or disabled bank item`);
    if (q.options[q.answer] !== entry.correctAnswer) throw new Error(`${entry.id}: answer drift`);
    if (!q.conceptId || q.editorialBatch !== batch.batch || q.editorialDifficulty !== entry.difficulty || !['easy','medium','hard'].includes(entry.difficulty)) throw new Error(`${entry.id}: concept/batch/difficulty metadata drift`);
    const source = new URL(entry.sourceUrl);
    if (source.protocol !== 'https:' || source.username || source.password || !entry.evidenceFile || !entry.evidenceQuote?.trim() || !entry.rationale?.trim()) throw new Error(`${entry.id}: incomplete source evidence`);
    return q;
  });
  const active = bank.filter(q => !q.disabled);
  console.log(JSON.stringify({
    batch: batch.batch,
    entries: selected.length,
    byType: counts(selected.map(q => q.type)),
    byCategory: counts(selected.map(q => q.category)),
    difficultyEstimates: counts(selected.map(q => q.editorialDifficulty)),
    bank: { total: bank.length, active: active.length, uncalibratedActive: active.filter(q => !q.editorialDifficulty).length },
    sourceVerifiedByTool: false,
    liveCapacityVerified: false,
    writesPerformed: false,
    warning: 'Metadata consistency only; not independent factual verification, player calibration or live/custom capacity. Keep section exhaustion AND previous10 consumed-competition exclusion.'
  },null,2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
