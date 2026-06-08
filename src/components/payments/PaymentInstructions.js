import React, { useState } from 'react';
import { CreditCard, Upload, Loader2 } from 'lucide-react';
import { PAYMENT_METHODS } from '../../config/paymentConfig';
import { validateImageFile, optimizeImage, formatBytes } from '../../utils/imageOptimizer';
import UploadGuide from '../UploadGuide';

const PaymentInstructions = ({
  selectedMethod,
  onMethodChange,
  receiptFile,
  onReceiptChange,
  methodError,
  receiptError,
  disabled = false,
  inputId = 'payment-receipt-input',
}) => {
  const [fileError, setFileError] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [optimizedSize, setOptimizedSize] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later
    e.target.value = '';
    if (!file) return;

    setFileError('');
    setOptimizedSize(null);

    // 1. Strict validation (type + 5MB max) with bilingual messages
    const { valid, error } = validateImageFile(file);
    if (!valid) {
      setFileError(error);
      onReceiptChange(null);
      return;
    }

    // 2. Automatic optimization (resize → WebP → compress) with progress
    try {
      setOptimizing(true);
      setProgress(0);
      const optimized = await optimizeImage(file, {
        onProgress: (p) => setProgress(p),
      });
      setOptimizedSize(optimized.size);
      onReceiptChange(optimized);
    } catch (err) {
      console.error('Receipt optimization error:', err);
      // Fail safe: still let the original through so the user isn't blocked
      onReceiptChange(file);
    } finally {
      setOptimizing(false);
    }
  };

  const handleRemove = () => {
    setFileError('');
    setOptimizedSize(null);
    onReceiptChange(null);
  };

  const shownReceiptError = receiptError || fileError;

  return (
    <div className="space-y-6">
      {/* Payment Method Selection */}
      <div>
        <label className="block text-lg font-medium text-gray-700 mb-3">
          <CreditCard className="w-4 h-4 inline ml-1" />
          طريقة الدفع <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PAYMENT_METHODS.map((method) => (
            <label
              key={method.value}
              className={`flex items-start p-4 border rounded-lg transition-colors ${
                disabled
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer hover:border-primary'
              } ${
                selectedMethod === method.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                value={method.value}
                checked={selectedMethod === method.value}
                onChange={() => !disabled && onMethodChange(method.value)}
                disabled={disabled}
                className="ml-3 mt-1 accent-primary"
              />
              <div>
                <div className="font-medium mb-1">{method.label}</div>
                {method.details.map((detail) => (
                  <div key={detail.label} className="text-sm text-gray-600">
                    <span className="font-medium text-gray-700">{detail.label}: </span>
                    <span className="font-mono select-all">{detail.value}</span>
                  </div>
                ))}
              </div>
            </label>
          ))}
        </div>
        {methodError && (
          <p className="text-red-500 text-sm mt-1">{methodError}</p>
        )}
      </div>

      {/* Receipt Upload */}
      <div>
        <label className="block text-lg font-medium text-gray-700 mb-2">
          <Upload className="w-4 h-4 inline ml-1" />
          صورة إيصال الدفع <span className="text-red-500">*</span>
          <span className="text-sm font-normal text-gray-500 mr-1">(JPG/PNG/WEBP — أقصى حجم 5MB)</span>
        </label>

        {/* Upload conditions guide */}
        <UploadGuide compact className="mb-3" />

        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            disabled
              ? 'bg-gray-50 opacity-70 cursor-not-allowed border-gray-200'
              : 'hover:border-primary border-gray-300'
          } ${shownReceiptError ? 'border-red-300' : ''}`}
        >
          {optimizing ? (
            <div className="py-4">
              <Loader2 className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
              <p className="text-gray-700 font-medium mb-2">جاري تحسين الصورة... · Optimisation de l'image...</p>
              <div className="max-w-xs mx-auto bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : receiptFile ? (
            <div>
              <img
                src={URL.createObjectURL(receiptFile)}
                alt="إيصال الدفع"
                className="max-w-full h-48 object-contain mx-auto mb-4 rounded"
              />
              <p className="text-green-600 font-medium text-sm">{receiptFile.name}</p>
              {optimizedSize != null && (
                <p className="text-xs text-gray-500 mt-1">
                  تم تحسين الصورة · الحجم النهائي: {formatBytes(optimizedSize)}
                </p>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-red-500 text-sm mt-2 hover:underline"
                >
                  إزالة الصورة
                </button>
              )}
            </div>
          ) : (
            <div>
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-1">اضغط لرفع صورة الإيصال</p>
              <p className="text-sm text-gray-500">JPG, PNG, WEBP — أقل من 5MB</p>
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
            id={inputId}
            disabled={disabled || optimizing}
          />
          {!disabled && (
            <label
              htmlFor={inputId}
              className={`inline-block mt-4 bg-primary text-white px-4 py-2 rounded-lg transition-colors text-sm ${
                optimizing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-primary-600'
              }`}
            >
              اختيار صورة
            </label>
          )}
        </div>
        {shownReceiptError && (
          <p className="text-red-500 text-sm mt-1">{shownReceiptError}</p>
        )}
      </div>
    </div>
  );
};

export default PaymentInstructions;
