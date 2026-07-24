import React from 'react';
import { CheckCircle } from 'lucide-react';

/**
 * EnrolledNotice
 * --------------
 * Shown IN PLACE of the Chargily Pay button once a student already has a paid
 * registration for the selected class/service. Prevents a second checkout and
 * makes the "already paid" state obvious (mirrors the support form's blocked state).
 */
const EnrolledNotice = ({
  title = 'تم الدفع — أنت مسجّل بالفعل',
  message = 'لقد أتممت الدفع والتسجيل في هذه الخدمة. يمكنك متابعة التفاصيل من لوحة التحكم.',
}) => (
  <div
    className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800"
    dir="rtl"
    role="status"
  >
    <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" aria-hidden="true" />
    <div className="space-y-1">
      <p className="font-semibold text-green-900">{title}</p>
      <p className="text-sm">{message}</p>
    </div>
  </div>
);

export default EnrolledNotice;
