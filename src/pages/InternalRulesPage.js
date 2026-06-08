import React from 'react';

const rules = [
  'احترام التوقيت المحدد للدراسة وتفادي الغياب غير المبرر.',
  'عدم الخروج قبل نهاية الحصة.',
  'كل غياب يتحمل صاحبه المسؤولية التامة من حيث تضييعه للحصة مع دفعه تكاليفها كاملة.',
  'عدم الأكل أو تناول اللبان أثناء الحصة.',
  'عدم استعمال الهاتف النقال داخل القسم.',
  'الدفع الشهري يكون مسبقاً (عند بداية كل شهر).',
  'لا يتم تعويض التكاليف النقدية في حالة تخلّي التلميذ عن الدراسة.',
  'ارتداء هندام يليق بمكانة التعليم وقدسيته.',
  'عدم التدخين أمام أبواب المؤسسة أو داخلها.',
  'تفادي الوقوف أمام أبواب المؤسسة في وضعيات مشبوهة.',
  'التقيد بما تمليه إدارة المؤسسة واحترام توقيت الأفواج بعدم تغييرها دون موافقة الإدارة أو الأساتذة.',
];

const InternalRulesPage = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4" dir="rtl">
    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

      {/* Header */}
      <div className="px-8 pt-8 pb-4 text-center border-b border-gray-100">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-red-600">القانون الداخلي للمؤسسة</h1>
        <p className="mt-1 text-gray-500 text-sm">يرجى قراءة البنود التالية بعناية والالتزام بها</p>
      </div>

      {/* Rules */}
      <ol className="divide-y divide-gray-100 px-6 sm:px-8">
        {rules.map((rule, idx) => (
          <li key={idx} className="flex items-start gap-4 py-4">
            <span className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
              {idx + 1}
            </span>
            <p className="text-gray-800 leading-relaxed">{rule}</p>
          </li>
        ))}
      </ol>

      {/* Footer */}
      <div className="px-8 py-4 border-t border-gray-100 text-center">
        <p className="text-gray-400 text-sm">Trust School — مدرسة الثقة &copy; {new Date().getFullYear()}</p>
      </div>

    </div>
  </div>
);

export default InternalRulesPage;
