const PUBLIC_PAGES: Record<string, { title: string; description: string }> = {
  '/': { title: 'الميدان | الميدان يا حميدان', description: 'مسابقة جماعية عربية للمجالس والتجمعات؛ مقدم وفرق وشاشة جمهور.' },
  '/host': { title: 'جهّز الميدان | الميدان', description: 'جهّز الفرق وعدد الأسئلة، وراجع خيارات الإجابة والمؤقت والأقسام قبل إنشاء الميدان.' },
  '/challenge': { title: 'التحدي الفردي | الميدان', description: 'تدريب فردي بأسئلة عشوائية؛ لا يوجد تصاعد تلقائي للصعوبة أو ترتيب تنافسي موثق.' },
  '/help': { title: 'طريقة اللعب واستعادة الاتصال | الميدان', description: 'دليل المقدم والفرق وشاشة الجمهور، والمؤقت والبطاقات ومنع تكرار الأسئلة.' },
  '/privacy': { title: 'البيانات وعمر الجلسة | الميدان', description: 'ما يظهر للمشاركين وما يُحفظ للمسابقة، وحدود استعادة الهوية ومهل الغرف.' },
};

export function routeMetadata(pathname: string, hostname: string) {
  const page = PUBLIC_PAGES[pathname];
  const official = hostname === 'www.qtrgame.net' || hostname === 'qtrgame.net';
  return {
    title: page?.title || (pathname === '/admin' ? 'دخول المدير | الميدان' : 'الميدان | جلسة اللعب'),
    description: page?.description || 'صفحة جلسة أو تحكم؛ احتفظ بروابط الدعوة والتحكم لدى أصحابها فقط.',
    robots: official && page ? 'index,follow' : 'noindex,nofollow',
    canonical: official && page ? `https://www.qtrgame.net${pathname}` : null,
  };
}
