import React, { useState } from 'react';
import { CreditCard, Loader2, Info } from 'lucide-react';
import { createChargilyCheckout } from '../../services/paymentOrderService';
import { safeErrorMessage } from '../../utils/apiErrors';
import { Button } from '../ui/button';
import { Alert } from '../ui/feedback';

/**
 * ChargilyPayButton
 * -----------------
 * Renders a "Pay Now" button that creates a Chargily checkout and redirects the
 * student to the hosted payment page. All payment proof uploading is eliminated.
 *
 * Props:
 *   amount       {number}  – Amount in DZD (must be > 0)
 *   branchId     {string}  – Branch identifier
 *   serviceType  {string}  – 'language' | 'training' | 'support' | 'annualFee'
 *   serviceData  {object}  – Full registration payload stored in the paymentOrder
 *   disabled     {boolean} – Disables the button externally (e.g. form validation)
 *   label        {string}  – Optional button text override
 */
const ChargilyPayButton = ({
  amount,
  branchId,
  serviceType,
  serviceData = {},
  disabled = false,
  label,
}) => {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handlePay = async () => {
    setError('');
    setLoading(true);
    try {
      const { checkoutUrl } = await createChargilyCheckout({
        branchId,
        serviceType,
        serviceData,
        amount,
      });
      // Full-page redirect to Chargily hosted checkout.
      window.location.href = checkoutUrl;
    } catch (err) {
      // Never surface raw fetch/CORS/exception text to the user.
      setError(safeErrorMessage(err, 'حدث خطأ أثناء إنشاء طلب الدفع. يرجى المحاولة لاحقاً.'));
      setLoading(false);
    }
  };

  const formattedAmount = typeof amount === 'number'
    ? `${amount.toLocaleString('en-US')} دج`
    : '';

  const payActionLabel = 'ادفع الآن بالبطاقة الذهبية أو CIB';
  const buttonLabel = label || (formattedAmount ? `${payActionLabel} — ${formattedAmount}` : payActionLabel);

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="danger">{error}</Alert>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-3" dir="rtl">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-base font-semibold text-blue-900">
            <CreditCard className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            الدفع الإلكتروني
          </p>
          <p className="text-blue-700">
            يمكنك الدفع باستخدام البطاقة الذهبية (Edahabia) أو بطاقة CIB بشكل آمن.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
          <Info className="mt-0.5 w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <p>
            لا يشترط أن تكون البطاقة باسم الطالب — يمكن استخدام بطاقة أحد الوالدين أو أي شخص يدفع نيابةً عنه.
          </p>
        </div>

        <p className="text-blue-700">
          عند الضغط على «ادفع الآن» سيتم تحويلك إلى صفحة الدفع الآمنة لإتمام العملية، ثم العودة تلقائياً لتأكيد التسجيل.
        </p>

        {formattedAmount && (
          <p className="border-t border-blue-200 pt-2 text-base font-bold text-blue-900">
            المبلغ الإجمالي: {formattedAmount}
          </p>
        )}

        <p className="text-xs text-blue-500">
          خدمة الدفع مقدمة عبر Chargily
        </p>
      </div>

      <Button
        onClick={handlePay}
        disabled={disabled || loading || !branchId || !serviceType}
        fullWidth
        className="flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري التحويل إلى صفحة الدفع...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            {buttonLabel}
          </>
        )}
      </Button>
    </div>
  );
};

export default ChargilyPayButton;
