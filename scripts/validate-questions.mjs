import { readFile } from "node:fs/promises";

const questions = JSON.parse(
  await readFile(new URL("../src/data/questions.json", import.meta.url), "utf8")
);

const errors = [];
const ids = new Set();
const activeTexts = new Map();

function normalizedQuestion(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(ما هو|ما هي)\s+/, "")
    .trim();
}

for (const [index, q] of questions.entries()) {
  const at = `السؤال ${q.id ?? `عند الصف ${index + 1}`}`;
  if (!Number.isInteger(q.id)) errors.push(`${at}: المعرّف غير صحيح`);
  if (ids.has(q.id)) errors.push(`${at}: المعرّف مكرر`);
  ids.add(q.id);
  if (!q.question?.trim()) errors.push(`${at}: نص السؤال فارغ`);
  if (!q.type?.trim()) errors.push(`${at}: نوع السؤال فارغ`);
  if (!q.category?.trim()) errors.push(`${at}: التصنيف فارغ`);
  if (!["easy", "medium", "hard"].includes(q.level)) {
    errors.push(`${at}: مستوى الصعوبة غير صحيح`);
  }
  if (!Array.isArray(q.options)) errors.push(`${at}: الخيارات ليست قائمة`);
  if (q.type !== "acting") {
    if (!q.options?.length) errors.push(`${at}: لا توجد خيارات`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
      errors.push(`${at}: فهرس الإجابة خارج الخيارات`);
    }
  } else if (!q.disabled && !["qatari", "gulf"].includes(q.region)) {
    errors.push(`${at}: المثل المفعّل يجب تصنيفه قطرياً أو خليجياً`);
  }
  if (q.video && (!q.video.youtubeId || q.video.end <= q.video.start)) {
    errors.push(`${at}: بيانات الفيديو غير صحيحة`);
  }
  if (!q.disabled && q.type !== "flag") {
    const textKey = `${q.type}:${normalizedQuestion(q.question)}`;
    const duplicateId = activeTexts.get(textKey);
    if (duplicateId) errors.push(`${at}: مكرر بالمعنى مع السؤال ${duplicateId}`);
    else activeTexts.set(textKey, q.id);
  }
}

if (errors.length) {
  console.error(`فشل فحص بنك الأسئلة (${errors.length} مشكلة):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const byType = Object.groupBy(questions, (q) => q.type);
const activeCount = questions.filter((q) => !q.disabled).length;
console.log(`بنك الأسئلة سليم: ${activeCount} سؤالاً مفعّلاً من أصل ${questions.length}، ${Object.keys(byType).length} أنواع، ولا توجد معرّفات أو نصوص مكررة.`);
