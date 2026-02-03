import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { storage, db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';
import { useBranch } from '../contexts/BranchContext';
import { Upload, CreditCard, Calendar, Hash, Camera } from 'lucide-react';

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
  
  const { register, handleSubmit, formState: { errors } } = useForm();

  const paymentMethods = [
    { value: 'ccp', label: 'بريد الجزائر CCP', account: '1234567890' },
    { value: 'baridimob', label: 'بريدي موب BaridiMob', account: '0123456789' },
    { value: 'cib', label: 'بنك CIB', account: '9876543210' },
    { value: 'cash', label: 'دفع نقدي', account: 'في المؤسسة' }
  ];

  const handleScreenshotUpload = (file) => {
    if (file && file.size <= 10 * 1024 * 1024) { // 10MB limit
      setScreenshot(file);
    } else {
      alert('حجم الملف يجب أن يكون أقل من 10 ميجابايت');
    }
  };

  const onSubmit = async (data) => {
    if (!screenshot && data.paymentMethod !== 'cash') {
      alert('يرجى رفع صورة إيصال الدفع');
      return;
    }

    if (!selectedBranch?.id) {
      alert('يرجى اختيار الفرع أولاً.');
      return;
    }
    setLoading(true);
    try {
      let screenshotUrl = null;

      if (screenshot) {
        const paymentId = `payment_${Date.now()}`;
        const screenshotRef = ref(storage, `payments/${paymentId}/screenshot.jpg`);
        const snapshot = await uploadBytes(screenshotRef, screenshot);
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
        paymentMethod: data.paymentMethod,
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
      alert('حدث خطأ أثناء رفع الدفعة. يرجى المحاولة مرة أخرى.');
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
              <CreditCard className="w-5 h-5 text-primary ml-2" />
              <span className="font-medium">الخدمة:</span>
              <span className="mr-2">{serviceName}</span>
            </div>
            <div className="flex items-center">
              <span className="font-medium">المبلغ:</span>
              <span className="mr-2 text-primary font-bold">
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
                  <span className="text-sm text-gray-600 mr-2">(قد يشمل رسوم التسجيل الأولى)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Payment Method */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-3">
              طريقة الدفع *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paymentMethods.map((method) => (
                <label
                  key={method.value}
                  className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-primary transition-colors"
                >
                  <input
                    type="radio"
                    value={method.value}
                    {...register('paymentMethod', { required: 'طريقة الدفع مطلوبة' })}
                    className="ml-3"
                  />
                  <div>
                    <div className="font-medium">{method.label}</div>
                    <div className="text-sm text-gray-600">{method.account}</div>
                  </div>
                </label>
              ))}
            </div>
            {errors.paymentMethod && (
              <p className="text-red-500 text-sm mt-1">{errors.paymentMethod.message}</p>
            )}
          </div>

          {/* Transaction Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                <Hash className="w-4 h-4 inline ml-1" />
                رقم العملية
              </label>
              <input
                type="text"
                {...register('transactionNumber')}
                className="input"
                placeholder="رقم الإيصال أو العملية (اختياري)"
              />
            </div>

            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline ml-1" />
                تاريخ العملية
              </label>
              <input
                type="date"
                {...register('transactionDate')}
                className="input"
              />
            </div>
          </div>

          {/* Screenshot Upload */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-2">
              <Camera className="w-4 h-4 inline ml-1" />
              صورة إيصال الدفع *
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
              {screenshot ? (
                <div>
                  <img
                    src={URL.createObjectURL(screenshot)}
                    alt="Payment screenshot"
                    className="max-w-full h-48 object-contain mx-auto mb-4 rounded"
                  />
                  <p className="text-green-600 font-medium">{screenshot.name}</p>
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="text-red-500 text-sm mt-2 hover:underline"
                  >
                    إزالة الصورة
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">اضغط لرفع صورة إيصال الدفع</p>
                  <p className="text-sm text-gray-500">JPG, PNG أقل من 10MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleScreenshotUpload(e.target.files[0])}
                className="hidden"
                id="screenshot-upload"
              />
              <label
                htmlFor="screenshot-upload"
                className="cursor-pointer inline-block mt-4 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
              >
                <Upload className="w-4 h-4 inline ml-2" />
                اختيار صورة
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-2">
              ملاحظات إضافية
            </label>
            <textarea
              {...register('notes')}
              className="input min-h-[80px]"
              placeholder="أي ملاحظات أو تفاصيل إضافية..."
              rows={3}
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4 space-x-reverse pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-outline-primary"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2"></div>
                  جاري الرفع...
                </div>
              ) : (
                <div className="flex items-center">
                  <Upload className="w-4 h-4 ml-2" />
                  رفع الدفعة
                </div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentUploadForm;
