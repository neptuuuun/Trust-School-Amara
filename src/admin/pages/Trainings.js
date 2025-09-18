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
import { Plus, Edit, Trash2, Clock, User } from 'lucide-react';

const Trainings = () => {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTraining, setEditingTraining] = useState(null);
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    timing: { day: '', start: '', end: '' },
    trainerName: '',
    active: true
  });
  const [newTraining, setNewTraining] = useState({
    title: '',
    description: '',
    timing: { day: '', start: '', end: '' },
    trainerName: '',
    active: true
  });

  const daysOfWeek = [
    'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
  ];

  useEffect(() => {
    // Listen to trainings collection
    const trainingsQuery = query(collection(db, 'trainings'), orderBy('title'));
    const trainingsUnsubscribe = onSnapshot(trainingsQuery, (snapshot) => {
      const trainingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTrainings(trainingsData);
      setLoading(false);
    });

    return () => {
      trainingsUnsubscribe();
    };
  }, []);

  const handleAddTraining = async () => {
    if (!newTraining.title.trim()) return;
    
    try {
      await addDoc(collection(db, 'trainings'), {
        title: newTraining.title,
        description: newTraining.description,
        timing: newTraining.timing,
        trainerName: newTraining.trainerName,
        active: newTraining.active,
        createdAt: new Date()
      });
      setNewTraining({
        title: '',
        description: '',
        timing: { day: '', start: '', end: '' },
        trainerName: '',
        active: true
      });
      setShowAddTraining(false);
    } catch (error) {
      console.error('Error adding training:', error);
    }
  };

  const handleUpdateTraining = async (trainingId, updatedData) => {
    try {
      await updateDoc(doc(db, 'trainings', trainingId), updatedData);
      setEditingTraining(null);
      setEditData({
        title: '',
        description: '',
        timing: { day: '', start: '', end: '' },
        trainerName: '',
        active: true
      });
    } catch (error) {
      console.error('Error updating training:', error);
    }
  };

  const handleEditTraining = (training) => {
    setEditingTraining(training.id);
    setEditData({
      title: training.title || '',
      description: training.description || '',
      timing: {
        day: training.timing?.day || '',
        start: training.timing?.start || '',
        end: training.timing?.end || ''
      },
      trainerName: training.trainerName || '',
      active: training.active !== undefined ? training.active : true
    });
  };

  const handleSaveEdit = async () => {
    if (!editData.title.trim()) return;
    
    await handleUpdateTraining(editingTraining, editData);
  };

  const handleCancelEdit = () => {
    setEditingTraining(null);
    setEditData({
      title: '',
      description: '',
      timing: { day: '', start: '', end: '' },
      trainerName: '',
      active: true
    });
  };

  const toggleTrainingActive = async (trainingId, currentStatus) => {
    try {
      await updateDoc(doc(db, 'trainings', trainingId), {
        active: !currentStatus
      });
    } catch (error) {
      console.error('Error toggling training status:', error);
    }
  };

  const handleDeleteTraining = async (trainingId) => {
    if (window.confirm('هل أنت متأكد من حذف هذه الدورة التكوينية؟')) {
      try {
        await deleteDoc(doc(db, 'trainings', trainingId));
      } catch (error) {
        console.error('Error deleting training:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">الدورات التكوينية</h1>
          <p className="text-xl text-gray-600">إدارة الدورات التكوينية والجداول الزمنية</p>
        </div>
        <button
          onClick={() => setShowAddTraining(true)}
          className="btn btn-primary btn-lg"
        >
          <Plus className="ml-2 h-5 w-5" />
          إضافة دورة جديدة
        </button>
      </div>

      {/* Add Training Modal */}
      {showAddTraining && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-primary mb-6">إضافة دورة تكوينية جديدة</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  عنوان الدورة
                </label>
                <input
                  type="text"
                  value={newTraining.title}
                  onChange={(e) => setNewTraining({...newTraining, title: e.target.value})}
                  className="input text-lg"
                  placeholder="مثال: دورة تطوير المواقع"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  وصف الدورة
                </label>
                <textarea
                  value={newTraining.description}
                  onChange={(e) => setNewTraining({...newTraining, description: e.target.value})}
                  className="input text-lg h-24 resize-none"
                  placeholder="وصف مختصر عن الدورة..."
                />
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم المدرب
                </label>
                <input
                  type="text"
                  value={newTraining.trainerName}
                  onChange={(e) => setNewTraining({...newTraining, trainerName: e.target.value})}
                  className="input text-lg"
                  placeholder="اسم المدرب"
                />
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اليوم
                </label>
                <select
                  value={newTraining.timing.day}
                  onChange={(e) => setNewTraining({...newTraining, timing: {...newTraining.timing, day: e.target.value}})}
                  className="input text-lg"
                >
                  <option value="">اختر اليوم</option>
                  {daysOfWeek.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  وقت البداية
                </label>
                <input
                  type="time"
                  value={newTraining.timing.start}
                  onChange={(e) => setNewTraining({...newTraining, timing: {...newTraining.timing, start: e.target.value}})}
                  className="input text-lg"
                />
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  وقت النهاية
                </label>
                <input
                  type="time"
                  value={newTraining.timing.end}
                  onChange={(e) => setNewTraining({...newTraining, timing: {...newTraining.timing, end: e.target.value}})}
                  className="input text-lg"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="flex items-center space-x-3 space-x-reverse">
                  <input
                    type="checkbox"
                    checked={newTraining.active}
                    onChange={(e) => setNewTraining({...newTraining, active: e.target.checked})}
                    className="w-5 h-5 text-primary"
                  />
                  <span className="text-lg font-medium text-gray-700">
                    نشط (يظهر للزوار)
                  </span>
                </label>
                <p className="text-sm text-gray-600 mt-1">
                  إذا كان غير نشط، سيظهر للزوار نموذج طلب مدرب فقط
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-4 space-x-reverse mt-6">
              <button
                onClick={() => setShowAddTraining(false)}
                className="btn btn-outline-primary"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddTraining}
                className="btn btn-primary"
              >
                إضافة الدورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Training Modal */}
      {editingTraining && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-primary mb-6">تعديل الدورة التكوينية</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  عنوان الدورة
                </label>
                <input
                  type="text"
                  value={editData.title}
                  onChange={(e) => setEditData({...editData, title: e.target.value})}
                  className="input text-lg"
                  placeholder="مثال: دورة تطوير المواقع"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  وصف الدورة
                </label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({...editData, description: e.target.value})}
                  className="input text-lg h-24 resize-none"
                  placeholder="وصف مختصر عن الدورة..."
                />
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم المدرب
                </label>
                <input
                  type="text"
                  value={editData.trainerName}
                  onChange={(e) => setEditData({...editData, trainerName: e.target.value})}
                  className="input text-lg"
                  placeholder="اسم المدرب"
                />
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اليوم
                </label>
                <select
                  value={editData.timing.day}
                  onChange={(e) => setEditData({...editData, timing: {...editData.timing, day: e.target.value}})}
                  className="input text-lg"
                >
                  <option value="">اختر اليوم</option>
                  {daysOfWeek.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  وقت البداية
                </label>
                <input
                  type="time"
                  value={editData.timing.start}
                  onChange={(e) => setEditData({...editData, timing: {...editData.timing, start: e.target.value}})}
                  className="input text-lg"
                />
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  وقت النهاية
                </label>
                <input
                  type="time"
                  value={editData.timing.end}
                  onChange={(e) => setEditData({...editData, timing: {...editData.timing, end: e.target.value}})}
                  className="input text-lg"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="flex items-center space-x-3 space-x-reverse">
                  <input
                    type="checkbox"
                    checked={editData.active}
                    onChange={(e) => setEditData({...editData, active: e.target.checked})}
                    className="w-5 h-5 text-primary"
                  />
                  <span className="text-lg font-medium text-gray-700">
                    نشط (يظهر للزوار)
                  </span>
                </label>
                <p className="text-sm text-gray-600 mt-1">
                  إذا كان غير نشط، سيظهر للزوار نموذج طلب مدرب فقط
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-4 space-x-reverse mt-6">
              <button
                onClick={handleCancelEdit}
                className="btn btn-outline-primary"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveEdit}
                className="btn btn-primary"
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trainings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {trainings.map((training) => (
          <div key={training.id} className={`bg-white rounded-xl shadow-md p-6 border ${training.active ? 'border-green-200' : 'border-gray-300'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-primary">{training.title}</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    training.active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {training.active ? 'نشط' : 'غير نشط'}
                  </span>
                </div>
                <p className="text-gray-600 mb-3">{training.description}</p>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <User className="h-5 w-5 text-primary ml-2" />
                    <span className="text-lg">{training.trainerName || 'غير محدد'}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-5 w-5 text-secondary ml-2" />
                    <span className="text-base">
                      {training.timing?.day && training.timing?.start && training.timing?.end
                        ? `${training.timing.day} ${training.timing.start} - ${training.timing.end}`
                        : 'غير محدد'
                      }
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => toggleTrainingActive(training.id, training.active)}
                  className={`btn btn-sm ${training.active ? 'btn-warning' : 'btn-success'}`}
                  title={training.active ? 'إلغاء التفعيل' : 'تفعيل'}
                >
                  {training.active ? 'إلغاء التفعيل' : 'تفعيل'}
                </button>
                <button
                  onClick={() => handleEditTraining(training)}
                  className="btn btn-outline-primary btn-sm"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteTraining(training.id)}
                  className="btn btn-danger btn-sm"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {trainings.length === 0 && (
        <div className="text-center py-12">
          <p className="text-xl text-gray-500">لا توجد دورات تكوينية حالياً</p>
          <button
            onClick={() => setShowAddTraining(true)}
            className="btn btn-primary mt-4"
          >
            إضافة أول دورة
          </button>
        </div>
      )}
    </div>
  );
};

export default Trainings;