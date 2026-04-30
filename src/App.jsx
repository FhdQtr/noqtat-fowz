// ═══════════════════════════════════════════════════════════════════
// 🏆 كود زر "صراع الأبطال" للإضافة في App.jsx
// ═══════════════════════════════════════════════════════════════════
//
// المكان: بعد قسم "تحدي المعرفة" مباشرة (السطر ~2275)
// قبل: </div>  (إغلاق div الـ "Play Buttons")
//
// ─── الخطوات ─────────────────────────────────────────────────────
// 1. افتح App.jsx
// 2. ابحث عن السطر: "أجب على 100 سؤال بدون غلط - فرصة واحدة تنجيك!"
// 3. تابع للأسفل حتى تجد </div> </div>  (إغلاقين)
// 4. الصق الكود التالي بعدهما (قبل </div> الثالث الخاص بـ Play Buttons)
//
// ═══════════════════════════════════════════════════════════════════

{/* صراع الأبطال - تحدي تفاعلي متعدد اللاعبين */}
<div style={{ position: "relative" }}>
  <button
    onClick={() => window.location.href = "/arena/create"}
    style={{
      width: "100%",
      padding: "16px 24px",
      background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
      border: "2px solid #fbbf2466",
      borderRadius: 14,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      fontFamily: "Cairo, sans-serif",
      fontWeight: 800,
      fontSize: 17,
      color: "#0a0a0f",
      boxShadow: "0 4px 24px rgba(251,191,36,0.35)",
      transition: "all 0.2s ease",
      position: "relative",
      overflow: "hidden",
    }}
    onMouseOver={e => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.boxShadow = "0 8px 32px rgba(251,191,36,0.55)";
    }}
    onMouseOut={e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "0 4px 24px rgba(251,191,36,0.35)";
    }}
  >
    <span style={{ fontSize: 22 }}>🏆</span>
    صراع الأبطال
    <span style={{
      background: "#0a0a0f",
      color: "#fbbf24",
      fontSize: 10,
      fontWeight: 900,
      padding: "2px 7px",
      borderRadius: 6,
      marginRight: 4,
    }}>جديد</span>
  </button>
  <div style={{
    textAlign: "center",
    fontSize: 11,
    color: theme.textMuted,
    fontFamily: "Tajawal",
    marginTop: 4,
  }}>
    تحدّي 3 إلى 6 لاعبين على أجهزتهم - معركة معلومات بـ 14 قدرة!
  </div>
</div>
