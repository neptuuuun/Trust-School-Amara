import React, { useState } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import { createTraining } from '../../services/firestoreService';
import { GraduationCap, DollarSign, FileText, AlertCircle } from 'lucide-react';

/**
 * Admin page for adding new training courses
 */
const AddTrainingPage = () => {
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedBranchId) {
      setError('يرجى اختيار الفرع أولاً');
      return;
    }

    if (!formData.title || !formData.price) {
      setError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      setSubmitting(true);
      
      await createTraining(
        selectedBranchId,
        {
          title: formData.title,
          description: formData.description,
          price: parseFloat(formData.price)
        },
        {
          uid: user?.uid || '',
          email: user?.email || '',
          name: user?.displayName || user?.email || ''
        }
      );

      setSuccess('تم إرسال الدورة للمراجعة. لن تظهر للطلاب حتى يتم التحقق منها.');
      setFormData({ title: '', description: '', price: '' });
    } catch (err) {
      console.error('Error adding training:', err);
      setError('حدث خطأ أثناء إضافة الدورة التكوينية');
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedBranchId) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">إضافة دورة تكوينية جديدة</h1>
          <p className="text-gray-600">أضف دورة تكوينية جديدة للطلاب في هذا الفرع</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 mb-6">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              عنوان الدورة <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <GraduationCap className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="مثال: برمجة المواقع، التصميم الجرافيكي، إدارة الأعمال"
                className="block w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              وصف الدورة
            </label>
            <div className="relative">
              <div className="absolute top-3 right-3 pointer-events-none">
                <FileText className="h-5 w-5 text-gray-400" />
              </div>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="وصف مفصل عن الدورة، المحتوى، المدة، الشهادة، إلخ..."
                rows={4}
                className="block w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              السعر (دج) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <DollarSign className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                placeholder="مثال: 10000"
                min="0"
                step="100"
                className="block w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">السعر الكلي للدورة التكوينية</p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFormData({ title: '', description: '', price: '' })}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              إعادة تعيين
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'جاري الإضافة...' : 'إضافة الدورة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTrainingPage;







