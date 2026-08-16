/** شاشة لودينج بسيطة أثناء التحقق من جلسة الدخول (Supabase) عند فتح
 * التطبيق أول مرة — بديل النص الخام "...جاري التحميل" اللي كان بيظهر
 * من غير أي تصميم. نفس اللغة البصرية بتاعة Splash (تدرّج غامق + شعار +
 * لمسة ذهبية) لكن من غير الـ choreography ثابتة المدة بتاعتها، لأن مدة
 * التحقق من الجلسة متغيرة مش ثابتة على 3.4 ثانية.
 */
export function AuthLoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: 'linear-gradient(165deg, #04141A 0%, #061F27 35%, #092F3A 70%, #061F27 100%)',
      }}
    >
      <div className="pointer-events-none absolute -top-40 right-1/4 w-[36rem] h-[36rem] rounded-full bg-primary-500/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-20 w-[28rem] h-[28rem] rounded-full bg-gold-400/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 dot-bg opacity-[0.06]" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl border-2 border-gold-400/40 splash-ring" />
          <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-white w-16 h-16">
            <img src="/favicon.jpeg" alt="مُحَكِّم" className="w-full h-full object-cover" />
          </div>
        </div>

        <div
          className="mt-5 text-white tracking-tight leading-none"
          style={{ fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif', fontSize: '1.7rem', fontWeight: 700 }}
        >
          مُحَكِّم
        </div>

        <div className="mt-5 w-40 h-0.5 rounded-full bg-primary-300/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-l from-gold-400 to-primary-400 splash-bar-fill" />
        </div>
      </div>
    </div>
  );
}