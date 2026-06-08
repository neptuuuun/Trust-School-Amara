import React, { useState } from 'react';

// ─── helpers ────────────────────────────────────────────────────────────────

const Section = ({ id, title, children }) => (
  <section id={id} className="space-y-5 scroll-mt-20">
    <h2 className="text-2xl font-bold text-primary flex items-center gap-2 border-b-2 border-primary/20 pb-2">
      {title}
    </h2>
    {children}
  </section>
);

const SubSection = ({ title, children }) => (
  <div className="space-y-2">
    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
    {children}
  </div>
);

const Note = ({ color = 'blue', children }) => {
  const palette = {
    blue:   'bg-secondary-50 border-secondary-200 text-secondary-900',
    green:  'bg-success-50   border-success-200   text-success-900',
    yellow: 'bg-warning-50   border-warning-200   text-warning-900',
    red:    'bg-danger-50    border-danger-200    text-danger-900',
  };
  return (
    <div className={`rounded-xl border p-4 text-sm leading-relaxed ${palette[color]}`}>
      {children}
    </div>
  );
};

const Step = ({ n, text, sub }) => (
  <div className="flex items-start gap-3">
    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center mt-0.5">
      {n}
    </span>
    <div>
      <p className="font-medium text-gray-900">{text}</p>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Qa = ({ q, a }) => (
  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
    <div className="bg-gray-50 px-5 py-3 font-semibold text-gray-900 text-sm border-b border-gray-200">
      {q}
    </div>
    <div className="px-5 py-3 text-sm text-gray-700 leading-relaxed">{a}</div>
  </div>
);

const TOC = [
  { id: 's0',  label: 'نظرة عامة على لوحة الإدارة' },
  { id: 's1',  label: 'إدارة الطلاب وقبول الحسابات' },
  { id: 's2',  label: 'الرسوم السنوية' },
  { id: 's3',  label: 'دروس الدعم' },
  { id: 's4',  label: 'دورات اللغات' },
  { id: 's5',  label: 'الدورات التكوينية' },
  { id: 's6',  label: 'الإعلانات' },
  { id: 's7',  label: 'مواقف شائعة وكيف تتعامل معها' },
  { id: 's8',  label: 'أسئلة متكررة' },
];

// ════════════════════════════════════════════════════════════════════════════

const AdminGuide = () => {
  const [tocOpen, setTocOpen] = useState(true);

  return (
    <div className="space-y-6" dir="rtl">

      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">دليل المشرف</h1>
        <p className="text-gray-500 text-lg">
          تعليمات عملية لإدارة الفرع — خطوة بخطوة، بدون تعقيدات.
        </p>
      </div>

      {/* TOC */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <button
          onClick={() => setTocOpen(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4"
        >
          <span className="font-bold text-gray-900 text-base">المحتويات</span>
          <span className="text-gray-400">{tocOpen ? '▲' : '▼'}</span>
        </button>
        {tocOpen && (
          <div className="border-t border-gray-100 px-6 pb-5 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
            {TOC.map(t => (
              <a key={t.id} href={`#${t.id}`} className="text-primary hover:underline text-sm py-1">
                {t.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ─── Content card ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 sm:p-8 space-y-14">

        {/* ══════════════════════════════════════════
            SECTION 0 — OVERVIEW
        ══════════════════════════════════════════ */}
        <Section id="s0" title="نظرة عامة على لوحة الإدارة">
          <p className="text-gray-700">
            لوحة الإدارة تتيح لك إدارة جميع شؤون فرعك من مكان واحد.
            تأكد دائماً من اختيار <strong>الفرع الصحيح</strong> من القائمة في أعلى الصفحة
            قبل البدء بأي عملية.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: 'المستخدمون',            desc: 'قبول أو رفض حسابات الطلاب الجدد وإنشاء حسابات جديدة.' },
              { title: 'الرسوم السنوية',        desc: 'مراجعة طلبات الدفع السنوي والموافقة عليها.' },
              { title: 'التحقق من المدفوعات',   desc: 'مكان واحد لمعالجة كل طلبات الدفع المعلقة.' },
              { title: 'دروس الدعم',            desc: 'إدارة تسجيلات دروس الدعم وتجديدها وحذفها.' },
              { title: 'دورات اللغات',          desc: 'عرض الطلاب المسجلين في دورات اللغات.' },
              { title: 'الدورات التكوينية',     desc: 'عرض الطلاب المسجلين في الدورات التكوينية.' },
              { title: 'الإعلانات',             desc: 'نشر إعلانات لطلاب فرعك.' },
              { title: 'دليل المشرف',           desc: 'هذه الصفحة.' },
            ].map(({ title, desc }) => (
              <div key={title} className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">
                <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-100 flex-shrink-0 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 1 — STUDENTS
        ══════════════════════════════════════════ */}
        <Section id="s1" title="إدارة الطلاب وقبول الحسابات">

          <SubSection title="كيف يصل طلب التسجيل إليك">
            <p className="text-gray-700">
              عندما يسجل طالب من خلال الموقع، يظهر حسابه في صفحة <strong>المستخدمون</strong>
              بحالة <span className="font-semibold text-warning-700">«قيد المراجعة»</span>.
              مهمتك مراجعة بياناته ثم القبول أو الرفض.
            </p>
          </SubSection>

          <SubSection title="خطوات قبول حساب طالب">
            <div className="space-y-3">
              <Step n="1" text="افتح صفحة «المستخدمون» من القائمة الجانبية." />
              <Step n="2" text="فلتر قيد المراجعة" sub="اضغط على زر «قيد المراجعة» لعرض الطلبات الجديدة فقط." />
              <Step n="3" text="راجع بيانات الطالب" sub="تحقق من الاسم والهاتف والصورة الشخصية وبطاقة الهوية." />
              <Step n="4" text="اضغط «قبول» إذا كانت البيانات صحيحة أو «رفض» إذا كانت غير مكتملة." />
            </div>
            <Note color="green">
              بعد القبول، يتلقى الطالب إشعاراً تلقائياً ويمكنه الدخول للوحته فوراً.
            </Note>
            <Note color="yellow">
              تنبيه: عند الرفض، يُحذف تلقائياً كل مستندات الطالب المرفوعة (الصورة وبطاقة الهوية).
            </Note>
          </SubSection>

          <SubSection title="إنشاء حساب طالب مباشرة">
            <p className="text-gray-700">
              إذا أردت إضافة طالب مسجّل لديك يدوياً (مثلاً طالب حضر للفرع شخصياً)،
              يمكنك إنشاء حسابه مباشرة دون أن ينتظر.
            </p>
            <div className="space-y-3 mt-3">
              <Step n="1" text="افتح صفحة «المستخدمون»." />
              <Step n="2" text="اضغط على زر «إنشاء حساب طالب» في أعلى الصفحة." />
              <Step n="3" text="أدخل: الاسم الكامل، البريد الإلكتروني، رقم الهاتف، كلمة المرور الأولية." />
              <Step n="4" text="اضغط «إنشاء»." />
            </div>
            <Note color="blue">
              الحساب المنشأ بهذه الطريقة يكون <strong>مقبولاً فوراً</strong> ولا يحتاج إلى موافقة إضافية.
              يمكن للطالب تسجيل الدخول مباشرة.
            </Note>
          </SubSection>

          <SubSection title="حالات الحساب">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold text-gray-700">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold text-gray-700">المعنى</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="px-4 py-3 text-warning-700 font-medium">قيد المراجعة</td><td className="px-4 py-3 text-gray-700">سجّل حديثاً، ينتظر قرار المشرف</td></tr>
                  <tr><td className="px-4 py-3 text-success-700 font-medium">مقبول</td><td className="px-4 py-3 text-gray-700">حساب نشط، يمكنه الدخول والتسجيل</td></tr>
                  <tr><td className="px-4 py-3 text-danger-700 font-medium">مرفوض</td><td className="px-4 py-3 text-gray-700">رُفض الحساب، لا يمكنه الدخول</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 2 — ANNUAL FEES
        ══════════════════════════════════════════ */}
        <Section id="s2" title="الرسوم السنوية">

          <p className="text-gray-700">
            الرسوم السنوية هي اشتراك سنوي يدفعه الطالب ليحق له التسجيل في دروس الدعم.
            الطالب يرفع صورة إيصال الدفع، وأنت تراجعه وتوافق أو ترفض.
          </p>

          <SubSection title="كيف يصل طلب الرسوم السنوية إليك">
            <p className="text-gray-700">
              يمكنك مراجعة الطلبات من مكانين:
            </p>
            <ul className="list-disc ps-6 space-y-1 text-gray-700 text-sm mt-2">
              <li><strong>صفحة «الرسوم السنوية»:</strong> تعرض جميع الطلبات (المعلقة والمقبولة والمرفوضة).</li>
              <li><strong>صفحة «التحقق من المدفوعات»:</strong> تعرض الطلبات المعلقة فقط من جميع الأنواع.</li>
            </ul>
          </SubSection>

          <SubSection title="خطوات التحقق من الرسوم السنوية">
            <div className="space-y-3">
              <Step n="1" text="افتح صفحة «الرسوم السنوية» أو «التحقق من المدفوعات»." />
              <Step n="2" text="ابحث عن الطلبات ذات حالة «قيد المراجعة»." />
              <Step n="3" text="اضغط «عرض» لرؤية تفاصيل الطلب وصورة إيصال الدفع." />
              <Step n="4" text="تحقق من الإيصال: تأكد أن الدفع صحيح ومقبول." />
              <Step n="5" text="اضغط «تحقق» للقبول أو «رفض» مع كتابة السبب إن أردت." />
            </div>
            <Note color="green">
              بعد القبول: يُفعَّل حساب الطالب تلقائياً ويصبح قادراً على التسجيل في دروس الدعم.
            </Note>
            <Note color="yellow">
              تنبيه: إذا رفضت الدفع، يمكن للطالب إعادة تقديم طلب جديد بعد تصحيح المشكلة.
            </Note>
          </SubSection>

          <SubSection title="ماذا يحدث بعد قبول الرسوم السنوية؟">
            <p className="text-gray-700">
              عند الضغط على «تحقق»، يحدث النظام تلقائياً:
            </p>
            <ul className="list-disc ps-6 space-y-1 text-gray-700 text-sm mt-2">
              <li>يُحدَّث ملف الطالب: أصبح الدفع مؤكداً.</li>
              <li>تُسجَّل المواد التي اختارها الطالب ضمن دروس الدعم (بانتظار التحقق الشهري).</li>
              <li>يُسجَّل السنة الدراسية للطالب تلقائياً من معلومات الطلب.</li>
            </ul>
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 3 — SUPPORT LESSONS
        ══════════════════════════════════════════ */}
        <Section id="s3" title="دروس الدعم">

          <p className="text-gray-700">
            دروس الدعم هي دروس شهرية تُقدَّم لطلاب الفرع.
            الطالب يسجّل في درس معين ويدفع رسوماً شهرية.
            مهمتك قبول التسجيل أو رفضه، ثم تجديده كل شهر أو حذفه عند الحاجة.
          </p>

          <Note color="yellow">
            <strong>شرط مسبق:</strong> لا يمكن لأي طالب التسجيل في دروس الدعم إلا إذا كانت
            رسومه السنوية مقبولة مسبقاً.
          </Note>

          <SubSection title="عرض المسجلين في دروس الدعم">
            <p className="text-gray-700">
              افتح صفحة <strong>«دروس الدعم — المسجلون»</strong> لعرض جميع الطلاب المسجلين.
              يمكنك الفلترة حسب:
            </p>
            <ul className="list-disc ps-6 space-y-1 text-gray-700 text-sm mt-2">
              <li><strong>الحالة:</strong> قيد المراجعة / نشط / منتهي / مرفوض</li>
              <li><strong>السنة الدراسية</strong></li>
              <li><strong>المادة</strong></li>
              <li><strong>البحث بالاسم</strong></li>
            </ul>
          </SubSection>

          <SubSection title="حالات التسجيل في درس الدعم">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold text-gray-700">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold text-gray-700">المعنى</th>
                    <th className="px-4 py-3 text-start font-semibold text-gray-700">الإجراء المطلوب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 text-warning-700 font-medium">قيد المراجعة</td>
                    <td className="px-4 py-3 text-gray-700">الطالب سجّل وينتظر قبولك</td>
                    <td className="px-4 py-3 text-gray-700">اذهب لصفحة «التحقق من المدفوعات» وقبل أو ارفض</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-success-700 font-medium">نشط</td>
                    <td className="px-4 py-3 text-gray-700">التسجيل مقبول وصالح</td>
                    <td className="px-4 py-3 text-gray-700">لا شيء — أو جدّد عند الحاجة</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-danger-700 font-medium">منتهي</td>
                    <td className="px-4 py-3 text-gray-700">انتهت مدة الاشتراك</td>
                    <td className="px-4 py-3 text-gray-700">اضغط «تجديد» إذا أراد الطالب الاستمرار</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-600 font-medium">مرفوض</td>
                    <td className="px-4 py-3 text-gray-700">رُفض التسجيل</td>
                    <td className="px-4 py-3 text-gray-700">يمكن حذفه أو ترك الطالب يُعيد التسجيل</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="قبول أو رفض تسجيل درس دعم">
            <p className="text-gray-700">
              التسجيلات المعلقة تظهر في صفحة <strong>«التحقق من المدفوعات»</strong>
              تبويب «دروس الدعم».
            </p>
            <div className="space-y-3 mt-3">
              <Step n="1" text="افتح «التحقق من المدفوعات»." />
              <Step n="2" text="اختر تبويب «دروس الدعم»." />
              <Step n="3" text="راجع تفاصيل الطالب والمادة وإيصال الدفع." />
              <Step n="4" text="اضغط «قبول» أو «رفض»." />
            </div>
          </SubSection>

          <SubSection title="إضافة تسجيل درس دعم يدوياً">
            <p className="text-gray-700">
              إذا دفع الطالب نقداً في الفرع وأردت تسجيله مباشرة دون انتظار:
            </p>
            <div className="space-y-3 mt-3">
              <Step n="1" text="افتح صفحة «دروس الدعم — المسجلون»." />
              <Step n="2" text="اضغط «إضافة طالب» في أعلى الصفحة." />
              <Step n="3" text="ابحث عن الطالب بالاسم أو البريد." />
              <Step n="4" text="اختر درس الدعم من القائمة (تظهر فقط دروس السنة الدراسية للطالب)." />
              <Step n="5" text="اختر مدة الاشتراك (1 أو 2 أو 3 أشهر)." />
              <Step n="6" text="اضغط «إضافة»." />
            </div>
            <Note color="green">
              التسجيل المضاف يدوياً يكون <strong>مقبولاً فوراً</strong> دون الحاجة لمراجعة إضافية.
            </Note>
            <Note color="yellow">
              تنبيه: الطالب يجب أن تكون رسومه السنوية مقبولة. إذا لم تظهر قائمة الدروس، ابحث عن طلب الرسوم السنوية أولاً وتحقق منه.
            </Note>
          </SubSection>

          <SubSection title="تجديد اشتراك درس دعم">
            <p className="text-gray-700">
              عندما تنتهي مدة اشتراك طالب (تتحول حالته إلى «منتهي»)،
              اضغط زر <strong>«تجديد»</strong> لتمديد اشتراكه بشهر إضافي.
            </p>
            <Note color="blue">
              يمكن تجديد التسجيل النشط أيضاً (قبل انتهائه) بنفس الطريقة.
            </Note>
          </SubSection>

          <SubSection title="حذف تسجيل درس دعم">
            <p className="text-gray-700">
              إذا أردت إزالة تسجيل طالب نهائياً (مثلاً: توقف عن الحضور، أو أُضيف بالخطأ):
            </p>
            <div className="space-y-3 mt-3">
              <Step n="1" text="ابحث عن الطالب في صفحة «دروس الدعم — المسجلون»." />
              <Step n="2" text="اضغط زر «حذف» على بطاقة التسجيل." />
              <Step n="3" text="أكّد الحذف في نافذة التأكيد." />
            </div>
            <Note color="red">
              تحذير: الحذف نهائي ولا يمكن التراجع عنه. إذا احتجت لإعادة التسجيل لاحقاً، استخدم زر «إضافة طالب» من جديد.
            </Note>
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 4 — LANGUAGES
        ══════════════════════════════════════════ */}
        <Section id="s4" title="دورات اللغات">

          <p className="text-gray-700">
            الطلاب يتقدمون للتسجيل في دورة لغة من خلال الموقع.
            الطلبات المعلقة تظهر في صفحة «التحقق من المدفوعات».
            بعد القبول، يظهر الطالب في صفحة «اللغات — المسجلون».
          </p>

          <SubSection title="قبول أو رفض تسجيل لغة">
            <div className="space-y-3">
              <Step n="1" text="افتح «التحقق من المدفوعات»." />
              <Step n="2" text="اختر تبويب «دورات اللغة»." />
              <Step n="3" text="راجع التفاصيل: اللغة، المستوى، طريقة الدفع، إيصال الدفع." />
              <Step n="4" text="اضغط «قبول» أو «رفض» (مع سبب الرفض إن أردت)." />
            </div>
          </SubSection>

          <SubSection title="إضافة تسجيل لغة يدوياً">
            <div className="space-y-3">
              <Step n="1" text="افتح «اللغات — المسجلون»." />
              <Step n="2" text="اضغط «إضافة تسجيل»." />
              <Step n="3" text="أدخل بيانات الطالب واللغة والمستوى." />
              <Step n="4" text="اضغط حفظ." />
            </div>
          </SubSection>

          <SubSection title="حذف تسجيل لغة">
            <p className="text-gray-700">
              من صفحة «اللغات — المسجلون»، اضغط زر <strong>«حذف»</strong> بجانب اسم الطالب.
            </p>
          </SubSection>

          <SubSection title="تصدير قائمة المسجلين">
            <p className="text-gray-700">
              اضغط زر <strong>«تصدير CSV»</strong> لتنزيل قائمة المسجلين كجدول يمكن فتحه في Excel.
              يمكنك الفلترة حسب اللغة والمستوى قبل التصدير.
            </p>
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 5 — TRAININGS
        ══════════════════════════════════════════ */}
        <Section id="s5" title="الدورات التكوينية">

          <p className="text-gray-700">
            نفس آلية دورات اللغات: الطالب يقدم طلب التسجيل من الموقع،
            وأنت تراجعه وتوافق أو ترفض.
          </p>

          <SubSection title="قبول أو رفض تسجيل تكوين">
            <div className="space-y-3">
              <Step n="1" text="افتح «التحقق من المدفوعات»." />
              <Step n="2" text="اختر تبويب «الدورات التكوينية»." />
              <Step n="3" text="راجع التفاصيل وإيصال الدفع." />
              <Step n="4" text="اضغط «قبول» أو «رفض»." />
            </div>
          </SubSection>

          <SubSection title="إضافة وحذف تسجيل">
            <p className="text-gray-700">
              من صفحة «الدورات التكوينية — المسجلون»، يمكنك إضافة طالب يدوياً بضغط «إضافة تسجيل»،
              أو حذف تسجيل موجود بضغط «حذف».
            </p>
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 6 — ANNOUNCEMENTS
        ══════════════════════════════════════════ */}
        <Section id="s6" title="الإعلانات">

          <p className="text-gray-700">
            يمكنك نشر إعلانات تظهر لطلاب فرعك فقط داخل الموقع.
            الإعلانات مفيدة للتنبيه بمواعيد، إجراءات، أو معلومات مهمة.
          </p>

          <SubSection title="إنشاء إعلان جديد">
            <div className="space-y-3">
              <Step n="1" text="افتح صفحة «الإعلانات» من القائمة." />
              <Step n="2" text="اضغط «إعلان جديد»." />
              <Step n="3" text="أدخل: العنوان، النص، نوع الإعلان (معلومات / تحذير / إعلان...)." />
              <Step n="4" text="اختر صفحة الهدف: أي صفحة سيظهر فيها الإعلان." />
              <Step n="5" text="تاريخ الانتهاء (اختياري): الإعلان يختفي تلقائياً بعد هذا التاريخ." />
              <Step n="6" text="اضغط «نشر» لظهوره فوراً أو احفظه كمسودة." />
            </div>
          </SubSection>

          <SubSection title="إدارة الإعلانات الموجودة">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold text-gray-700">الإجراء</th>
                    <th className="px-4 py-3 text-start font-semibold text-gray-700">الوصف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="px-4 py-3 font-medium text-gray-900">نشر / إخفاء</td><td className="px-4 py-3 text-gray-700">تشغيل أو إيقاف ظهور الإعلان للطلاب</td></tr>
                  <tr><td className="px-4 py-3 font-medium text-gray-900">تثبيت</td><td className="px-4 py-3 text-gray-700">تظهر الإعلانات المثبتة في أعلى القائمة دائماً</td></tr>
                  <tr><td className="px-4 py-3 font-medium text-gray-900">تعديل</td><td className="px-4 py-3 text-gray-700">تغيير النص أو العنوان أو التاريخ</td></tr>
                  <tr><td className="px-4 py-3 font-medium text-gray-900">حذف</td><td className="px-4 py-3 text-gray-700">إزالة الإعلان نهائياً</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <Note color="blue">
            الإعلانات المنتهية (تجاوزت تاريخ الانتهاء) لا تظهر للطلاب تلقائياً،
            لكنها تبقى في قائمة المشرف للرجوع إليها.
          </Note>
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 7 — COMMON SITUATIONS
        ══════════════════════════════════════════ */}
        <Section id="s7" title="مواقف شائعة وكيف تتعامل معها">

          {[
            {
              title: 'طالب جديد يريد التسجيل لكنه لا يعرف كيف يستخدم الإنترنت',
              steps: [
                'افتح «المستخدمون» → «إنشاء حساب طالب».',
                'أدخل بياناته يدوياً.',
                'أعطه البريد الإلكتروني وكلمة المرور التي أنشأتها.',
                'بعدها سجّل دفعه السنوي في «الرسوم السنوية» وافق على الطلب.',
                'ثم أضفه يدوياً في درس الدعم من «إضافة طالب».',
              ],
            },
            {
              title: 'طالب دفع نقداً في الفرع ويريد التسجيل فوراً',
              steps: [
                'تأكد من وجود حسابه — إذا لم يكن موجوداً، أنشئه أولاً.',
                'افتح «دروس الدعم — المسجلون» → «إضافة طالب».',
                'ابحث عنه واختر الدرس والمدة.',
                'اضغط «إضافة» — يُسجَّل فوراً بدون انتظار.',
              ],
            },
            {
              title: 'طالب اشتراكه انتهى ويريد الاستمرار',
              steps: [
                'افتح «دروس الدعم — المسجلون».',
                'ابحث عنه — ستجد حالته «منتهي».',
                'اضغط «تجديد» — يمتد اشتراكه بشهر إضافي.',
              ],
            },
            {
              title: 'قبلت تسجيل طالب بالخطأ وتريد حذفه',
              steps: [
                'افتح «دروس الدعم — المسجلون».',
                'ابحث عن الطالب.',
                'اضغط «حذف» وأكّد.',
                'إذا أراد الطالب التسجيل لاحقاً، يمكنك إعادة إضافته من «إضافة طالب».',
              ],
            },
            {
              title: 'لا تظهر طلبات الدفع في التحقق من المدفوعات',
              steps: [
                'تأكد أنك اخترت الفرع الصحيح من القائمة العلوية.',
                'اضغط زر «تحديث» في أعلى الصفحة.',
                'إذا استمر الأمر، أغلق المتصفح وأعد تسجيل الدخول.',
              ],
            },
            {
              title: 'طالب يقول إنه لا يستطيع التسجيل في درس الدعم',
              steps: [
                'افتح صفحة «المستخدمون» وابحث عن الطالب.',
                'تحقق من حالة حسابه: هل هو «مقبول»؟',
                'افتح «الرسوم السنوية» وابحث عن اسمه: هل رسومه السنوية «تم التحقق»؟',
                'إذا كانت الرسوم لم تُقبل بعد، افتحها وتحقق منها.',
              ],
            },
          ].map(({ title, steps }) => (
            <div key={title} className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-3">
              <p className="font-semibold text-gray-900">{title}</p>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 text-primary font-bold">{i + 1}.</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        {/* ══════════════════════════════════════════
            SECTION 8 — FAQ
        ══════════════════════════════════════════ */}
        <Section id="s8" title="أسئلة متكررة">

          <div className="space-y-3">
            <Qa
              q="هل يمكنني إدارة فرع آخر من نفس الحساب؟"
              a="لا. كل حساب مشرف مرتبط بفرع واحد فقط. تأكد دائماً من أنك اخترت فرعك الصحيح في أعلى الصفحة."
            />
            <Qa
              q="رفضت حساب طالب بالخطأ — كيف أتراجع؟"
              a="لا يمكن التراجع عن الرفض مباشرة. الحل: اطلب من الطالب تسجيل حساب جديد، ثم قبله. أو أنشئ له حساباً يدوياً من «إنشاء حساب طالب»."
            />
            <Qa
              q="الطالب يقول إنه لا يستلم رسائل البريد الإلكتروني"
              a="اطلب منه التحقق من مجلد البريد المزعج (Spam). إذا كان البريد غلطاً، لا يمكن تعديله — أنشئ له حساباً جديداً بالبريد الصحيح."
            />
            <Qa
              q="كيف أعرف عدد الطلاب المسجلين في درس معين؟"
              a="افتح «دروس الدعم — المسجلون»، فلتر حسب السنة الدراسية ثم حسب المادة. سترى العدد في أعلى القائمة."
            />
            <Qa
              q="هل يمكنني تعديل بيانات تسجيل درس الدعم بعد إضافته؟"
              a="لا يوجد زر تعديل مباشر. إذا احتجت لتغيير شيء، احذف التسجيل الحالي وأضف واحداً جديداً بالبيانات الصحيحة."
            />
            <Qa
              q="هل يمكنني تعديل مدة الاشتراك بعد القبول؟"
              a="المدة لا تتغير بعد القبول. لمنح شهر إضافي استخدم زر «تجديد». إذا أردت تغيير المدة كلياً، احذف التسجيل وأضف واحداً جديداً."
            />
            <Qa
              q="ماذا يعني «منتهي» في حالة تسجيل درس الدعم؟"
              a="يعني أن تاريخ انتهاء الاشتراك قد مضى. الطالب لا يزال ظاهراً في القائمة لكن اشتراكه غير فعّال. اضغط «تجديد» لمنحه شهراً إضافياً."
            />
            <Qa
              q="هل يمكنني تصدير قوائم المسجلين؟"
              a="نعم. في صفحتي «دروس الدعم — المسجلون» و«اللغات — المسجلون» و«الدورات التكوينية — المسجلون» يوجد زر «تصدير CSV» لتنزيل القائمة كجدول Excel."
            />
            <Qa
              q="اختفى اسم الطالب من قائمة المسجلين — ماذا أفعل؟"
              a="تحقق من الفلترة: ربما الفلتر النشط لا يشمله. اضغط «جميع الحالات» وأزل أي فلتر آخر، ثم ابحث بالاسم مجدداً."
            />
            <Qa
              q="ظهرت رسالة خطأ عند محاولة قبول دفع"
              a="أغلق النافذة وأعد تحميل الصفحة. إذا استمر الخطأ، تأكد أن الاتصال بالإنترنت يعمل، ثم حاول مرة أخرى. إذا لم يُحَل، تواصل مع الدعم التقني."
            />
          </div>
        </Section>

      </div>{/* /card */}
    </div>
  );
};

export default AdminGuide;
