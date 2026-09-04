// ═══════════════════════════════════════════════════════════
// الميدان — إعداد Firebase
// Realtime Database للعب المباشر + دخول ضيف تلقائي
// ═══════════════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

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
export const functions = getFunctions(app, "asia-southeast1");

// محاكي محلي للتطوير والاختبار فقط — ما يشتغل على الدومين الحقيقي
const USE_EMULATOR =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  new URLSearchParams(window.location.search).get("emu") === "1";

if (USE_EMULATOR) {
  connectDatabaseEmulator(db, window.location.hostname, 9000);
  connectFunctionsEmulator(functions, window.location.hostname, 5001);
}

let ready: Promise<User> | null = null;

/** دخول ضيف تلقائي — يشتغل مرة وحدة وننتظره قبل أي عملية */
export function ensureAuth(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("تعذّر تسجيل الدخول الآمن — تحقق من الاتصال")), 30000);
      const un = onAuthStateChanged(auth, (u) => {
        if (u) {
          clearTimeout(timeout);
          un();
          resolve(u);
        }
      });
      signInAnonymously(auth).catch((error) => {
        clearTimeout(timeout);
        un();
        reject(error);
      });
    });
  }
  return ready;
}
