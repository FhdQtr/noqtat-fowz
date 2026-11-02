// ═══════════════════════════════════════════════════════════
// الميدان — إعداد Firebase
// Realtime Database للعب المباشر + دخول ضيف تلقائي
// ═══════════════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getAuth, signInAnonymously, connectAuthEmulator, type User } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { backendTarget } from "./backendPolicy";

const firebaseConfig = {
  apiKey: "AIzaSyBnMTGZ2_YXNL5cjE4fzYyA3M_XD7ZXKck",
  authDomain: "noqtat-fowz-d13aa.firebaseapp.com",
  databaseURL: "https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "noqtat-fowz-d13aa",
  storageBucket: "noqtat-fowz-d13aa.firebasestorage.app",
  messagingSenderId: "481624442217",
  appId: "1:481624442217:web:f36bc520b71f64ce9aa9f8",
};

export const backend = backendTarget(typeof window === "undefined" ? "" : window.location.hostname, import.meta.env.PROD, import.meta.env.VITE_BACKEND_MODE);
const USE_EMULATOR = backend.mode === "emulator";
const isolatedConfig = { apiKey: "demo-al-midan-key", authDomain: "demo-al-midan.firebaseapp.com", projectId: "demo-al-midan", databaseURL: "https://demo-al-midan-default-rtdb.firebaseio.com", appId: "demo-al-midan" };

export const app = initializeApp(backend.mode === "production" ? firebaseConfig : isolatedConfig);
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim();
const appCheckReady = backend.mode === "production" && appCheckSiteKey
  ? import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    })
  : Promise.resolve();
export const db = getDatabase(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "asia-southeast1");

if (USE_EMULATOR) {
  connectAuthEmulator(auth, `http://${window.location.hostname}:9099`, { disableWarnings: true });
  connectDatabaseEmulator(db, window.location.hostname, 9000);
  connectFunctionsEmulator(functions, window.location.hostname, 5001);
}

let ready: Promise<User> | null = null;

/** دخول ضيف تلقائي — يشتغل مرة وحدة وننتظره قبل أي عملية */
export async function ensureAuth(): Promise<User> {
  if (backend.mode === "disabled") throw new Error("هذه معاينة بلا اتصال ببيانات اللعب؛ يلزم محاكي محلي أو بيئة اختبار منفصلة.");
  await appCheckReady;
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!ready) {
    ready = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            // Restore persisted Google/guest sessions before creating a guest.
            await auth.authStateReady();
            return auth.currentUser ?? (await signInAnonymously(auth)).user;
          })(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("تعذّر تسجيل الدخول الآمن — تحقق من الاتصال")), 30000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => { ready = null; });
  }
  return ready;
}
