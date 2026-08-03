// ═══════════════════════════════════════════════════════════
// نقطة فوز — إعداد Firebase (نفس مشروعك الحالي)
// Realtime Database للعب المباشر + دخول ضيف تلقائي
// ═══════════════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBnMTGZ2_YXNL5cjE4fzYyA3M_XD7ZXKck",
  authDomain: "noqtat-fowz-d13aa.firebaseapp.com",
  databaseURL: "https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "noqtat-fowz-d13aa",
  storageBucket: "noqtat-fowz-d13aa.firebasestorage.app",
  messagingSenderId: "481624442217",
  appId: "1:481624442217:web:f36bc520b71f64ce9aa9f8",
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// محاكي محلي للتطوير والاختبار فقط — ما يشتغل على الدومين الحقيقي
const USE_EMULATOR =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  new URLSearchParams(window.location.search).get("emu") === "1";

if (USE_EMULATOR) {
  connectDatabaseEmulator(db, window.location.hostname, 9000);
}

let ready: Promise<void> | null = null;

/** دخول ضيف تلقائي — يشتغل مرة وحدة وننتظره قبل أي عملية */
export function ensureAuth(): Promise<void> {
  if (USE_EMULATOR) return Promise.resolve(); // المحاكي بقواعد مفتوحة
  if (!ready) {
    ready = new Promise((resolve) => {
      const un = onAuthStateChanged(auth, (u) => {
        if (u) {
          un();
          resolve();
        }
      });
      signInAnonymously(auth).catch(() => resolve());
    });
  }
  return ready;
}
