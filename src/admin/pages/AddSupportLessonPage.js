import React, { useState } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import { createSupportLesson } from '../../services/firestoreService';
import { BookOpen, User, Clock, Plus, X, AlertCircle } from 'lucide-react';

/**
 * Admin page for adding new support lessons
 * Structure: { name, grade, teacher, timings, subjects, createdBy, branchId }
 */
const AddSupportLessonPage = () => {
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    grade: '',
    teacher: '',
    subjects: [],
    timings: []
  });
  const [newSubject, setNewSubject] = useState('');
  // State for a new time slot being added
  const [newTiming, setNewTiming] = useState({ 
    day: '', 
    start: '', 
    end: '' 
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddSubject = () => {
    if (newSubject.trim() && !formData.subjects.includes(newSubject.trim())) {
      setFormData(prev => ({
        ...prev,
        subjects: [...prev.subjects, newSubject.trim()]
      }));
      setNewSubject('');
    }
  };

  const handleRemoveSubject = (subject) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s !== subject)
    }));
  };

  /**
   * Adds a new time slot to the form data
   * Validates that all required fields are filled before adding
   */
  const handleAddTiming = () => {
    if (!newTiming.day || !newTiming.start || !newTiming.end) {
      setError('الرجاء ملء جميع حقول الوقت (اليوم، وقت البداية، وقت النهاية)');
      return;
    }

    // Check if this time slot already exists
    const isDuplicate = formData.timings.some(
      time => 
        time.day === newTiming.day && 
        time.start === newTiming.start && 
        time.end === newTiming.end
    );

    if (isDuplicate) {
      setError('هذا التوقيت مضاف مسبقاً');
      return;
    }

    setFormData(prev => ({
      ...prev,
      timings: [...prev.timings, { ...newTiming }]
    }));
    
    // Reset the form
    setNewTiming({ day: '', start: '', end: '' });
    setError('');
  };

  const handleRemoveTiming = (index) => {
    setFormData(prev => ({
      ...prev,
      timings: prev.timings.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedBranchId) {
      setError('يرجى اختيار الفرع أولاً');
      return;
    }

    // Validate required fields including at least one time slot
    if (!formData.name || !formData.grade || !formData.teacher || formData.subjects.length === 0) {
      setError('يرجى ملء جميع الحقول المطلوبة (الاسم، الصف، المعلم، المواد)');
      return;
    }
    
    // Ensure at least one time slot is added
    if (formData.timings.length === 0) {
      setError('الرجاء إضافة وقت واحد على الأقل للدرس');
      return;
    }

    if (!user) {
      setError('يجب تسجيل الدخول كمسؤول');
      return;
    }

    try {
      setSubmitting(true);
      
      const createdBy = {
        uid: user.uid,
        email: user.email || ''
      };

      await createSupportLesson(selectedBranchId, formData, createdBy);

      setSuccess('تم إضافة درس الدعم بنجاح');
      setFormData({
        name: '',
        grade: '',
        teacher: '',
        subjects: [],
        timings: []
      });
      setNewSubject('');
      setNewTiming({ day: '', start: '', end: '' });
    } catch (err) {
      console.error('Error adding support lesson:', err);
      setError('حدث خطأ أثناء إضافة درس الدعم: ' + err.message);
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
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">إضافة درس دعم جديد</h1>
          <p className="text-gray-600">أضف درس دعم جديد مع التفاصيل الكاملة</p>
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
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              اسم الدرس <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <BookOpen className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="مثال: دعم في الرياضيات - السنة الثالثة ثانوي"
                className="block w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Grade */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              الصف الدراسي <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="grade"
              value={formData.grade}
              onChange={handleChange}
              placeholder="مثال: mid1, sec2, sec3"
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              استخدم الترميز: mid1, mid2, mid3, mid4 للمتوسط | sec1, sec2, sec3 للثانوي
            </p>
          </div>

          {/* Teacher */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              المعلم <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                name="teacher"
                value={formData.teacher}
                onChange={handleChange}
                placeholder="اسم المعلم"
                className="block w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Subjects */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              المواد <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubject())}
                placeholder="أدخل اسم المادة"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <button
                type="button"
                onClick={handleAddSubject}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {formData.subjects.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.subjects.map((subject, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {subject}
                    <button
                      type="button"
                      onClick={() => handleRemoveSubject(subject)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Time Slots */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                أوقات الدرس
                {formData.timings.length === 0 && <span className="text-red-500"> *</span>}
              </label>
              
              {/* Add Time Slot Form */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">إضافة وقت جديد</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">اليوم</label>
                    <input
                      type="text"
                      value={newTiming.day}
                      onChange={(e) => setNewTiming(prev => ({ ...prev, day: e.target.value }))}
                      placeholder="مثال: السبت"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">وقت البداية</label>
                    <input
                      type="time"
                      value={newTiming.start}
                      onChange={(e) => setNewTiming(prev => ({ ...prev, start: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">وقت النهاية</label>
                    <input
                      type="time"
                      value={newTiming.end}
                      onChange={(e) => setNewTiming(prev => ({ ...prev, end: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddTiming}
                      className="w-full h-[42px] bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة الوقت</span>
                    </button>
                  </div>
                </div>
                
                <p className="mt-2 text-xs text-gray-500">
                  يمكنك إضافة أكثر من وقت للدرس الواحد
                </p>
              </div>
              
              {/* Time Slots List */}
              {formData.timings.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">الأوقات المضافة:</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {formData.timings.map((time, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow transition-shadow"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-full">
                            <Clock className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{time.day}</p>
                            <p className="text-xs text-gray-500">
                              من {time.start} إلى {time.end}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveTiming(index)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="حذف الوقت"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 bg-yellow-50 border border-yellow-100 rounded-lg">
                  <p className="text-sm text-yellow-700">لم يتم إضافة أي أوقات بعد</p>
                </div>
              )}
            </div>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">ملاحظة:</h4>
            <p className="text-sm text-blue-800">
              سيظهر هذا الدرس تلقائياً على الموقع الرئيسي للطلاب عند اختيارهم للمستوى والصف والمادة المناسبة.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setFormData({
                  name: '',
                  grade: '',
                  teacher: '',
                  subjects: [],
                  timings: []
                });
                setNewSubject('');
                setNewTiming({ day: '', start: '', end: '' });
              }}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              إعادة تعيين
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'جاري الإضافة...' : 'إضافة الدرس'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSupportLessonPage;
