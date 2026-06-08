import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { storage, db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';
import { useBranch } from '../contexts/BranchContext';
import { CreditCard, Calendar, Hash, Upload } from 'lucide-react';
import PaymentInstructions from './payments/PaymentInstructions';
import { Button } from './ui/button';
import { Input, Textarea, Label } from './ui/input';
import { Alert, Spinner } from './ui/feedback';

const PaymentUploadForm = ({ 
  paymentType, 
  amount, 
  serviceRef, 
  serviceName,
  onComplete, 
  onCancel 
}) => {
  const [user] = useAuthState(auth);
  const { selectedBranch } = useBranch();
  const [loading, setLoading] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentMethodError, setPaymentMethodError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setPaymentMethodError('');
    setReceiptError('');
    setSubmitError('');

    if (!paymentMethod) {
      setPaymentMethodError('يرجى اختيار طريقة الدفع');
      return;
    }
    if (!screenshot) {
      setReceiptError('يرجى رفع صورة إيصال الدفع');
      return;
    }

    if (!selectedBranch?.id) {
      setSubmitError('يرجى اختيار الفرع أولاً.');
      return;
    }
    setLoading(true);
    try {
      let screenshotUrl = null;

      if (screenshot) {
        const paymentId = `payment_${Date.now()}`;
        // Owner-scoped path (payments/{uid}/...) so Storage rules permit only the
        // owner to write and only the owner/admin to read their own receipts.
        const screenshotRef = ref(storage, `payments/${user.uid}/${paymentId}.jpg`);
        const snapshot = await uploadBytes(screenshotRef, screenshot, {
          contentType: screenshot.type || 'image/jpeg',
        });
        screenshotUrl = await getDownloadURL(snapshot.ref);
      }

      // Fetch user data from branch-scoped users collection
      const userDoc = await getDoc(doc(db, 'branches', selectedBranch.id, 'users', user.uid));
      const userData = userDoc.data();
      let finalAmount = amount;
      let notes = data.notes || '';

      if (paymentType === 'supportLesson' && !userData.firstSupportPaymentDone) {
        finalAmount += 1000; // Add registration fee
        notes += (notes ? '\n' : '') + 'رسوم التسجيل الأولى مشمولة (1000 دج)';
      }

      // Create payment document
      const paymentData = {
        userId: user.uid,
        branchId: selectedBranch.id,
        courseId: serviceRef,
        type: paymentType,
        amount: finalAmount,
        month: paymentType === 'supportLesson' ? new Date().toISOString().slice(0, 7) : null, // YYYY-MM
        paymentMethod: paymentMethod,
        transactionNumber: data.transactionNumber || null,
        transactionDate: data.transactionDate || null,
        screenshotUrl: screenshotUrl,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        notes: notes
      };

      await addDoc(collection(db, 'branches', selectedBranch.id, 'payments'), paymentData);

      onComplete(paymentData);

    } catch (error) {
      console.error('Payment upload error:', error);
      setSubmitError('حدث خطأ أثناء رفع الدفعة. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-primary">رفع إيصال الدفع</h2>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Payment Info */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center">
              <CreditCard className="w-5 h-5 text-primary me-2" />
              <span className="font-medium">الخدمة:</span>
              <span className="ms-2">{serviceName}</span>
            </div>
            <div className="flex items-center">
              <span className="font-medium">المبلغ:</span>
              <span className="ms-2 text-primary font-bold">
                {(() => {
                  // Calculate final amount
                  let finalAmount = amount;
                  if (paymentType === 'supportLesson') {
                    // We can't fetch user data here synchronously, so show estimated
                    finalAmount += 1000; // Assume first time
                  }
                  return finalAmount;
                })()} دج
                {paymentType === 'supportLesson' && (
                  <span className="text-sm text-gray-600 ms-2">(قد يشمل رسوم التسجيل الأولى)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {submitError && <Alert variant="danger">{submitError}</Alert>}

          {/* Payment Method & Receipt */}
          <PaymentInstructions
            selectedMethod={paymentMethod}
            onMethodChange={(m) => { setPaymentMethod(m); setPaymentMethodError(''); }}
            receiptFile={screenshot}
            onReceiptChange={(f) => { setScreenshot(f); setReceiptError(''); }}
            methodError={paymentMethodError}
            receiptError={receiptError}
            disabled={loading}
            inputId="payment-upload-screenshot"
          />

          {/* Transaction Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="transactionNumber" className="flex items-center gap-1.5">
                <Hash className="w-4 h-4" aria-hidden="true" />
                رقم العملية
              </Label>
              <Input
                id="transactionNumber"
                type="text"
                {...register('transactionNumber')}
                placeholder="رقم الإيصال أو العملية (اختياري)"
              />
            </div>

            <div>
              <Label htmlFor="transactionDate" className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" aria-hidden="true" />
                تاريخ العملية
              </Label>
              <Input
                id="transactionDate"
                type="date"
                {...register('transactionDate')}
              />
            </div>
          </div>


          {/* Notes */}
          <div>
            <Label htmlFor="notes">ملاحظات إضافية</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="أي ملاحظات أو تفاصيل إضافية..."
              rows={3}
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            <Button type="button" variant="neutral" onClick={onCancel}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <><Spinner size="sm" className="text-white" />جاري الرفع...</>
              ) : (
                <><Upload className="w-4 h-4" />رفع الدفعة</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentUploadForm;
