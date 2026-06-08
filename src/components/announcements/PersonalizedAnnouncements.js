import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, CreditCard, Clock, AlertTriangle, RefreshCw, Bell } from 'lucide-react';

// Compute personalized announcements from user data — no Firestore reads needed
function buildPersonalizedAlerts({
  annualFeeStatus,
  verificationStatus,
  pendingLanguageForms,
  pendingTrainingForms,
  supportRegistrations,
}) {
  const alerts = [];

  // 1. Annual fee unpaid
  if (annualFeeStatus?.status === 'unpaid') {
    alerts.push({
      id: 'annual-fee-unpaid',
      style: 'warning',
      icon: CreditCard,
      title: 'سجّل في دروس الدعم',
      body: 'يُدفع الرسم السنوي مرة واحدة في السنة عند أول تسجيل في دروس الدعم. تصفّح الدروس وسجّل الآن.',
      ctaLabel: 'تصفّح دروس الدعم',
      ctaLink: '/support-lessons',
      priority: 'high',
    });
  }

  // 2. Annual fee pending
  if (annualFeeStatus?.status === 'pending') {
    alerts.push({
      id: 'annual-fee-pending',
      style: 'info',
      icon: Clock,
      title: 'الرسوم السنوية قيد المراجعة',
      body: 'تم استلام طلب دفع الرسوم السنوية وسيتم معالجته قريباً.',
      priority: 'low',
    });
  }

  // 3. Account verification pending
  const normalizedVStatus = String(verificationStatus || '').toLowerCase();
  if (normalizedVStatus === 'pending') {
    alerts.push({
      id: 'verification-pending',
      style: 'info',
      icon: Clock,
      title: 'حسابك قيد المراجعة',
      body: 'يقوم فريق الإدارة بمراجعة بياناتك. سيتم إشعارك عند الموافقة.',
      priority: 'medium',
    });
  }

  // 4. Account not verified / rejected
  if (
    normalizedVStatus === 'rejected' ||
    normalizedVStatus === 'unverified' ||
    normalizedVStatus === ''
  ) {
    alerts.push({
      id: 'verification-incomplete',
      style: 'warning',
      icon: AlertTriangle,
      title: 'التحقق من حسابك غير مكتمل',
      body: 'يرجى رفع الوثائق المطلوبة لاستكمال التحقق والوصول إلى الخدمات.',
      priority: 'high',
    });
  }

  // 5. Pending course registrations
  const totalPending = (pendingLanguageForms?.length || 0) + (pendingTrainingForms?.length || 0);
  if (totalPending > 0) {
    alerts.push({
      id: 'registrations-pending',
      style: 'info',
      icon: RefreshCw,
      title: `${totalPending} طلب تسجيل قيد المراجعة`,
      body: 'سيتم تفعيل الوصول فور موافقة الإدارة على طلباتك.',
      priority: 'low',
    });
  }

  // 6. Support lesson about to expire
  const now = new Date();
  const expiringSoon = (supportRegistrations || []).filter((reg) => {
    if (reg.status !== 'verified' && reg.status !== 'approved') return false;
    const end = reg.endDate?.toDate ? reg.endDate.toDate() : reg.endDate ? new Date(reg.endDate) : null;
    if (!end) return false;
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
  });

  if (expiringSoon.length > 0) {
    alerts.push({
      id: 'support-expiring',
      style: 'urgent',
      icon: AlertTriangle,
      title: `اشتراك دروس الدعم ينتهي قريباً`,
      body: `${expiringSoon.length > 1 ? `${expiringSoon.length} اشتراكات تنتهي` : 'اشتراك ينتهي'} خلال أقل من أسبوع. يرجى تجديده مع الإدارة.`,
      priority: 'urgent',
    });
  }

  // Sort: urgent > high > medium > low
  const order = { urgent: 0, high: 1, medium: 2, low: 3 };
  return alerts.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
}

const STYLE_MAP = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-900',
    iconBg: 'bg-blue-100 text-blue-600',
    close: 'text-blue-400 hover:text-blue-700',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-900',
    iconBg: 'bg-amber-100 text-amber-600',
    close: 'text-amber-400 hover:text-amber-700',
  },
  urgent: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-900',
    iconBg: 'bg-red-100 text-red-600',
    close: 'text-red-400 hover:text-red-700',
  },
  success: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-900',
    iconBg: 'bg-green-100 text-green-600',
    close: 'text-green-400 hover:text-green-700',
  },
};

const PersonalizedAnnouncements = ({
  annualFeeStatus,
  verificationStatus,
  pendingLanguageForms,
  pendingTrainingForms,
  supportRegistrations,
}) => {
  const [dismissed, setDismissed] = useState(new Set());

  const allAlerts = useMemo(
    () =>
      buildPersonalizedAlerts({
        annualFeeStatus,
        verificationStatus,
        pendingLanguageForms,
        pendingTrainingForms,
        supportRegistrations,
      }),
    [annualFeeStatus, verificationStatus, pendingLanguageForms, pendingTrainingForms, supportRegistrations]
  );

  const visible = allAlerts.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-6" dir="rtl">
      {/* Section label */}
      <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
        <Bell className="w-4 h-4" />
        تنبيهات خاصة بحسابك
      </div>

      {visible.map((alert) => {
        const s = STYLE_MAP[alert.style] || STYLE_MAP.info;
        const Icon = alert.icon;

        return (
          <div
            key={alert.id}
            className={`
              relative flex items-start gap-3 rounded-xl border-r-4 p-4
              ${s.bg} ${s.border}
              ${alert.style === 'urgent' ? 'ring-1 ring-red-200' : ''}
            `}
          >
            {/* Urgent pulse */}
            {alert.style === 'urgent' && (
              <span className="absolute top-3 left-3 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}

            {/* Icon */}
            <div className={`flex-shrink-0 p-2 rounded-full ${s.iconBg}`}>
              <Icon className="w-4 h-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm ${s.text}`}>{alert.title}</p>
              {alert.body && (
                <p className={`text-xs mt-0.5 opacity-80 ${s.text}`}>{alert.body}</p>
              )}
              {alert.ctaLabel && alert.ctaLink && (
                <Link
                  to={alert.ctaLink}
                  className={`
                    inline-block mt-2 px-3 py-1 rounded-lg text-xs font-semibold text-white
                    transition-opacity hover:opacity-85
                    ${alert.style === 'urgent' ? 'bg-red-600' :
                      alert.style === 'warning' ? 'bg-amber-600' : 'bg-blue-600'}
                  `}
                >
                  {alert.ctaLabel}
                </Link>
              )}
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}
              className={`flex-shrink-0 p-1 rounded transition-colors ${s.close}`}
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default PersonalizedAnnouncements;
