import React from 'react';

const AdminGuide = () => {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">دليل المسؤول</h1>
        <p className="text-lg text-gray-600">
          تعليمات بسيطة خطوة بخطوة لإدارة النظام (لا تحتاج إلى معرفة تقنية).
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 space-y-6">
        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-primary">1) إدارة اللغات</h2>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">كيفية إضافة لغة جديدة</h3>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>افتح لوحة الإدارة.</li>
              <li>اختر الفرع الصحيح (الشريط العلوي).</li>
              <li>انتقل إلى "اللغات".</li>
              <li>انقر على "إضافة لغة جديدة".</li>
              <li>اكتب اسم اللغة (مثال: الإنجليزية، الفرنسية).</li>
              <li>انقر على حفظ.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">مهم: يجب إضافة المستويات بعد إضافة اللغة</h3>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>بعد إنشاء اللغة، يجب إضافة مستوياتها (A1, A2, B1, B2, C1, C2).</li>
              <li>حدد سعرًا لكل مستوى تريد تقديمه.</li>
              <li>إذا لم تضف أي مستويات، قد يظهر الموقع اللغة كـ "لا شيء" أو "0 مستويات".</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">كيفية إضافة المستويات وتحديد الأسعار</h3>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>افتح اللغة التي أنشأتها.</li>
              <li>املأ معلومات المستوى (المعلم، الأيام/الوقت إذا لزم الأمر).</li>
              <li>أدخل السعر للمستوى.</li>
              <li>احفظ.</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-primary">2) إدارة التدريبات / الدورات</h2>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">كيفية إضافة تدريب جديد</h3>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>انتقل إلى "التدريبات / الدورات".</li>
              <li>انقر على "إضافة تدريب".</li>
              <li>املأ الحقول المطلوبة:</li>
            </ul>
            <ul className="list-disc pr-10 space-y-1 text-gray-700">
              <li><strong>العنوان</strong>: اسم الدورة.</li>
              <li><strong>السعر</strong>: سعر الدورة (اكتب 0 إذا كانت مجانية).</li>
              <li><strong>المعلم</strong>: من سيقوم بتدريس الدورة.</li>
              <li><strong>اليوم والوقت</strong>: متى تحدث الدورة.</li>
            </ul>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>انقر على حفظ.</li>
              <li><strong>لن يظهر التدريب على الموقع حتى يتم التحقق منه.</strong></li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-primary">3) عملية التحقق</h2>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">ما معنى "التحقق"</h3>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>التحقق يعني "الموافقة".</li>
              <li>تقوم بفحص المعلومات (وإثبات الدفع إذا لزم الأمر) ثم الموافقة أو الرفض.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">حول تنبيهات التأكيد المتكررة</h3>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>بعد النقر على حفظ أو الموافقة، قد ترى تنبيه تأكيد مرة أخرى.</li>
              <li>هذا سلوك طبيعي في لوحة الإدارة.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">بعد التحقق، أين سيظهر؟</h3>
            <ul className="list-disc pr-6 space-y-1 text-gray-700">
              <li>على الموقع الرئيسي (يمكن للطلاب رؤيته).</li>
              <li>داخل لوحة الإدارة في "الدورات · المسجلون" (سترى المستخدمين المسجلين هناك).</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-primary">4) المستخدمون المسجلون</h2>
          <ul className="list-disc pr-6 space-y-1 text-gray-700">
            <li>لرؤية من سجل في اللغات، افتح "اللغات · المسجلون".</li>
            <li>لرؤية من سجل في التدريبات، افتح "الدورات · المسجلون".</li>
            <li>افتح الدورة/اللغة وسترى قائمة المستخدمين المسجلين.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-primary">5) المشاكل الشائعة والحلول</h2>
          <ul className="list-disc pr-6 space-y-2 text-gray-700">
            <li>
              <strong>تظهر اللغة كـ "لا شيء" أو "0 مستويات"</strong>
              <div>المستويات مفقودة. أضف مستوى واحد على الأقل واحفظ.</div>
            </li>
            <li>
              <strong>الدورة غير مرئية على الموقع</strong>
              <div>الدورة لم يتم التحقق منها بعد. وافق عليها في قسم التحقق.</div>
            </li>
            <li>
              <strong>يتكرر تنبيه الحفظ</strong>
              <div>هذا سلوك تأكيد طبيعي. انقر على موافق واستمر.</div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default AdminGuide;