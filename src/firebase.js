import { 
  getAuth, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged 
} from "firebase/auth";

const auth = getAuth(app);

// تسجيل ضيف تلقائي عند فتح الموقع
export const signInAsGuest = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.error("خطأ في تسجيل الضيف:", error);
    return null;
  }
};

// تسجيل بـ Google
export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("خطأ في تسجيل Google:", error);
    return null;
  }
};

// مراقبة حالة المستخدم
export const watchAuthState = (callback) => {
  return onAuthStateChanged(auth, callback);
};

export { auth };
