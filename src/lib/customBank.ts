// ═══════════════════════════════════════════════════════════
// الميدان — بنك أسئلة المقدم المخصص + إعدادات لوحة التحكم
// يُخزَّن في Realtime Database ويُدمج مع البنك الأصلي في السحب
// ═══════════════════════════════════════════════════════════
import { ref, set, update, remove, onValue, type Unsubscribe } from "firebase/database";
import { db, ensureAuth } from "./firebase";
import { registerTypeLabels } from "../types/game";
import type { Question, QuestionLevel, CustomType } from "../types/game";

export interface CustomQuestion extends Question {
  disabled?: boolean;
  createdAt?: number;
}

const FIRST_CUSTOM_ID = 900000; // أسئلة المقدم تبدأ من ٩٠٠٠٠٠ بعيداً عن أرقام البنك الأصلي

// ─── المزامنة الحية: أي تغيير في Firebase ينعكس فوراً على اللعبة ───
let typesStarted = false;
let questionsStarted = false;
let latestTypes: CustomType[] = [];
let latestQuestions: CustomQuestion[] = [];
const typeListeners = new Set<(t: CustomType[]) => void>();
const questionListeners = new Set<(q: CustomQuestion[]) => void>();

function emit() {
  typeListeners.forEach((cb) => cb(latestTypes));
  questionListeners.forEach((cb) => cb(latestQuestions));
}

/** يشتغل مرة وحدة — يبقي نسخة محلية محدثة من البنك المخصص */
function startTypeSync() {
  if (typesStarted) return;
  typesStarted = true;
  void ensureAuth().then(() => {
    onValue(ref(db, "customTypes"), (s) => {
      const v = (s.val() ?? {}) as Record<string, CustomType>;
      latestTypes = Object.values(v).sort((a, b) => a.createdAt - b.createdAt);
      registerTypeLabels(latestTypes);
      emit();
    });
  });
}

function startQuestionSync() {
  if (questionsStarted) return;
  questionsStarted = true;
  void ensureAuth().then(() => {
    onValue(ref(db, "customQuestions"), (s) => {
      const v = (s.val() ?? {}) as Record<string, CustomQuestion>;
      latestQuestions = Object.values(v).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      emit();
    });
  });
}

/** الاشتراك في قائمة الأنواع المخصصة */
export function subscribeCustomTypes(cb: (t: CustomType[]) => void): Unsubscribe {
  startTypeSync();
  typeListeners.add(cb);
  cb(latestTypes);
  return () => typeListeners.delete(cb);
}

/** الاشتراك في قائمة أسئلة المقدم (كلها — بما فيها المعطّلة، للوحة التحكم) */
export function subscribeCustomQuestions(cb: (q: CustomQuestion[]) => void): Unsubscribe {
  startQuestionSync();
  questionListeners.add(cb);
  cb(latestQuestions);
  return () => questionListeners.delete(cb);
}

export function getCustomTypes(): CustomType[] {
  startTypeSync();
  return latestTypes;
}

// ─── الأنواع المخصصة ───
export async function addCustomType(name: string): Promise<CustomType> {
  await ensureAuth();
  const clean = name.trim().slice(0, 30);
  const existing = latestTypes.find(
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
  return latestQuestions.reduce((mx, q) => Math.max(mx, q.id), FIRST_CUSTOM_ID - 1) + 1;
}

export async function addCustomQuestion(q: Omit<CustomQuestion, "id" | "createdAt">): Promise<CustomQuestion> {
  await ensureAuth();
  const full: CustomQuestion = { ...q, id: nextCustomId(), createdAt: Date.now() };
  await set(ref(db, `customQuestions/${full.id}`), full);
  // إضافة محلية فورية حتى لا يتكرر الرقم عند الإضافة السريعة المتتالية (المزامنة تحدّث القائمة لاحقاً)
  if (!latestQuestions.some((x) => x.id === full.id)) latestQuestions = [...latestQuestions, full];
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
  return { version: 1, exportedAt: Date.now(), types: latestTypes, questions: latestQuestions };
}

/** استرجاع نسخة احتياطية — يدمج ولا يمسح الموجود */
export async function importBackup(b: BankBackup) {
  await ensureAuth();
  for (const t of b.types ?? []) {
    if (!latestTypes.some((x) => x.id === t.id)) {
      await set(ref(db, `customTypes/${t.id}`), t);
    }
  }
  for (const q of b.questions ?? []) {
    if (!latestQuestions.some((x) => x.id === q.id)) {
      await set(ref(db, `customQuestions/${q.id}`), q);
    }
  }
}

/** أرقام ثابتة لعرض المستويات */
export const LEVELS: QuestionLevel[] = ["easy", "medium", "hard"];
