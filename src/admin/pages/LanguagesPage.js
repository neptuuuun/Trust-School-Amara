import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Breadcrumb from '../components/Breadcrumb';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DAYS_OF_WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const LanguagesPage = () => {
  const { selectedBranchId } = useBranch();
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedLevels, setExpandedLevels] = useState({});
  const [form, setForm] = useState({
    languageName: '',
    levels: CEFR_LEVELS.reduce((acc, level) => {
      acc[level] = {
        price: '',
        teacher: '',
        days: []
      };
      return acc;
    }, {})
  });

  useEffect(() => {
    if (!selectedBranchId) {
      setLanguages([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'branches', selectedBranchId, 'languages'),
      (snapshot) => {
        const langs = snapshot.docs.map(doc => {
          const data = doc.data();
          // Normalize the structure - handle both old and new formats
          const normalizedLevels = {};
          CEFR_LEVELS.forEach(level => {
            const levelData = data.levels?.[level];
            if (levelData && typeof levelData === 'object' && !Array.isArray(levelData)) {
              // New structure: { price, teacher, days: [...] }
              normalizedLevels[level] = {
                price: levelData.price || 0,
                teacher: levelData.teacher || '',
                days: Array.isArray(levelData.days) ? levelData.days : []
              };
            } else if (Array.isArray(levelData)) {
              // Old structure: array of schedules with teacher per day
              normalizedLevels[level] = {
                price: 0,
                teacher: '',
                days: levelData.map(sched => ({
                  dayOfWeek: sched.dayOfWeek || sched.day || '',
                  startTime: sched.startTime || '',
                  endTime: sched.endTime || ''
                }))
              };
            } else {
              // Empty level
              normalizedLevels[level] = {
                price: 0,
                teacher: '',
                days: []
              };
            }
          });
          
          return {
            id: doc.id,
            languageName: data.languageName || data.name || '',
            levels: normalizedLevels,
            ...data
          };
        });
        setLanguages(langs);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching languages:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedBranchId]);

  const toggleLevel = (langId, level) => {
    setExpandedLevels(prev => ({
      ...prev,
      [`${langId}-${level}`]: !prev[`${langId}-${level}`]
    }));
  };

  const updateLevelField = (level, field, value) => {
    setForm(prev => ({
      ...prev,
      levels: {
        ...prev.levels,
        [level]: {
          ...prev.levels[level],
          [field]: value
        }
      }
    }));
  };

  const addDayToLevel = (level) => {
    setForm(prev => ({
      ...prev,
      levels: {
        ...prev.levels,
        [level]: {
          ...prev.levels[level],
          days: [...prev.levels[level].days, { dayOfWeek: '', startTime: '', endTime: '' }]
        }
      }
    }));
  };

  const removeDayFromLevel = (level, index) => {
    setForm(prev => ({
      ...prev,
      levels: {
        ...prev.levels,
        [level]: {
          ...prev.levels[level],
          days: prev.levels[level].days.filter((_, i) => i !== index)
        }
      }
    }));
  };

  const updateDayInLevel = (level, index, field, value) => {
    setForm(prev => ({
      ...prev,
      levels: {
        ...prev.levels,
        [level]: {
          ...prev.levels[level],
          days: prev.levels[level].days.map((day, i) => 
            i === index ? { ...day, [field]: value } : day
          )
        }
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBranchId || !form.languageName.trim()) return;

    // Clean and structure the levels data
    const cleanedLevels = {};
    Object.keys(form.levels).forEach(level => {
      const levelData = form.levels[level];
      // Only include levels that have at least price or teacher or days
      if (levelData.price || levelData.teacher || (Array.isArray(levelData.days) && levelData.days.length > 0)) {
        cleanedLevels[level] = {
          price: Number(levelData.price) || 0,
          teacher: levelData.teacher || '',
          days: Array.isArray(levelData.days)
            ? levelData.days.filter(day => day.dayOfWeek && day.startTime && day.endTime)
            : []
        };
      }
    });

    try {
      if (editingId) {
        await updateDoc(doc(db, 'branches', selectedBranchId, 'languages', editingId), {
          languageName: form.languageName,
          levels: cleanedLevels,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'branches', selectedBranchId, 'languages'), {
          languageName: form.languageName,
          levels: cleanedLevels,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      resetForm();
    } catch (error) {
      console.error('Error saving language:', error);
      alert('حدث خطأ أثناء حفظ اللغة');
    }
  };

  const handleEdit = (language) => {
    const normalizedLevels = {};
    CEFR_LEVELS.forEach(level => {
      const levelData = language.levels?.[level];
      if (levelData && typeof levelData === 'object' && !Array.isArray(levelData)) {
        // New structure
        normalizedLevels[level] = {
          price: levelData.price || '',
          teacher: levelData.teacher || '',
          days: Array.isArray(levelData.days) ? levelData.days : []
        };
      } else {
        // Empty level
        normalizedLevels[level] = {
          price: '',
          teacher: '',
          days: []
        };
      }
    });

    setForm({
      languageName: language.languageName || language.name || '',
      levels: normalizedLevels
    });
    setEditingId(language.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه اللغة؟')) return;
    if (!selectedBranchId) return;

    try {
      await deleteDoc(doc(db, 'branches', selectedBranchId, 'languages', id));
    } catch (error) {
      console.error('Error deleting language:', error);
      alert('حدث خطأ أثناء حذف اللغة');
    }
  };

  const resetForm = () => {
    setForm({
      languageName: '',
      levels: CEFR_LEVELS.reduce((acc, level) => {
        acc[level] = {
          price: '',
          teacher: '',
          days: []
        };
        return acc;
      }, {})
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
        <Breadcrumb trail={["إدارة الدورات اللغوية"]} />
        <h1 className="text-3xl font-bold text-primary mb-2">إدارة الدورات اللغوية</h1>
        <p className="text-gray-600">إضافة وتعديل وحذف الدورات اللغوية مع مستوياتها وجداولها</p>
      </div>

      {!showAddForm ? (
        <Button onClick={() => setShowAddForm(true)} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          إضافة لغة جديدة
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold leading-none tracking-tight">{editingId ? 'تعديل اللغة' : 'إضافة لغة جديدة'}</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اسم اللغة</label>
                <input
                  type="text"
                  className="input w-full"
                  value={form.languageName}
                  onChange={(e) => setForm(prev => ({ ...prev, languageName: e.target.value }))}
                  placeholder="مثال: الإنجليزية، الفرنسية..."
                  required
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-primary">المستويات والجداول</h3>
                {CEFR_LEVELS.map(level => {
                  const levelData = form.levels[level] || { price: '', teacher: '', days: [] };
                  const days = Array.isArray(levelData.days) ? levelData.days : [];
                  
                  return (
                    <Card key={level} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold leading-none tracking-tight">المستوى {level}</h3>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Price and Teacher for this level */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">السعر (دج)</label>
                            <input
                              type="number"
                              className="input w-full"
                              value={levelData.price || ''}
                              onChange={(e) => updateLevelField(level, 'price', e.target.value)}
                              placeholder="السعر"
                              min="0"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">المدرس</label>
                            <input
                              type="text"
                              className="input w-full"
                              value={levelData.teacher || ''}
                              onChange={(e) => updateLevelField(level, 'teacher', e.target.value)}
                              placeholder="اسم المدرس"
                            />
                          </div>
                        </div>

                        {/* Days schedule for this level */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-gray-700">الجداول الزمنية</h4>
                          <AnimatePresence>
                            {days.map((day, index) => (
                              <motion.div
                                key={index}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg border"
                              >
                                <select
                                  className="input"
                                  value={day.dayOfWeek || ''}
                                  onChange={(e) => updateDayInLevel(level, index, 'dayOfWeek', e.target.value)}
                                  required
                                >
                                  <option value="">اختر اليوم</option>
                                  {DAYS_OF_WEEK.map(dayName => (
                                    <option key={dayName} value={dayName}>{dayName}</option>
                                  ))}
                                </select>
                                <input
                                  type="time"
                                  className="input"
                                  value={day.startTime || ''}
                                  onChange={(e) => updateDayInLevel(level, index, 'startTime', e.target.value)}
                                  required
                                />
                                <input
                                  type="time"
                                  className="input"
                                  value={day.endTime || ''}
                                  onChange={(e) => updateDayInLevel(level, index, 'endTime', e.target.value)}
                                  required
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => removeDayFromLevel(level, index)}
                                  className="flex items-center gap-1"
                                >
                                  <X className="w-4 h-4" />
                                  حذف
                                </Button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => addDayToLevel(level)}
                            className="w-full flex items-center justify-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            إضافة يوم آخر
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  {editingId ? 'حفظ التعديلات' : 'إضافة اللغة'}
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
        {!languages || languages.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              لا توجد لغات مضافة بعد
            </CardContent>
          </Card>
        ) : (
          languages.map(language => (
            <motion.div
              key={language.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold leading-none tracking-tight">
                        {language.languageName || language.name || 'بدون اسم'}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(language)}
                        className="flex items-center gap-1"
                      >
                        <Edit2 className="w-4 h-4" />
                        تعديل
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(language.id)}
                        className="flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        حذف
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {CEFR_LEVELS.map(level => {
                      const levelData = language.levels?.[level];
                      if (!levelData || (typeof levelData === 'object' && !Array.isArray(levelData))) {
                        // New structure: { price, teacher, days: [...] }
                        const price = levelData?.price || 0;
                        const teacher = levelData?.teacher || '';
                        const days = Array.isArray(levelData?.days) ? levelData.days : [];
                        const isExpanded = expandedLevels[`${language.id}-${level}`];
                        
                        // Only show levels that have data
                        if (!price && !teacher && days.length === 0) {
                          return null;
                        }

                        return (
                          <div key={level} className="border rounded-lg">
                            <button
                              type="button"
                              onClick={() => toggleLevel(language.id, level)}
                              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-semibold">المستوى {level}</span>
                                {price > 0 && (
                                  <Badge variant="secondary">{price} دج</Badge>
                                )}
                                {teacher && (
                                  <span className="text-sm text-gray-600">المدرس: {teacher}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {days.length > 0 && (
                                  <Badge variant="info">{days.length} جدول</Badge>
                                )}
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5" />
                                ) : (
                                  <ChevronDown className="w-5 h-5" />
                                )}
                              </div>
                            </button>
                            <AnimatePresence>
                              {isExpanded && days.length > 0 && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-3 space-y-2 border-t bg-gray-50">
                                    {days.map((day, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-2 p-2 bg-white rounded border"
                                      >
                                        <Badge variant="outline">{day.dayOfWeek || '—'}</Badge>
                                        <span className="text-sm text-gray-600">
                                          {day.startTime || '—'} - {day.endTime || '—'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      }
                      return null;
                    })}
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

export default LanguagesPage;
