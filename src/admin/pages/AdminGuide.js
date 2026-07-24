// AdminGuide — the branch administrator's how-to.
//
// REWRITTEN FOR THE CHARGILY WORKFLOW.
// The previous guide taught the receipt-upload process end to end: the student
// uploads a proof of payment, the admin opens «التحقق من المدفوعات», inspects the
// image, and presses قبول / رفض. Every one of those steps is gone — that page was
// deleted and a registration is now only ever written after money is actually
// captured. An admin following the old text would hunt for a page that no longer
// exists and wait for an approval queue that will never fill.
//
// This version documents the system as it actually behaves: payment happens
// first (online via Chargily, or cash recorded by the admin), enrolment is the
// automatic consequence, and the admin's real jobs are document verification,
// rescuing payments that failed to enrol, renewing monthly support cycles, and
// keeping the catalog correct.

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

const Table = ({ head, rows }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200">
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          {head.map((h) => (
            <th key={h} className="px-4 py-3 text-start font-semibold text-gray-700">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={`px-4 py-3 ${j === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TOC = [
  { id: 's0', label: 'نظرة عامة على لوحة الإدارة' },
  { id: 's1', label: 'كيف يعمل الدفع الآن (مهم)' },
  { id: 's2', label: 'الطلاب ومراجعة الوثائق' },
  { id: 's3', label: 'مدفوعات تحتاج تدخلاً' },
  { id: 's4', label: 'الرسوم السنوية' },
  { id: 's5', label: 'دروس الدعم' },
  { id: 's6', label: 'دورات اللغات' },
  { id: 's7', label: 'الدورات التكوينية وطلباتها' },
  { id: 's8', label: 'البرامج والمجموعات' },
  { id: 's9', label: 'الإعلانات' },
  { id: 's10', label: 'مواقف شائعة' },
  { id: 's11', label: 'أسئلة متكررة' },
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
          تعليمات عملية لإدارة الفرع — محدّثة بعد اعتماد الدفع الإلكتروني.
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

      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 sm:p-8 space-y-14">

        {/* ═══ SECTION 0 — OVERVIEW ═══ */}
        <Section id="s0" title="نظرة عامة على لوحة الإدارة">
          <p className="text-gray-700">
            لوحة الإدارة تُدير فرعك أنت فقط — لا ترى ولا تُعدّل بيانات أي فرع آخر.
            ابدأ يومك دائماً من صفحة <strong>«نظرة عامة»</strong>: كل ما ينتظر إجراءً منك
            يظهر في أعلاها، وإن كانت فارغة فلا شيء معلّق.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: 'نظرة عامة',            desc: 'ما الذي ينتظر إجراءً منك اليوم + أرقام الفرع.' },
              { title: 'الطلاب',               desc: 'قبول أو رفض وثائق الطلاب، وإنشاء حسابات جديدة.' },
              { title: 'الرسوم السنوية',       desc: 'تسجيل دفعة الرسوم السنوية لأي طالب ومتابعة المدفوع.' },
              { title: 'التسجيلات',            desc: 'من هو المسجَّل في اللغات ودروس الدعم والدورات التكوينية.' },
              { title: 'طلبات الدورات التكوينية', desc: 'طلبات اهتمام غير مدفوعة — تُراجَع وتُغلَق.' },
              { title: 'البرامج والمجموعات',   desc: 'المواد والمجموعات: الأستاذ، التوقيت، السعة، السعر.' },
              { title: 'سجل المدفوعات',        desc: 'كل عمليات الدفع + معالجة ما لم يكتمل تسجيله.' },
              { title: 'الإعلانات',            desc: 'نشر إعلانات لطلاب فرعك.' },
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

          <Note color="blue">
            الأرقام الحمراء والبرتقالية بجانب عناصر القائمة الجانبية تعني عملاً ينتظرك.
            تتحدّث تلقائياً كل دقيقة.
          </Note>
        </Section>

        {/* ═══ SECTION 1 — HOW PAYMENT WORKS NOW ═══ */}
        <Section id="s1" title="كيف يعمل الدفع الآن (مهم)">
          <Note color="yellow">
            <strong>تغيّر جوهري:</strong> لم يعد الطالب يرفع صورة إيصال، ولم تعد هناك صفحة
            «التحقق من المدفوعات». <strong>الدفع يسبق التسجيل دائماً</strong>، والتسجيل يحدث
            تلقائياً بعد نجاح الدفع. لا يوجد أي تسجيل «بانتظار موافقتك على الدفع».
          </Note>

          <SubSection title="المسارَان الوحيدان للدفع">
            <Table
              head={['المسار', 'كيف يحدث', 'ماذا تفعل أنت']}
              rows={[
                ['الدفع الإلكتروني (Chargily)', 'الطالب يختار المجموعة ويدفع بالبطاقة من الموقع', 'لا شيء — يُسجَّل تلقائياً ويظهر في سجل المدفوعات'],
                ['الدفع نقداً بالمركز', 'الطالب يدفع لك مباشرة وتُسجّله أنت من صفحة الخدمة', 'سجّله يدوياً — يُنشأ إيصال في سجل المدفوعات تلقائياً'],
              ]}
            />
          </SubSection>

          <SubSection title="ماذا يعني ذلك عملياً">
            <ul className="list-disc ps-6 space-y-1.5 text-gray-700 text-sm">
              <li>كل اسم تراه في صفحات <strong>التسجيلات</strong> هو طالب <strong>دفع فعلاً</strong>. لا يوجد «قيد المراجعة».</li>
              <li>لم يعد بإمكانك «قبول» أو «رفض» دفعة — المال مقبوض أو غير مقبوض.</li>
              <li>الشيء الوحيد الذي يحتاج قراراً منك في المدفوعات هو <strong>«مدفوعات تحتاج تدخلاً»</strong> (القسم التالي).</li>
              <li>الإيرادات الرسمية الكاملة تُحتسب في <strong>لوحة المالك</strong> من السجل المالي، لا من صفحاتك.</li>
            </ul>
          </SubSection>
        </Section>

        {/* ═══ SECTION 2 — STUDENTS ═══ */}
        <Section id="s2" title="الطلاب ومراجعة الوثائق">
          <p className="text-gray-700">
            هذه هي <strong>الموافقة الوحيدة المتبقية</strong> في اللوحة: الطالب يُنشئ حسابه،
            يؤكّد بريده، ثم يرفع صورته الشخصية وبطاقة هويته. أنت تراجعها وتقبل أو ترفض.
          </p>

          <SubSection title="خطوات مراجعة وثائق طالب">
            <div className="space-y-3">
              <Step n="1" text="افتح صفحة «الطلاب»." sub="الطلاب المنتظرون يظهرون تلقائياً في أعلى القائمة." />
              <Step n="2" text="راجع البيانات والصور." sub="اضغط على الصورة أو بطاقة الهوية لتكبيرها." />
              <Step n="3" text="اضغط «قبول» إذا كانت البيانات صحيحة، أو «رفض» إذا كانت ناقصة أو غير واضحة." />
            </div>
            <Note color="green">بعد القبول يتلقى الطالب إشعاراً تلقائياً ويمكنه استخدام حسابه فوراً.</Note>
            <Note color="yellow">
              عند الرفض تُحذف صور الطالب المرفوعة نهائياً من التخزين. الرفض لا يُلغي أي دفعة سابقة.
            </Note>
          </SubSection>

          <SubSection title="إنشاء حساب طالب مباشرة">
            <p className="text-gray-700">
              للطالب الذي يحضر إلى الفرع شخصياً: «الطلاب» ← «إنشاء حساب طالب».
              أدخل الاسم والبريد والهاتف والمؤسسة التعليمية وكلمة مرور أولية.
            </p>
            <Note color="blue">
              الحساب المُنشأ بهذه الطريقة <strong>موثَّق فوراً</strong> ولا يحتاج مراجعة وثائق.
              حقل <strong>المؤسسة التعليمية</strong> إلزامي — استخدم «حر» للطالب غير المنتسب لمؤسسة.
            </Note>
          </SubSection>

          <SubSection title="معدل المواد المميزة (خاص بدروس الدعم)">
            <p className="text-gray-700">
              المعدل من 20 يحدّد تصنيف الطالب في دروس الدعم فقط:
              أقل من 11 ← <strong>مستوى دعم</strong>، و11 فأكثر ← <strong>عادي</strong>.
              يمكنك تسجيله أو تصحيحه من بطاقة الطالب.
            </p>
            <Note color="yellow">
              الطالب بلا معدل مسجَّل لن يستطيع الدفع لدرس دعم، وستفشل محاولته.
              إن رأيت هذا السبب في «مدفوعات تحتاج تدخلاً»، سجّل معدله ثم أضفه للمجموعة يدوياً.
            </Note>
          </SubSection>

          <SubSection title="حالات الحساب">
            <Table
              head={['الحالة', 'المعنى']}
              rows={[
                ['ينتظر تأكيد البريد', 'أنشأ الحساب ولم يضغط رابط التأكيد بعد — لا إجراء منك'],
                ['قيد المراجعة', 'رفع وثائقه وينتظر قرارك'],
                ['مقبول', 'حساب موثَّق — يمكنه الدفع والتسجيل'],
                ['مرفوض', 'رُفضت وثائقه'],
              ]}
            />
          </SubSection>

          <Note color="red">
            زر <strong>«حذف الطالب نهائياً»</strong> يمحو حساب الطالب وبياناته ولا يمكن التراجع عنه.
            لا تستخدمه لرفض تسجيل — استخدم «رفض».
          </Note>
        </Section>

        {/* ═══ SECTION 3 — STUCK PAYMENTS ═══ */}
        <Section id="s3" title="مدفوعات تحتاج تدخلاً">
          <Note color="red">
            <strong>هذه أهم مهمة في اللوحة.</strong> طالب دفع فعلاً لكن النظام لم يستطع تسجيله.
            المال مقبوض والخدمة لم تُقدَّم — عالِجها في نفس اليوم.
          </Note>

          <p className="text-gray-700">
            تظهر في أعلى «نظرة عامة» وبشارة حمراء على «سجل المدفوعات» في القائمة الجانبية.
          </p>

          <SubSection title="لماذا يفشل التسجيل؟">
            <Table
              head={['السبب المعروض', 'ماذا تفعل']}
              rows={[
                ['اكتمل العدد في المجموعة', 'اعرض على الطالب مجموعة أخرى وسجّله فيها يدوياً، أو استرجع المبلغ'],
                ['الطالب مسجَّل بالفعل', 'دفع مرتين — استرجع المبلغ الثاني'],
                ['تعارض في التوقيت مع تسجيل آخر', 'اقترح مجموعة بتوقيت مختلف وسجّله فيها يدوياً'],
                ['معدل المواد المميزة غير مسجَّل', 'سجّل معدله من صفحة «الطلاب» ثم أضفه للمجموعة يدوياً'],
                ['الطالب من مستوى الدعم / عادي', 'وجّهه إلى المجموعة المناسبة لتصنيفه وسجّله فيها'],
                ['المجموعة محذوفة أو غير موجودة', 'سجّله في مجموعة بديلة أو استرجع المبلغ'],
              ]}
            />
          </SubSection>

          <SubSection title="خطوات المعالجة">
            <div className="space-y-3">
              <Step n="1" text="افتح «سجل المدفوعات» ← فلتر «تحتاج تدخلاً»." />
              <Step n="2" text="اضغط «عرض» لقراءة السبب واسم الطالب والمبلغ." />
              <Step n="3" text="عالِج الوضع فعلياً" sub="سجّل الطالب يدوياً في مجموعة مناسبة، أو استرجع له المبلغ." />
              <Step n="4" text="اضغط «تمّت المعالجة» واكتب ماذا فعلت." sub="يُحفظ في سجل التدقيق ويُغلَق التنبيه." />
            </div>
            <Note color="yellow">
              زر «تمّت المعالجة» <strong>لا يعيد المال ولا يُسجّل الطالب</strong> — هو فقط يُغلق التنبيه.
              لا تضغطه قبل أن تُنهي المعالجة الحقيقية.
            </Note>
          </SubSection>
        </Section>

        {/* ═══ SECTION 4 — ANNUAL FEES ═══ */}
        <Section id="s4" title="الرسوم السنوية">
          <p className="text-gray-700">
            رسم سنوي يدفعه الطالب مرة واحدة في السنة الدراسية (من 1 جويلية إلى 30 جوان).
            يدفعه الطالب إلكترونياً بنفسه، أو تسجّله أنت إن دفع نقداً.
          </p>

          <SubSection title="تسجيل دفعة نقدية">
            <div className="space-y-3">
              <Step n="1" text="افتح «الرسوم السنوية» ← «إضافة دفعة الرسوم السنوية»." />
              <Step n="2" text="ابحث عن الطالب واختره." />
              <Step n="3" text="اضغط «تسجيل» — المبلغ يأتي من إعدادات المالك ولا يُدخَل يدوياً." />
            </div>
            <Note color="green">
              النظام يمنع تسجيل دفعتين لنفس الطالب في نفس السنة الدراسية تلقائياً.
            </Note>
          </SubSection>

          <SubSection title="ما تعرضه الصفحة">
            <p className="text-gray-700">
              الصفحة تعرض <strong>المدفوعات المؤكَّدة فقط</strong> — لا توجد حالة «معلّق» أو «مرفوض»
              بعد اليوم. يمكنك البحث والفلترة وطباعة إيصال وتصدير CSV.
            </p>
          </SubSection>
        </Section>

        {/* ═══ SECTION 5 — SUPPORT LESSONS ═══ */}
        <Section id="s5" title="دروس الدعم">
          <p className="text-gray-700">
            دروس الدعم <strong>اشتراك شهري بالشهر الميلادي</strong>: الاشتراك ينتهي دائماً
            بنهاية الشهر، والطالب الذي يلتحق في منتصف الشهر يدفع مبلغاً مخفَّضاً
            محسوباً على الحصص المتبقية فقط. لا يوجد اختيار «مدة» بالأشهر.
          </p>

          <SubSection title="إضافة طالب دفع نقداً">
            <div className="space-y-3">
              <Step n="1" text="افتح «تسجيلات دروس الدعم» ← «إضافة طالب»." />
              <Step n="2" text="ابحث عن الطالب واختر المجموعة." sub="تظهر فقط المجموعات المناسبة لسنته الدراسية ولتصنيفه." />
              <Step n="3" text="راجع «المبلغ المستحق هذا الشهر» — يُحسب تلقائياً حسب تاريخ اليوم." />
              <Step n="4" text="اضغط «إضافة»." />
            </div>
          </SubSection>

          <SubSection title="التجديد الشهري">
            <p className="text-gray-700">
              في نهاية كل شهر تنتهي الاشتراكات. صفحة «نظرة عامة» تُظهر لك من ستنتهي اشتراكاتهم
              خلال 7 أيام — تواصل معهم، وعند الدفع اضغط <strong>«تجديد»</strong> على سطر الطالب.
            </p>
            <Note color="blue">
              كل تجديد يُسجَّل كدفعة مستقلة لشهر جديد في السجل المالي وسجل المدفوعات.
            </Note>
          </SubSection>

          <SubSection title="تعديل اشتراك">
            <p className="text-gray-700">
              زر <strong>«تعديل»</strong> يسمح بتصحيح تاريخ الانتهاء أو اسم المادة أو الأستاذ أو المبلغ.
            </p>
            <Note color="yellow">
              تغيير المبلغ يُضيف <strong>قيد تسوية</strong> إلى السجل المالي (لا يُعدَّل السجل الأصلي أبداً)،
              ولذلك يجب كتابة سبب التعديل — ويُحفظ في سجل التدقيق باسمك.
            </Note>
          </SubSection>

          <SubSection title="تصنيف مستوى الدعم (قاعدة أ / ب)">
            <Table
              head={['تصنيف الطالب', 'المجموعات المسموح بها']}
              rows={[
                ['عادي (المعدل 11 فأكثر)', 'مجموعات الدعم العادية فقط'],
                ['مستوى دعم (المعدل أقل من 11)', 'مجموعات مستوى الدعم فقط'],
              ]}
            />
            <Note color="blue">
              هذه القاعدة مطبَّقة في الخادم ولا يمكن تجاوزها — لا من الطالب ولا منك.
              تخصّ دروس الدعم وحدها ولا تؤثر على اللغات أو الدورات التكوينية.
            </Note>
          </SubSection>

          <Note color="red">
            حذف تسجيل نهائي ولا يمكن التراجع عنه، ويُلغي القيد المالي المرتبط به.
            لتصحيح خطأ بسيط استخدم «تعديل» بدل الحذف.
          </Note>
        </Section>

        {/* ═══ SECTION 6 — LANGUAGES ═══ */}
        <Section id="s6" title="دورات اللغات">
          <p className="text-gray-700">
            الطالب يختار المجموعة ويدفع ثمنها كاملاً مرة واحدة، فيُسجَّل تلقائياً.
            صفحة «تسجيلات اللغات» تعرض من هو مسجَّل فعلاً.
          </p>
          <SubSection title="ما يمكنك فعله">
            <ul className="list-disc ps-6 space-y-1.5 text-gray-700 text-sm">
              <li><strong>تسجيل يدوي:</strong> لطالب دفع نقداً — يُنشئ إيصالاً في سجل المدفوعات تلقائياً.</li>
              <li><strong>عرض / طباعة:</strong> تفاصيل التسجيل وإيصال للطالب.</li>
              <li><strong>حذف:</strong> نهائي — للأخطاء فقط.</li>
              <li><strong>تصدير CSV:</strong> بعد تطبيق الفلاتر التي تريدها.</li>
            </ul>
          </SubSection>
          <Note color="yellow">
            التسجيل اليدوي يفشل إذا اكتمل عدد المجموعة أو تعارض توقيتها مع تسجيل آخر للطالب.
            هذا مقصود — غيّر المجموعة بدل تجاوز التحقق.
          </Note>
        </Section>

        {/* ═══ SECTION 7 — TRAININGS ═══ */}
        <Section id="s7" title="الدورات التكوينية وطلباتها">
          <Note color="blue">
            انتبه للفرق: <strong>«تسجيلات الدورات التكوينية»</strong> = طلاب دفعوا والتحقوا.
            <strong> «طلبات الدورات التكوينية»</strong> = استفسارات مجانية عن دورات مقترحة،
            لم يدفع أصحابها شيئاً.
          </Note>

          <SubSection title="التسجيلات المدفوعة">
            <p className="text-gray-700">
              نفس آلية اللغات تماماً: دفع كامل مرة واحدة، تسجيل تلقائي، وإمكانية التسجيل اليدوي
              لمن دفع نقداً.
            </p>
          </SubSection>

          <SubSection title="إدارة الطلبات (غير المدفوعة)">
            <div className="space-y-3">
              <Step n="1" text="افتح «طلبات الدورات التكوينية»." />
              <Step n="2" text="اقرأ الطلب واتصل بصاحبه." />
              <Step n="3" text="ضع الطلب «قيد المراجعة» أثناء دراسته." />
              <Step n="4" text="أغلقه بـ «مكتمل» إذا فُتحت الدورة أو التحق الطالب، أو «مرفوض» إذا تعذّر." />
            </div>
            <Note color="blue">
              إغلاق الطلب لا يُسجّل أحداً ولا يقبض مالاً — إن أراد الطالب الالتحاق فعلاً فهو يدفع
              كأي طالب آخر.
            </Note>
          </SubSection>
        </Section>

        {/* ═══ SECTION 8 — CATALOG ═══ */}
        <Section id="s8" title="البرامج والمجموعات">
          <p className="text-gray-700">
            كل خدمة تُبنى على مستويين: <strong>المادة</strong> (مثل «الإنجليزية» أو «الرياضيات»)
            ثم <strong>المجموعة</strong> داخلها (الأستاذ، القاعة، التوقيت، السعة، السعر).
            الطالب يدفع للمجموعة، لا للمادة.
          </p>

          <SubSection title="قبل فتح التسجيل تأكّد من">
            <ul className="list-disc ps-6 space-y-1.5 text-gray-700 text-sm">
              <li><strong>السعر</strong> صحيح — هو ما سيُخصم من الطالب بالضبط.</li>
              <li><strong>السعة</strong> صحيحة — عند اكتمالها يُمنع الدفع تلقائياً.</li>
              <li><strong>التوقيت</strong> كامل — يُستخدم لمنع تعارض مواعيد الطالب والأستاذ والقاعة.</li>
              <li><strong>نوع المجموعة</strong> في دروس الدعم (عادية / مستوى دعم).</li>
            </ul>
            <Note color="yellow">
              لا يمكن حفظ مجموعة يتعارض توقيتها مع مجموعة أخرى لنفس الأستاذ أو نفس القاعة.
              الرسالة ستوضّح لك مصدر التعارض.
            </Note>
          </SubSection>

          <SubSection title="تغيير سعر مجموعة">
            <Note color="blue">
              تغيير السعر يؤثر على <strong>التسجيلات الجديدة فقط</strong>. الطلاب الذين دفعوا سابقاً
              يحتفظون بالمبلغ الذي دفعوه في السجل المالي.
            </Note>
          </SubSection>
        </Section>

        {/* ═══ SECTION 9 — ANNOUNCEMENTS ═══ */}
        <Section id="s9" title="الإعلانات">
          <p className="text-gray-700">
            إعلانات تظهر لطلاب فرعك فقط داخل الموقع.
          </p>
          <SubSection title="إنشاء إعلان">
            <div className="space-y-3">
              <Step n="1" text="افتح «الإعلانات» ← «إعلان جديد»." />
              <Step n="2" text="أدخل العنوان والنص ونوع الإعلان." />
              <Step n="3" text="اختر الصفحة التي سيظهر فيها." />
              <Step n="4" text="حدّد تاريخ انتهاء (اختياري) — يختفي تلقائياً بعده." />
              <Step n="5" text="اضغط «نشر» أو احفظه كمسودة." />
            </div>
          </SubSection>
          <SubSection title="إدارة الإعلانات">
            <Table
              head={['الإجراء', 'الوصف']}
              rows={[
                ['نشر / إخفاء', 'تشغيل أو إيقاف ظهور الإعلان للطلاب'],
                ['تثبيت', 'يظهر الإعلان المثبّت في أعلى القائمة دائماً'],
                ['تعديل', 'تغيير النص أو العنوان أو التاريخ'],
                ['حذف', 'إزالة الإعلان نهائياً'],
              ]}
            />
          </SubSection>
        </Section>

        {/* ═══ SECTION 10 — COMMON SITUATIONS ═══ */}
        <Section id="s10" title="مواقف شائعة">
          {[
            {
              title: 'طالب دفع بالبطاقة ويقول إنه غير مسجَّل',
              steps: [
                'افتح «سجل المدفوعات» وابحث باسمه أو بريده.',
                'إن ظهر بحالة «مدفوع» وبشارة «لم يُسجَّل» — اقرأ السبب وعالجه (القسم 3).',
                'إن ظهر «في انتظار الدفع» فهو لم يُكمل الدفع فعلاً — اطلب منه إعادة المحاولة.',
                'إن لم يظهر إطلاقاً فلم تصل أي عملية دفع — تأكد من الفرع المختار.',
              ],
            },
            {
              title: 'طالب حضر للفرع ودفع نقداً ويريد الالتحاق اليوم',
              steps: [
                'تأكد من وجود حسابه — وإلا أنشئه من «الطلاب» ← «إنشاء حساب طالب».',
                'لدروس الدعم: «تسجيلات دروس الدعم» ← «إضافة طالب».',
                'للغات أو الدورات التكوينية: صفحة التسجيلات المقابلة ← «تسجيل يدوي».',
                'للرسوم السنوية: «الرسوم السنوية» ← «إضافة دفعة».',
                'كل ما سبق يُنشئ إيصالاً تلقائياً في سجل المدفوعات.',
              ],
            },
            {
              title: 'اشتراك دعم انتهى والطالب يريد الاستمرار',
              steps: [
                'افتح «تسجيلات دروس الدعم» وابحث عنه — حالته «منتهي».',
                'اقبض قيمة الشهر الجديد.',
                'اضغط «تجديد» — يُفتح شهر جديد ويُسجَّل كدفعة مستقلة.',
              ],
            },
            {
              title: 'لا تستطيع تسجيل طالب في مجموعة',
              steps: [
                'اقرأ نص الخطأ — يذكر السبب بدقة.',
                '«اكتملت السعة»: زد السعة من صفحة المجموعة أو اختر مجموعة أخرى.',
                '«تعارض في التوقيت»: الرسالة تعرض التسجيل المتعارض — اختر توقيتاً آخر.',
                '«المعدل غير مسجَّل»: سجّل معدله من صفحة «الطلاب» أولاً.',
              ],
            },
            {
              title: 'الأرقام لا تبدو صحيحة',
              steps: [
                'اضغط «تحديث» في أعلى الصفحة.',
                'تأكد أنك في الفرع الصحيح (يظهر أعلى الصفحة وفي القائمة الجانبية).',
                'انتبه: «إجمالي المحصّل» في سجل المدفوعات يخصّ الطلبات المعروضة فقط، لا كل التاريخ.',
                'الأرقام المالية النهائية للفرع تُقرأ من لوحة المالك.',
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

        {/* ═══ SECTION 11 — FAQ ═══ */}
        <Section id="s11" title="أسئلة متكررة">
          <div className="space-y-3">
            <Qa
              q="أين ذهبت صفحة «التحقق من المدفوعات»؟"
              a="أُلغيت. لم يعد الطالب يرفع إيصالاً، فلم يعد هناك ما يُتحقَّق منه: التسجيل لا يُنشأ أصلاً إلا بعد قبض المال. ما بقي هو «سجل المدفوعات» لعرض كل العمليات ومعالجة ما لم يكتمل تسجيله."
            />
            <Qa
              q="هل يمكنني استرجاع مبلغ من اللوحة؟"
              a="لا. الاسترجاع يتم خارج النظام (نقداً أو عبر Chargily). بعد إتمامه اضغط «تمّت المعالجة» على الطلب واكتب ما فعلته ليُحفظ في سجل التدقيق."
            />
            <Qa
              q="هل يمكنني إدارة فرع آخر من نفس الحساب؟"
              a="لا. كل حساب مشرف مرتبط بفرع واحد، والخادم يرفض أي طلب يخصّ فرعاً آخر حتى لو حاولت."
            />
            <Qa
              q="رفضت وثائق طالب بالخطأ — كيف أتراجع؟"
              a="اطلب منه إعادة رفع وثائقه من حسابه، ثم اقبلها. الحساب نفسه لم يُحذف."
            />
            <Qa
              q="لماذا لا أرى أي مدفوعات «نقداً» قديمة؟"
              a="إيصالات الدفع النقدي بدأت تُسجَّل في سجل المدفوعات من هذا الإصدار فقط. التسجيلات النقدية الأقدم موجودة في صفحات التسجيلات وفي السجل المالي، لكنها لا تظهر هنا."
            />
            <Qa
              q="ما الفرق بين «تسجيلات الدورات التكوينية» و«طلبات الدورات التكوينية»؟"
              a="الأولى طلاب دفعوا والتحقوا فعلاً. الثانية استفسارات مجانية عن دورات مقترحة لم يدفع أصحابها شيئاً — تُدار وتُغلَق دون أي أثر مالي."
            />
            <Qa
              q="هل يمكنني تعديل تسجيل درس دعم بعد إنشائه؟"
              a="نعم — زر «تعديل» يسمح بتغيير تاريخ الانتهاء واسم المادة والأستاذ والمبلغ. تغيير المبلغ يتطلب كتابة سبب ويُضيف قيد تسوية إلى السجل المالي."
            />
            <Qa
              q="لماذا لا يمكن للطالب الدفع لمجموعة معينة؟"
              a="غالباً لأن السعة اكتملت، أو لأنه مسجَّل فيها مسبقاً، أو لأن توقيتها يتعارض مع تسجيل آخر له، أو — في دروس الدعم — لأن تصنيفه لا يناسب نوع المجموعة."
            />
            <Qa
              q="كم مدة اشتراك درس الدعم؟"
              a="شهر ميلادي واحد ينتهي بنهاية الشهر. من يلتحق في منتصف الشهر يدفع مبلغاً مخفَّضاً على الحصص المتبقية فقط، ويجدّد للشهر التالي كاملاً."
            />
            <Qa
              q="متى تبدأ السنة الدراسية في النظام؟"
              a="من 1 جويلية إلى 30 جوان. الرسوم السنوية تُحتسب على هذا الأساس، لا على السنة الميلادية."
            />
          </div>
        </Section>

      </div>{/* /card */}
    </div>
  );
};

export default AdminGuide;
