import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { verifyPaymentOrder } from '../services/paymentOrderService';

const MAX_POLLS = 12;          // poll up to 12 × 5 s = 60 s
const POLL_INTERVAL_MS = 5000;

const SERVICE_LABELS = {
  language:  'دورة اللغة',
  training:  'الدورة التكوينية',
  support:   'درس الدعم',
  annualFee: 'الرسوم السنوية',
};

// ── Sub-screens ───────────────────────────────────────────────────────────────

function VerifyingScreen() {
  return (
    <div className="text-center space-y-4">
      <Loader2 className="w-16 h-16 text-primary mx-auto animate-spin" />
      <h1 className="text-2xl font-bold text-gray-800">جاري التحقق من الدفع…</h1>
      <p className="text-gray-600">يرجى الانتظار. لا تغلق هذه الصفحة.</p>
    </div>
  );
}

function SuccessScreen({ serviceType }) {
  const label = SERVICE_LABELS[serviceType] || 'الخدمة';
  return (
    <div className="text-center space-y-4">
      <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
      <h1 className="text-2xl font-bold text-gray-800">تمّ الدفع بنجاح!</h1>
      <p className="text-gray-600">
        تم تأكيد دفعك وتسجيلك في <strong>{label}</strong>. يمكنك الآن الاطلاع على تفاصيل تسجيلك من لوحة التحكم.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <Link
          to="/profile"
          className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
        >
          عرض لوحة التحكم
        </Link>
        <Link
          to="/home"
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

function FailureScreen({ onRetry }) {
  return (
    <div className="text-center space-y-4">
      <XCircle className="w-20 h-20 text-red-500 mx-auto" />
      <h1 className="text-2xl font-bold text-gray-800">لم يتم الدفع</h1>
      <p className="text-gray-600">
        لم تكتمل عملية الدفع. لم يتم خصم أي مبلغ من حسابك.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors flex items-center gap-2 justify-center"
          >
            <RefreshCw className="w-4 h-4" />
            العودة والمحاولة مرة أخرى
          </button>
        )}
        <Link
          to="/home"
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="text-center space-y-4">
      <AlertCircle className="w-20 h-20 text-yellow-500 mx-auto" />
      <h1 className="text-2xl font-bold text-gray-800">خطأ في التحقق</h1>
      <p className="text-gray-600">{message || 'حدث خطأ أثناء التحقق من حالة الدفع.'}</p>
      <Link
        to="/profile"
        className="inline-block px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
      >
        عرض لوحة التحكم
      </Link>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PaymentStatusPage() {
  const [searchParams] = useSearchParams();
  const orderId  = searchParams.get('orderId');
  const result   = searchParams.get('result'); // 'success' | 'failure'

  const [phase,       setPhase]       = useState('init'); // init | verifying | paid | failed | error
  const [serviceType, setServiceType] = useState('');
  const [errorMsg,    setErrorMsg]    = useState('');
  const pollCount = useRef(0);

  // Navigate back to the registration page on retry (rely on browser history).
  const handleRetry = () => window.history.back();

  useEffect(() => {
    if (!orderId) { setPhase('error'); setErrorMsg('رقم الطلب مفقود.'); return; }

    if (result === 'failure') { setPhase('failed'); return; }

    // result === 'success' → verify with backend and poll until confirmed.
    setPhase('verifying');

    async function tryVerify() {
      try {
        const data = await verifyPaymentOrder(orderId);
        setServiceType(data.serviceData?.serviceType || data.serviceType || '');

        if (data.status === 'paid') { setPhase('paid'); return; }
        if (data.status === 'failed') { setPhase('failed'); return; }

        // Still pending — poll with increasing patience.
        poll();
      } catch {
        poll();
      }
    }

    async function poll() {
      if (pollCount.current >= MAX_POLLS) {
        setPhase('error');
        setErrorMsg('استغرق التحقق وقتاً طويلاً. يرجى التحقق من لوحة التحكم أو التواصل مع الإدارة.');
        return;
      }
      pollCount.current += 1;

      setTimeout(async () => {
        try {
          // Re-run the finalize-capable verify (idempotent) — NOT a read-only status
          // read. The first verify at mount often 401s because Firebase auth hasn't
          // restored yet after returning from the Chargily redirect; retrying it here
          // (with a valid token, once auth is ready) is what actually reconciles the
          // checkout with Chargily and flips the order to paid. There is no webhook in
          // local/no-BACKEND_URL setups, so this poll is the only path that persists.
          const data = await verifyPaymentOrder(orderId);
          setServiceType(data.serviceData?.serviceType || data.serviceType || '');

          if (data.status === 'paid')   { setPhase('paid');   return; }
          if (data.status === 'failed') { setPhase('failed'); return; }
          poll();
        } catch {
          poll();
        }
      }, POLL_INTERVAL_MS);
    }

    tryVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, result]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        {phase === 'init'      && <VerifyingScreen />}
        {phase === 'verifying' && <VerifyingScreen />}
        {phase === 'paid'      && <SuccessScreen serviceType={serviceType} />}
        {phase === 'failed'    && <FailureScreen onRetry={handleRetry} />}
        {phase === 'error'     && <ErrorScreen message={errorMsg} />}
      </div>
    </div>
  );
}
