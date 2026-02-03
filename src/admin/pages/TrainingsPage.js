import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import { createTraining, approvePendingTraining, deletePendingTraining } from '../../services/firestoreService';
import { Plus, Edit2, Trash2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import Breadcrumb from '../components/Breadcrumb';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

const DAYS_OF_WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const TrainingsPage = () => {
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingTrainings, setPendingTrainings] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '',
    price: '',
    dayOfWeek: '',
    startTime: '',
    endTime: '',
    teacher: ''
  });
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    if (!selectedBranchId) {
      setTrainings([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'branches', selectedBranchId, 'trainings'),
      (snapshot) => {
        const trainingsData = snapshot.docs.map(doc => ({
          id: doc.id,
          title: doc.data().title || '',
          price: doc.data().price || 0,
          dayOfWeek: doc.data().dayOfWeek || doc.data().day || '',
          startTime: doc.data().startTime || '',
          endTime: doc.data().endTime || '',
          teacher: doc.data().teacher || '',
          ...doc.data()
        }));
        setTrainings(trainingsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching trainings:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      setPendingTrainings([]);
      setPendingLoading(false);
      return;
    }

    setPendingLoading(true);
    const pendingQuery = query(
      collection(db, 'branches', selectedBranchId, 'pendingTrainings'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      pendingQuery,
      (snapshot) => {
        const pendingData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPendingTrainings(pendingData);
        setPendingLoading(false);
      },
      (error) => {
        console.error('Error fetching pending trainings:', error);
        setPendingLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedBranchId]);

  const buildAdminInfo = () => ({
    uid: user?.uid || '',
    email: user?.email || '',
    name: user?.displayName || user?.email || ''
  });

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'غير محدد';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('ar-DZ', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'غير محدد';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBranchId || !form.title.trim() || !form.price || !form.dayOfWeek || !form.startTime || !form.endTime || !form.teacher.trim()) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      const trainingData = {
        title: form.title,
        price: Number(form.price),
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        teacher: form.teacher,
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'branches', selectedBranchId, 'trainings', editingId), trainingData);
        alert('تم تحديث بيانات الدورة بنجاح');
      } else {
        await createTraining(selectedBranchId, trainingData, buildAdminInfo());
        alert('تم حفظ الدورة. ستظهر للطلاب بعد التحقق.');
      }
      resetForm();
    } catch (error) {
      console.error('Error saving training:', error);
      alert('حدث خطأ أثناء حفظ الدورة');
    }
  };

  const handleApprovePending = async (trainingId) => {
    if (!selectedBranchId) return;
    setActionLoading(prev => ({ ...prev, [trainingId]: true }));
    try {
      await approvePendingTraining(selectedBranchId, trainingId, buildAdminInfo());
    } catch (error) {
      console.error('Error approving training:', error);
      alert('حدث خطأ أثناء اعتماد الدورة');
    } finally {
      setActionLoading(prev => ({ ...prev, [trainingId]: false }));
    }
  };

  const handleRejectPending = async (trainingId) => {
    if (!selectedBranchId) return;
    if (!window.confirm('هل تريد رفض هذه الدورة؟ سيتم حذفها.')) return;
    setActionLoading(prev => ({ ...prev, [trainingId]: true }));
    try {
      await deletePendingTraining(selectedBranchId, trainingId);
    } catch (error) {
      console.error('Error rejecting training:', error);
      alert('حدث خطأ أثناء رفض الدورة');
    } finally {
      setActionLoading(prev => ({ ...prev, [trainingId]: false }));
    }
  };

  const handleEdit = (training) => {
    setForm({
      title: training.title || '',
      price: training.price || '',
      dayOfWeek: training.dayOfWeek || training.day || '',
      startTime: training.startTime || '',
      endTime: training.endTime || '',
      teacher: training.teacher || ''
    });
    setEditingId(training.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الدورة التكوينية؟')) return;
    if (!selectedBranchId) return;

    try {
      await deleteDoc(doc(db, 'branches', selectedBranchId, 'trainings', id));
    } catch (error) {
      console.error('Error deleting training:', error);
      alert('حدث خطأ أثناء حذف الدورة');
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
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

  const combinedTrainings = [
    ...pendingTrainings.map((training) => ({
      ...training,
      __source: 'pending',
    })),
    ...trainings.map((training) => ({
      ...training,
      __source: 'active',
    })),
  ].sort((a, b) => {
    const aDate = a?.createdAt?.toDate ? a.createdAt.toDate() : (a?.createdAt ? new Date(a.createdAt) : null);
    const bDate = b?.createdAt?.toDate ? b.createdAt.toDate() : (b?.createdAt ? new Date(b.createdAt) : null);
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return bDate - aDate;
  });

  return (
    <motion.div 
      className="space-y-8" 
      dir="rtl" 
      initial={{ opacity: 0, y: 8 }} 
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <Breadcrumb trail={["إدارة الدورات التكوينية"]} />
        <h1 className="text-3xl font-bold text-primary mb-2">إدارة الدورات التكوينية</h1>
        <p className="text-gray-600">إضافة وتعديل وحذف الدورات التكوينية مع جداولها</p>
      </div>

      {!showAddForm ? (
        <Button onClick={() => setShowAddForm(true)} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          إضافة دورة تكوينية جديدة
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold leading-none tracking-tight">{editingId ? 'تعديل الدورة التكوينية' : 'إضافة دورة تكوينية جديدة'}</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">عنوان الدورة</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.title}
                    onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="مثال: ورشة الكتابة الإبداعية"
                    required
                  />
                </div>
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
                  {editingId ? 'حفظ التعديلات' : 'إضافة الدورة'}
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
        <h2 className="text-2xl font-semibold text-primary">الدورات</h2>
        {pendingLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : combinedTrainings.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              لا توجد دورات تكوينية مضافة بعد
            </CardContent>
          </Card>
        ) : (
          combinedTrainings.map(training => (
            <motion.div
              key={training.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">{formatTimestamp(training.createdAt)}</p>
                      <h3 className="text-xl font-semibold leading-none tracking-tight mb-2">
                        {training.title || 'بدون عنوان'}
                      </h3>
                      <p className="text-sm text-gray-600">السعر: {training.price || 0} دج</p>
                    </div>
                    <div className="flex gap-2">
                      {training.__source === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprovePending(training.id)}
                            disabled={!!actionLoading[training.id]}
                            className="flex items-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            تفعيل
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRejectPending(training.id)}
                            disabled={!!actionLoading[training.id]}
                            className="flex items-center gap-1"
                          >
                            <XCircle className="w-4 h-4" />
                            رفض
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(training)}
                            className="flex items-center gap-1"
                          >
                            <Edit2 className="w-4 h-4" />
                            تعديل
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(training.id)}
                            className="flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            حذف
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3">
                    {training.__source === 'pending' ? (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">بانتظار التفعيل</span>
                    ) : (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">مفعلة</span>
                    )}
                    <Badge variant="secondary">{training.dayOfWeek || training.day || '—'}</Badge>
                    <span className="text-sm text-gray-600">
                      {training.startTime || '—'} - {training.endTime || '—'}
                    </span>
                    <span className="text-sm font-medium">المدرس: {training.teacher || '—'}</span>
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

export default TrainingsPage;
