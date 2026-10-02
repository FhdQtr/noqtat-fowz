import { Component, type ReactNode } from "react";

/** Keep a recoverable screen visible if rendering or a lazy route fails. */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main dir="rtl" className="grid min-h-dvh place-items-center bg-[#100c0a] px-6 text-[#f8f0e1]">
        <section role="alert" className="w-full max-w-md rounded-3xl border border-[#b99858]/40 bg-[#241a15] p-8 text-center shadow-2xl">
          <p className="mb-3 text-sm text-[#d9b66f]">الميدان</p>
          <h1 className="text-2xl font-bold">تعذّر عرض الصفحة</h1>
          <p className="mt-4 leading-8 text-[#ddd0bd]">تحقق من الاتصال وأعد المحاولة. إذا كنت داخل مسابقة، إعادة تحميل الصفحة تحاول فتح المسابقة نفسها.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 min-h-12 w-full rounded-xl bg-[#e0bd60] px-5 py-3 font-bold text-[#21160c] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e0bd60]">
            إعادة المحاولة
          </button>
          <a href="/" className="mt-3 block rounded-xl border border-[#b99858]/50 px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e0bd60]">العودة للرئيسية</a>
        </section>
      </main>
    );
  }
}
