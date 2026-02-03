import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import Breadcrumb from '../components/Breadcrumb';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { getYearIdFromLabel, getYearById } from '../../data/studyLevels';

const DAYS_OF_WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const MIDDLE_SCHOOL_LEVELS = ['أولى متوسط', 'ثانية متوسط', 'ثالثة متوسط', 'رابعة متوسط'];

const SupportLessonsMiddlePage = () => {
  const { selectedBranchId } = useBranch();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    studyLevel: '',
    subject: '',
    price: '',
    dayOfWeek: '',
    startTime: '',
    endTime: '',
    teacher: ''
  });

  useEffect(() => {
    if (!selectedBranchId) {
      setLessons([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'branches', selectedBranchId, 'supportLessons'),
        where('level', '==', 'middle')
      ),
      (snapshot) => {
        const lessonsData = snapshot.docs.map(doc => {
          const data = doc.data();
          const normalizedYear = data.studyYear || data.year || data.grade || getYearIdFromLabel(data.studyLevel || '');
          const normalizedStudyLevel = data.studyLevel || (normalizedYear ? getYearById(normalizedYear)?.nameShort : '');
          
          return {
            id: doc.id,
            ...data,
            studyLevel: normalizedStudyLevel || '',
            subject: data.subject || '',
            price: data.price || 0,
            level: data.level || 'middle',
            dayOfWeek: data.dayOfWeek || data.day || '',
            startTime: data.startTime || '',
            endTime: data.endTime || '',
            teacher: data.teacher || '',
            year: normalizedYear || '',
            grade: data.grade || normalizedYear || ''
          };
        });
        setLessons(lessonsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching support lessons:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedBranchId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBranchId || !form.studyLevel || !form.subject.trim() || !form.price || !form.dayOfWeek || !form.startTime || !form.endTime || !form.teacher.trim()) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const yearCode = getYearIdFromLabel(form.studyLevel);
    if (!yearCode) {
      alert('تعذر مطابقة المستوى الدراسي المحدد مع رمز السنة. يرجى التحقق والمحاولة مجدداً.');
      return;
    }

    try {
      const lessonData = {
        studyLevel: form.studyLevel,
        studyYear: yearCode,
        year: yearCode,
        grade: yearCode,
        subject: form.subject,
        price: Number(form.price),
        level: 'middle',
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        teacher: form.teacher,
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'branches', selectedBranchId, 'supportLessons', editingId), lessonData);
      } else {
        await addDoc(collection(db, 'branches', selectedBranchId, 'supportLessons'), {
          ...lessonData,
          createdAt: serverTimestamp()
        });
      }
      resetForm();
    } catch (error) {
      console.error('Error saving support lesson:', error);
      alert('حدث خطأ أثناء حفظ درس الدعم');
    }
  };

  const handleEdit = (lesson) => {
    const studyLevelLabel = lesson.studyLevel || (lesson.year ? getYearById(lesson.year)?.nameShort : '');
    setForm({
      studyLevel: studyLevelLabel || '',
      subject: lesson.subject || '',
      price: lesson.price || '',
      dayOfWeek: lesson.dayOfWeek || lesson.day || '',
      startTime: lesson.startTime || '',
      endTime: lesson.endTime || '',
      teacher: lesson.teacher || ''
    });
    setEditingId(lesson.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف درس الدعم هذا؟')) return;
    if (!selectedBranchId) return;

    try {
      await deleteDoc(doc(db, 'branches', selectedBranchId, 'supportLessons', id));
    } catch (error) {
      console.error('Error deleting support lesson:', error);
      alert('حدث خطأ أثناء حذف درس الدعم');
    }
  };

  const resetForm = () => {
    setForm({
      studyLevel: '',
      subject: '',
      price: '',
      dayOfWeek: '',
      startTime: '',
      endTime: '',
      teacher: ''
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  if (!selectedBranchId) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-8" 
      dir="rtl" 
      initial={{ opacity: 0, y: 8 }} 
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <Breadcrumb trail={["إدارة دروس الدعم", "المتوسط"]} />
        <h1 className="text-3xl font-bold text-primary mb-2">إدارة دروس الدعم - المتوسط</h1>
        <p className="text-gray-600">إضافة وتعديل وحذف دروس الدعم للمرحلة المتوسطة</p>
      </div>

      {!showAddForm ? (
        <Button onClick={() => setShowAddForm(true)} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          إضافة درس دعم جديد
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold leading-none tracking-tight">{editingId ? 'تعديل درس الدعم' : 'إضافة درس دعم جديد'}</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">المستوى الدراسي</label>
                  <select
                    className="input w-full"
                    value={form.studyLevel}
                    onChange={(e) => setForm(prev => ({ ...prev, studyLevel: e.target.value }))}
                    required
                  >
                    <option value="">اختر المستوى الدراسي</option>
                    {MIDDLE_SCHOOL_LEVELS.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">المادة</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.subject}
                    onChange={(e) => setForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="مثال: الرياضيات، الفيزياء..."
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">السعر</label>
                  <input
                    type="number"
                    className="input w-full"
                    value={form.price}
                    onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="السعر بالدينار"
                    required
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">يوم الأسبوع</label>
                  <select
                    className="input w-full"
                    value={form.dayOfWeek}
                    onChange={(e) => setForm(prev => ({ ...prev, dayOfWeek: e.target.value }))}
                    required
                  >
                    <option value="">اختر اليوم</option>
                    {DAYS_OF_WEEK.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">وقت البداية</label>
                  <input
                    type="time"
                    className="input w-full"
                    value={form.startTime}
                    onChange={(e) => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">وقت النهاية</label>
                  <input
                    type="time"
                    className="input w-full"
                    value={form.endTime}
                    onChange={(e) => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">اسم المدرس</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.teacher}
                    onChange={(e) => setForm(prev => ({ ...prev, teacher: e.target.value }))}
                    placeholder="اسم المدرس"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  {editingId ? 'حفظ التعديلات' : 'إضافة الدرس'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} className="flex-1">
                  إلغاء
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {!lessons || lessons.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              لا توجد دروس دعم مضافة بعد
            </CardContent>
          </Card>
        ) : (
          lessons.map(lesson => (
            <motion.div
              key={lesson.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold leading-none tracking-tight mb-2">
                        {lesson.subject || 'بدون مادة'}
                        {lesson.studyLevel && ` - ${lesson.studyLevel}`}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="info">المتوسط</Badge>
                        {lesson.studyLevel && (
                          <Badge variant="secondary">{lesson.studyLevel}</Badge>
                        )}
                        <p className="text-sm text-gray-600">السعر: {lesson.price || 0} دج</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(lesson)}
                        className="flex items-center gap-1"
                      >
                        <Edit2 className="w-4 h-4" />
                        تعديل
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(lesson.id)}
                        className="flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        حذف
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary">{lesson.dayOfWeek || lesson.day || '—'}</Badge>
                    <span className="text-sm text-gray-600">
                      {lesson.startTime || '—'} - {lesson.endTime || '—'}
                    </span>
                    <span className="text-sm font-medium">المدرس: {lesson.teacher || '—'}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};

export default SupportLessonsMiddlePage;
