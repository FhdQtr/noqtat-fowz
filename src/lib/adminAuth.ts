import type { User } from "firebase/auth";
import { syncAdminAccess } from "./matchApi";

const pending = new Map<string, Promise<void>>();

/** Share the access check between the auth listener and the popup callback. */
export function authorizeAdmin(user: User): Promise<void> {
  const existing = pending.get(user.uid);
  if (existing) return existing;
  const check = (async () => {
    if ((await user.getIdTokenResult()).claims.admin === true) return;
    await syncAdminAccess();
    if ((await user.getIdTokenResult(true)).claims.admin !== true) {
      throw Object.assign(new Error("Admin access denied"), { code: "functions/permission-denied" });
    }
  })();
  const result = check.finally(() => pending.delete(user.uid));
  pending.set(user.uid, result);
  return result;
}

export function adminError(error: unknown, stage: "google" | "access"): string {
  const code = (error as { code?: string } | null)?.code;
  const messages: Record<string, string> = {
    "auth/operation-not-allowed": "تسجيل Google غير مفعّل في Firebase؛ فعّله من إعدادات تسجيل الدخول.",
    "auth/unauthorized-domain": "نطاق الموقع غير معتمد في Firebase؛ أضف qtrgame.net وwww.qtrgame.net إلى النطاقات المصرح بها.",
    "auth/popup-blocked": "المتصفح منع نافذة Google؛ اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مجددًا.",
    "auth/popup-closed-by-user": "أُغلقت نافذة Google قبل اكتمال الدخول؛ اضغط دخول Google للمحاولة مجددًا.",
    "auth/cancelled-popup-request": "توجد محاولة دخول أخرى؛ أكمل نافذة Google المفتوحة أو أغلقها ثم أعد المحاولة.",
    "auth/account-exists-with-different-credential": "البريد مرتبط بطريقة دخول أخرى؛ ادخل بالبريد وكلمة المرور الحالية أولًا.",
    "auth/network-request-failed": "تعذّر الاتصال بخدمة الدخول؛ تحقق من الإنترنت ثم أعد المحاولة.",
    "auth/web-storage-unsupported": "المتصفح لا يسمح بحفظ جلسة الدخول؛ افتح الموقع في Safari أو Chrome العادي.",
    "functions/permission-denied": "الحساب لا يملك صلاحية الإدارة؛ اختر حساب المدير المصرح له.",
    "functions/invalid-argument": "اكتمل دخول Google، لكن خدمة صلاحيات الإدارة تحتاج تحديث gameAction في Firebase.",
    "functions/not-found": "خدمة صلاحيات الإدارة غير منشورة؛ حدّث gameAction في Firebase.",
    "functions/unauthenticated": "جلسة الدخول لم تُعتمد؛ أعد تسجيل الدخول بحساب Google.",
    "functions/resource-exhausted": "محاولات كثيرة؛ انتظر دقيقة ثم أعد التحقق من صلاحية حسابك.",
    "functions/deadline-exceeded": "تأخر التحقق من صلاحية الإدارة؛ أعد التحقق بعد قليل.",
    "functions/unavailable": "خدمة التحقق من صلاحية الإدارة غير متاحة الآن؛ أعد المحاولة بعد قليل.",
  };
  const message = (code && messages[code]) || (stage === "access"
    ? "تم تسجيل الدخول، لكن تعذّر التحقق من صلاحية الإدارة؛ أعد التحقق."
    : "تعذّر إكمال دخول Google؛ حاول من Safari أو Chrome العادي.");
  return code && /^[a-z-]+\/[a-z-]+$/.test(code) ? `${message} (${code})` : message;
}
