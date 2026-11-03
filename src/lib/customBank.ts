// ═══════════════════════════════════════════════════════════
// الميدان — بنك أسئلة المقدم المخصص + إعدادات لوحة التحكم
// يُخزَّن في Realtime Database ويُدمج مع البنك الأصلي في السحب
// ═══════════════════════════════════════════════════════════
import { ref, set, update, remove, onValue, type Unsubscribe } from "firebase/database";
import { db, ensureAuth } from "./firebase";
import { registerTypeLabels } from "../types/game";
import type { Question, CustomType } from "../types/game";
import { createLiveList } from "./liveList";
import type { BrandInfo } from "./matchApi";

export interface CustomQuestion extends Question {
  brandInfo?: BrandInfo;
  disabled?: boolean;
  createdAt?: number;
}

const FIRST_CUSTOM_ID = 900000; // أسئلة المقدم تبدأ من ٩٠٠٠٠٠ بعيداً عن أرقام البنك الأصلي

// Shared listeners release private cached questions when the admin screen closes.
const types = createLiveList<CustomType>(ensureAuth, (receive, failed) =>
  onValue(ref(db, "customTypes"), (snapshot) => {
    const value = Object.values((snapshot.val() ?? {}) as Record<string, CustomType>)
      .sort((a, b) => a.createdAt - b.createdAt);
    registerTypeLabels(value);
    receive(value);
  }, failed),
);
const questions = createLiveList<CustomQuestion>(ensureAuth, (receive, failed) =>
  onValue(ref(db, "customQuestions"), (snapshot) => {
    receive(Object.values((snapshot.val() ?? {}) as Record<string, CustomQuestion>)
      .map((question) => ({ ...question, options: question.options || [] }))
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)));
  }, failed),
);

export function subscribeCustomTypes(cb: (value: CustomType[]) => void): Unsubscribe {
  return types.subscribe(cb);
}

export function subscribeCustomQuestions(cb: (value: CustomQuestion[]) => void): Unsubscribe {
  return questions.subscribe(cb);
}

// ─── الأنواع المخصصة ───
export async function addCustomType(name: string): Promise<CustomType> {
  await ensureAuth();
  const clean = name.trim().slice(0, 30);
  const existing = types.get().find(
    (t) => t.name === clean
  );
  if (existing) return existing;
  const t: CustomType = {
    id: `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    createdAt: Date.now(),
  };
  await set(ref(db, `customTypes/${t.id}`), t);
  return t;
}

export async function renameCustomType(id: string, name: string) {
  await ensureAuth();
  await update(ref(db, `customTypes/${id}`), { name: name.trim().slice(0, 30) });
}

export async function deleteCustomType(id: string) {
  await ensureAuth();
  await remove(ref(db, `customTypes/${id}`));
}

// ─── أسئلة المقدم ───
function nextCustomId(): number {
  return Math.max(Date.now(), questions.get().reduce((mx, q) => Math.max(mx, q.id), FIRST_CUSTOM_ID - 1) + 1);
}

export async function addCustomQuestion(q: Omit<CustomQuestion, "id" | "createdAt">): Promise<CustomQuestion> {
  await ensureAuth();
  const full: CustomQuestion = { ...q, id: nextCustomId(), createdAt: Date.now() };
  await set(ref(db, `customQuestions/${full.id}`), full);
  // إضافة محلية فورية حتى لا يتكرر الرقم عند الإضافة السريعة المتتالية (المزامنة تحدّث القائمة لاحقاً)
  if (!questions.get().some((x) => x.id === full.id)) questions.replace([...questions.get(), full]);
  return full;
}

export async function updateCustomQuestion(id: number, patch: Partial<CustomQuestion>) {
  await ensureAuth();
  await update(ref(db, `customQuestions/${id}`), patch as Record<string, unknown>);
}

export async function deleteCustomQuestion(id: number) {
  await ensureAuth();
  await remove(ref(db, `customQuestions/${id}`));
}

export async function setQuestionDisabled(id: number, disabled: boolean) {
  await ensureAuth();
  await update(ref(db, `customQuestions/${id}`), { disabled });
}

// ─── أدوات الوسائط ───
/** ضغط صورة وتصغيرها قبل الحفظ (حتى تبقى خفيفة داخل قاعدة البيانات) */
export function compressImage(file: File, maxWidth = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("تعذّرت معالجة الصورة"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("الملف ليس صورة صالحة"));
    };
    img.src = url;
  });
}

/** استخراج معرّف فيديو يوتيوب من أي شكل رابط */
export function parseYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}

// ─── النسخ الاحتياطي ───
export interface BankBackup {
  version: 1;
  exportedAt: number;
  types: CustomType[];
  questions: CustomQuestion[];
}

export function exportBackup(): BankBackup {
  return { version: 1, exportedAt: Date.now(), types: types.get(), questions: questions.get() };
}

/** استرجاع نسخة احتياطية — يدمج ولا يمسح الموجود */
export async function importBackup(b: BankBackup) {
  await ensureAuth();
  for (const t of b.types ?? []) {
    if (!types.get().some((x) => x.id === t.id)) {
      await set(ref(db, `customTypes/${t.id}`), t);
    }
  }
  for (const q of b.questions ?? []) {
    if (!questions.get().some((x) => x.id === q.id)) {
      await set(ref(db, `customQuestions/${q.id}`), q);
    }
  }
}
