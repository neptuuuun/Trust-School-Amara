import React from 'react';
import { useNavigate } from 'react-router-dom';

const InternalRulesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4" dir="rtl">
      <div className="w-full max-w-3xl">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-red-600 text-center mb-2">
              القانون الداخلي للمؤسسة
            </h1>
            <p className="text-center text-gray-600 mb-6">
              يرجى قراءة البنود التالية بعناية
            </p>
          </div>

          <div className="px-6 sm:px-8 pb-6 max-h-[500px] overflow-y-auto">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ هذه القواعد إلزامية لجميع الطلاب. يرجى قراءتها بعناية قبل التسجيل.
              </p>
            </div>

            <ol className="list-decimal pr-6 space-y-4 text-gray-800 leading-8">
              <li className="text-base">
                احترام التوقيت المحدد للدراسة و تفادي الغياب غير المبرر.
              </li>
              <li className="text-base">
                عدم الخروج قبل نهاية الحصة
              </li>
              <li className="text-base">
        كل غياب يتحمل صاحبه المسؤولية التامة من حيث تضييعه للحصة مع دفعه تكاليفها كاملة.        
              </li>
              <li className="text-base">
                عدم الأكل أو تناول اللبان أثناء الحصة.
              </li>
              <li className="text-base">
                عدم استعمال الهاتف النقال داخل القسم.
              </li>
              <li className="text-base">
                الدفع الشهري يكون مسبقا (عند بداية كل شهر)  .
              </li>
              <li className="text-base">
                لا يتم تعويض التكاليف النقدية في حالة تخلي التلميذ عن الدراسة.
              </li>
              <li className="text-base">
                ارتداء هندام يليق بمكانة التعليم وقدسيته.
              </li>
              <li className="text-base">
                عدم التدخين امام ابواب المؤسسة او داخلها.
              </li>
              <li className="text-base">
                تفادي الوقوف أمام أبواب المؤسسة في وضعيات مشبوهة.
              </li>
              <li className="text-base">
                التقيد بما تمليه ادارة المؤسسة و احترام توقيت الأفواج بعدم تغييرها دون موافقة الإدارة أو الأساتذة.
              </li>
            </ol>

           
          </div>


          <div className="px-6 sm:px-8 pb-6">
            <p className="text-center text-sm text-gray-500">
              Trust School - مدرسة الثقة © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InternalRulesPage;