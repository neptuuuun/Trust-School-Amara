import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
  query,
  orderBy 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit, Trash2, Clock, User, BookOpen, GraduationCap, X } from 'lucide-react';

const SupportLessons = () => {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLesson, setEditingLesson] = useState(null);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [editData, setEditData] = useState({});
  const [newLesson, setNewLesson] = useState({ 
    name: '',
    grade: '',
    level: '',
    teacher: '',
    timing: [{ day: '', start: '', end: '' }] // Changed to array
  });

  const gradeOptions = [
    { value: 'primary1', label: 'السنة الأولى ابتدائي' },
    { value: 'primary2', label: 'السنة الثانية ابتدائي' },
    { value: 'primary3', label: 'السنة الثالثة ابتدائي' },
    { value: 'primary4', label: 'السنة الرابعة ابتدائي' },
    { value: 'primary5', label: 'السنة الخامسة ابتدائي' },
    { value: 'mid1', label: 'السنة الأولى متوسط' },
    { value: 'mid2', label: 'السنة الثانية متوسط' },
    { value: 'mid3', label: 'السنة الثالثة متوسط' },
    { value: 'mid4', label: 'السنة الرابعة متوسط' },
    { value: 'sec1', label: 'السنة الأولى ثانوي' },
    { value: 'sec2', label: 'السنة الثانية ثانوي' },
    { value: 'sec3', label: 'السنة الثالثة ثانوي' }
  ];

  const levelOptions = [
    { value: 'primary', label: 'ابتدائي' },
    { value: 'middle', label: 'متوسط' },
    { value: 'secondary', label: 'ثانوي' }
  ];

  const daysOptions = [
    'الأحد',
    'الاثنين', 
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت'
  ];

  useEffect(() => {
    console.log('🔥 Setting up Firestore listener...');
    const q = query(collection(db, 'supportCourses'), orderBy('grade'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('📊 Firestore data received:', snapshot.docs.length, 'documents');
      const lessonsData = snapshot.docs.map(doc => {
        const data = { id: doc.id, ...doc.data() };
        // Convert old timing structure to new array structure if needed
        if (data.timing && !Array.isArray(data.timing)) {
          data.timing = [data.timing];
        }
        console.log('📄 Document:', data);
        return data;
      });
      setLessons(lessonsData);
      setLoading(false);
    }, (error) => {
      console.error('❌ Firestore error:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Add new timing slot
  const addTimingSlot = () => {
    setNewLesson({
      ...newLesson,
      timing: [...newLesson.timing, { day: '', start: '', end: '' }]
    });
  };

  // Remove timing slot
  const removeTimingSlot = (index) => {
    if (newLesson.timing.length > 1) {
      const updatedTiming = newLesson.timing.filter((_, i) => i !== index);
      setNewLesson({ ...newLesson, timing: updatedTiming });
    }
  };

  // Update timing slot
  const updateTimingSlot = (index, field, value) => {
    const updatedTiming = newLesson.timing.map((slot, i) => 
      i === index ? { ...slot, [field]: value } : slot
    );
    setNewLesson({ ...newLesson, timing: updatedTiming });
  };

  // Add timing slot for editing
  const addEditTimingSlot = () => {
    setEditData({
      ...editData,
      timing: [...(editData.timing || []), { day: '', start: '', end: '' }]
    });
  };

  // Remove timing slot for editing
  const removeEditTimingSlot = (index) => {
    if (editData.timing && editData.timing.length > 1) {
      const updatedTiming = editData.timing.filter((_, i) => i !== index);
      setEditData({ ...editData, timing: updatedTiming });
    }
  };

  // Update timing slot for editing
  const updateEditTimingSlot = (index, field, value) => {
    const updatedTiming = (editData.timing || []).map((slot, i) => 
      i === index ? { ...slot, [field]: value } : slot
    );
    setEditData({ ...editData, timing: updatedTiming });
  };

  const handleAddLesson = async () => {
    if (!newLesson.name.trim() || !newLesson.grade || !newLesson.level || !newLesson.teacher.trim()) {
      alert('الرجاء ملء جميع الحقول المطلوبة');
      return;
    }
    
    try {
      console.log('➕ Adding new lesson:', newLesson);
      await addDoc(collection(db, 'supportCourses'), {
        name: newLesson.name.trim(),
        grade: newLesson.grade,
        level: newLesson.level,
        teacher: newLesson.teacher.trim(),
        timing: newLesson.timing.filter(slot => slot.day || slot.start || slot.end), // Remove empty slots
        createdAt: new Date()
      });
      
      // Reset form
      setNewLesson({ 
        name: '',
        grade: '',
        level: '',
        teacher: '',
        timing: [{ day: '', start: '', end: '' }]
      });
      setShowAddLesson(false);
      console.log('✅ Lesson added successfully');
    } catch (error) {
      console.error('❌ Error adding lesson:', error);
      alert('حدث خطأ في إضافة الدرس. الرجاء المحاولة مرة أخرى.');
    }
  };

  const handleStartEdit = (lesson) => {
    setEditingLesson(lesson.id);
    setEditData({
      name: lesson.name || '',
      teacher: lesson.teacher || '',
      timing: Array.isArray(lesson.timing) 
        ? lesson.timing.map(slot => ({
            day: slot.day || '',
            start: slot.start || '',
            end: slot.end || ''
          }))
        : [{ day: lesson.timing?.day || '', start: lesson.timing?.start || '', end: lesson.timing?.end || '' }]
    });
  };

  const handleUpdateLesson = async (lessonId) => {
    try {
      console.log('✏️ Updating lesson:', lessonId, editData);
      await updateDoc(doc(db, 'supportCourses', lessonId), {
        name: editData.name.trim(),
        teacher: editData.teacher.trim(),
        timing: editData.timing.filter(slot => slot.day || slot.start || slot.end) // Remove empty slots
      });
      setEditingLesson(null);
      setEditData({});
      console.log('✅ Lesson updated successfully');
    } catch (error) {
      console.error('❌ Error updating lesson:', error);
      alert('حدث خطأ في تحديث الدرس.');
    }
  };

  const handleCancelEdit = () => {
    setEditingLesson(null);
    setEditData({});
  };

  const handleDeleteLesson = async (lessonId) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الدرس؟')) {
      try {
        console.log('🗑️ Deleting lesson:', lessonId);
        await deleteDoc(doc(db, 'supportCourses', lessonId));
        console.log('✅ Lesson deleted successfully');
      } catch (error) {
        console.error('❌ Error deleting lesson:', error);
        alert('حدث خطأ في حذف الدرس.');
      }
    }
  };

  const getGradeLabel = (grade) => {
    const option = gradeOptions.find(opt => opt.value === grade);
    return option ? option.label : grade;
  };

  const getLevelLabel = (level) => {
    const option = levelOptions.find(opt => opt.value === level);
    return option ? option.label : level;
  };

  // Format timing display
  const formatTiming = (timing) => {
    if (!timing || (Array.isArray(timing) && timing.length === 0)) {
      return 'غير محدد';
    }

    const timingArray = Array.isArray(timing) ? timing : [timing];
    return timingArray
      .filter(slot => slot.day && slot.start && slot.end)
      .map(slot => `${slot.day} من ${slot.start} إلى ${slot.end}`)
      .join(' | ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <span className="mr-4 text-lg">جاري التحميل...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">دروس الدعم</h1>
          <p className="text-xl text-gray-600">إدارة دروس الدعم ({lessons.length} درس)</p>
        </div>
        <button
          onClick={() => setShowAddLesson(true)}
          className="btn btn-primary btn-lg"
        >
          <Plus className="ml-2 h-5 w-5" />
          إضافة درس جديد
        </button>
      </div>

      {/* Add Lesson Modal */}
      {showAddLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-primary mb-6">إضافة درس دعم جديد</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم الدرس/المادة *
                </label>
                <input
                  type="text"
                  value={newLesson.name}
                  onChange={(e) => setNewLesson({...newLesson, name: e.target.value})}
                  className="input text-lg"
                  placeholder="مثال: الرياضيات، اللغة العربية، الفيزياء..."
                  required
                />
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  المستوى التعليمي *
                </label>
                <select
                  value={newLesson.level}
                  onChange={(e) => setNewLesson({...newLesson, level: e.target.value})}
                  className="input text-lg"
                  required
                >
                  <option value="">اختر المستوى</option>
                  {levelOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  السنة الدراسية *
                </label>
                <select
                  value={newLesson.grade}
                  onChange={(e) => setNewLesson({...newLesson, grade: e.target.value})}
                  className="input text-lg"
                  required
                >
                  <option value="">اختر السنة</option>
                  {gradeOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم المدرس *
                </label>
                <input
                  type="text"
                  value={newLesson.teacher}
                  onChange={(e) => setNewLesson({...newLesson, teacher: e.target.value})}
                  className="input text-lg"
                  placeholder="أ. اسم المدرس"
                  required
                />
              </div>

              {/* Timing Slots */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-lg font-medium text-gray-700">
                    مواعيد الدروس
                  </label>
                  <button
                    type="button"
                    onClick={addTimingSlot}
                    className="btn btn-outline-primary btn-sm"
                  >
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة موعد
                  </button>
                </div>
                
                {newLesson.timing.map((slot, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border border-gray-200 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        اليوم
                      </label>
                      <select
                        value={slot.day}
                        onChange={(e) => updateTimingSlot(index, 'day', e.target.value)}
                        className="input"
                      >
                        <option value="">اختر اليوم</option>
                        {daysOptions.map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        وقت البداية
                      </label>
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateTimingSlot(index, 'start', e.target.value)}
                        className="input"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        وقت النهاية
                      </label>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateTimingSlot(index, 'end', e.target.value)}
                        className="input"
                      />
                    </div>
                    
                    <div className="flex items-end">
                      {newLesson.timing.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTimingSlot(index)}
                          className="btn btn-danger btn-sm"
                          title="حذف الموعد"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-4 space-x-reverse mt-8">
              <button
                onClick={() => setShowAddLesson(false)}
                className="btn btn-outline-primary"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddLesson}
                className="btn btn-primary"
                disabled={!newLesson.name.trim() || !newLesson.grade || !newLesson.level || !newLesson.teacher.trim()}
              >
                إضافة الدرس
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Lessons List */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100">
        <div className="p-6">
          <h2 className="text-3xl font-bold text-primary mb-6 flex items-center">
            <BookOpen className="ml-3 h-8 w-8" />
            دروس الدعم المتاحة
          </h2>
          
          {lessons.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="mx-auto h-16 w-16 text-gray-300 mb-4" />
              <p className="text-xl mb-2">لا توجد دروس دعم مضافة بعد</p>
              <p className="text-lg mb-6">ابدأ بإضافة أول درس دعم</p>
              <button
                onClick={() => setShowAddLesson(true)}
                className="btn btn-primary btn-lg"
              >
                <Plus className="ml-2 h-5 w-5" />
                إضافة أول درس
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {lessons.map((lesson) => (
                <div key={lesson.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  {editingLesson === lesson.id ? (
                    /* Edit Mode */
                    <div className="space-y-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-primary">تعديل الدرس</h3>
                        <div className="flex space-x-2 space-x-reverse">
                          <button
                            onClick={() => handleUpdateLesson(lesson.id)}
                            className="btn btn-success btn-sm"
                          >
                            حفظ
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="btn btn-outline-primary btn-sm"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            اسم المادة
                          </label>
                          <input
                            type="text"
                            value={editData.name}
                            onChange={(e) => setEditData({...editData, name: e.target.value})}
                            className="input"
                            placeholder="اسم المادة"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            اسم المدرس
                          </label>
                          <input
                            type="text"
                            value={editData.teacher}
                            onChange={(e) => setEditData({...editData, teacher: e.target.value})}
                            className="input"
                            placeholder="اسم المدرس"
                          />
                        </div>
                      </div>

                      {/* Edit Timing Slots */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <label className="block text-sm font-medium text-gray-700">
                            مواعيد الدروس
                          </label>
                          <button
                            type="button"
                            onClick={addEditTimingSlot}
                            className="btn btn-outline-primary btn-sm"
                          >
                            <Plus className="ml-1 h-4 w-4" />
                            إضافة موعد
                          </button>
                        </div>
                        
                        {(editData.timing || []).map((slot, index) => (
                          <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border border-gray-200 rounded-lg">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                اليوم
                              </label>
                              <select
                                value={slot.day || ''}
                                onChange={(e) => updateEditTimingSlot(index, 'day', e.target.value)}
                                className="input"
                              >
                                <option value="">اختر اليوم</option>
                                {daysOptions.map(day => (
                                  <option key={day} value={day}>{day}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                وقت البداية
                              </label>
                              <input
                                type="time"
                                value={slot.start || ''}
                                onChange={(e) => updateEditTimingSlot(index, 'start', e.target.value)}
                                className="input"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                وقت النهاية
                              </label>
                              <input
                                type="time"
                                value={slot.end || ''}
                                onChange={(e) => updateEditTimingSlot(index, 'end', e.target.value)}
                                className="input"
                              />
                            </div>
                            
                            <div className="flex items-end">
                              {editData.timing && editData.timing.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeEditTimingSlot(index)}
                                  className="btn btn-danger btn-sm"
                                  title="حذف الموعد"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold text-gray-800 mb-2">{lesson.name}</h3>
                          <div className="flex items-center space-x-4 space-x-reverse text-sm text-gray-600 mb-4">
                            <span className="flex items-center">
                              <GraduationCap className="h-4 w-4 ml-1" />
                              {getLevelLabel(lesson.level)}
                            </span>
                            <span className="bg-primary-100 text-primary-800 px-3 py-1 rounded-full text-sm font-medium">
                              {getGradeLabel(lesson.grade)}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-center text-gray-700">
                              <User className="h-5 w-5 text-primary ml-2" />
                              <span className="text-lg">{lesson.teacher}</span>
                            </div>
                            
                            <div className="flex items-center text-gray-700">
                              <Clock className="h-5 w-5 text-secondary ml-2" />
                              <span>{formatTiming(lesson.timing)}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex space-x-2 space-x-reverse">
                          <button
                            onClick={() => handleStartEdit(lesson)}
                            className="btn btn-outline-primary btn-sm"
                            title="تعديل الدرس"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLesson(lesson.id)}
                            className="btn btn-danger btn-sm"
                            title="حذف الدرس"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportLessons;