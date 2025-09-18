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
import { Plus, Edit, Trash2, Save, X, Languages, Clock, User } from 'lucide-react';

const LanguagesAdmin = () => {
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLanguage, setEditingLanguage] = useState(null);
  const [editingLevel, setEditingLevel] = useState(null);
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [showAddLevel, setShowAddLevel] = useState(null);
  const [newLanguage, setNewLanguage] = useState({ 
    name: '', 
    levels: [] // Array of level objects with name, teacherName, and timing
  });
  const [editLanguageData, setEditLanguageData] = useState({ 
    name: '', 
    levels: [] 
  });
  const [newLevel, setNewLevel] = useState('');
  const [editingLevelData, setEditingLevelData] = useState({ name: '', teacherName: '', timing: [] });
  const defaultLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const daysOfWeek = [
    'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
  ];

  useEffect(() => {
    const q = query(collection(db, 'languages'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const languagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLanguages(languagesData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddLanguage = async () => {
    if (!newLanguage.name.trim()) return;
    
    try {
      await addDoc(collection(db, 'languages'), {
        name: newLanguage.name,
        levels: newLanguage.levels,
        createdAt: new Date()
      });
      setNewLanguage({ 
        name: '', 
        levels: []
      });
      setShowAddLanguage(false);
    } catch (error) {
      console.error('Error adding language:', error);
    }
  };

  const handleEditLanguage = (language) => {
    setEditLanguageData({
      name: language.name,
      levels: language.levels || []
    });
    setEditingLanguage(language.id);
  };

  const handleUpdateLanguage = async (languageId, updatedData) => {
    try {
      await updateDoc(doc(db, 'languages', languageId), updatedData);
      setEditingLanguage(null);
      setEditLanguageData({ name: '', levels: [] });
    } catch (error) {
      console.error('Error updating language:', error);
    }
  };

  const handleDeleteLanguage = async (languageId) => {
    if (window.confirm('هل أنت متأكد من حذف هذه اللغة؟')) {
      try {
        await deleteDoc(doc(db, 'languages', languageId));
      } catch (error) {
        console.error('Error deleting language:', error);
      }
    }
  };

  const handleAddLevel = async (languageId) => {
    if (!newLevel.trim()) return;
    
    const language = languages.find(l => l.id === languageId);
    const updatedLevels = [...(language.levels || []), { 
      name: newLevel, 
      teacherName: '', 
      timing: [] 
    }];
    
    try {
      await updateDoc(doc(db, 'languages', languageId), {
        levels: updatedLevels
      });
      setNewLevel('');
      setShowAddLevel(null);
    } catch (error) {
      console.error('Error adding level:', error);
    }
  };

  const handleUpdateLevel = async (languageId, levelIndex, updatedLevel) => {
    const language = languages.find(l => l.id === languageId);
    const updatedLevels = [...language.levels];
    updatedLevels[levelIndex] = { ...updatedLevels[levelIndex], ...updatedLevel };
    
    try {
      await updateDoc(doc(db, 'languages', languageId), {
        levels: updatedLevels
      });
      setEditingLevel(null);
    } catch (error) {
      console.error('Error updating level:', error);
    }
  };

  const handleDeleteLevel = async (languageId, levelIndex) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المستوى؟')) {
      const language = languages.find(l => l.id === languageId);
      const updatedLevels = language.levels.filter((_, index) => index !== levelIndex);
      
      try {
        await updateDoc(doc(db, 'languages', languageId), {
          levels: updatedLevels
        });
      } catch (error) {
        console.error('Error deleting level:', error);
      }
    }
  };

  const resetToDefaultLevels = async (languageId) => {
    if (window.confirm('هل تريد إعادة تعيين المستويات إلى القيم الافتراضية (A1-C2)؟')) {
      const defaultLevelObjects = defaultLevels.map(level => ({
        name: level,
        teacherName: '',
        timing: []
      }));
      
      try {
        await updateDoc(doc(db, 'languages', languageId), {
          levels: defaultLevelObjects
        });
      } catch (error) {
        console.error('Error resetting levels:', error);
      }
    }
  };

  // Functions for managing levels in new language form
  const addNewLanguageLevel = () => {
    setNewLanguage({
      ...newLanguage,
      levels: [...newLanguage.levels, { name: '', teacherName: '', timing: [] }]
    });
  };

  const removeNewLanguageLevel = (index) => {
    const updatedLevels = newLanguage.levels.filter((_, i) => i !== index);
    setNewLanguage({
      ...newLanguage,
      levels: updatedLevels
    });
  };

  const updateNewLanguageLevel = (index, field, value) => {
    const updatedLevels = [...newLanguage.levels];
    updatedLevels[index][field] = value;
    setNewLanguage({
      ...newLanguage,
      levels: updatedLevels
    });
  };

  const handleEditLevel = (language, levelIndex) => {
  console.log('Edit level clicked:', language, levelIndex);
  const level = language.levels[levelIndex];
  setEditingLevelData({
    name: level.name || '',
    teacherName: level.teacherName || '',
    timing: level.timing || []
  });
  setEditingLevel(`${language.id}-${levelIndex}`);
  };

  const addEditingLevelTiming = () => {
  setEditingLevelData({
    ...editingLevelData,
    timing: [...editingLevelData.timing, { day: '', start: '', end: '' }]
  });
  };

  const removeEditingLevelTiming = (timingIndex) => {
    const updatedTiming = editingLevelData.timing.filter((_, i) => i !== timingIndex);
    setEditingLevelData({
      ...editingLevelData,
      timing: updatedTiming
    });
  };

  const updateEditingLevelTiming = (timingIndex, field, value) => {
    const updatedTiming = [...editingLevelData.timing];
    updatedTiming[timingIndex][field] = value;
    setEditingLevelData({
      ...editingLevelData,
      timing: updatedTiming
    });
  };
  // Functions for managing levels in edit language form
  const addEditLanguageLevel = () => {
    setEditLanguageData({
      ...editLanguageData,
      levels: [...editLanguageData.levels, { name: '', teacherName: '', timing: [] }]
    });
  };

  const removeEditLanguageLevel = (index) => {
    const updatedLevels = editLanguageData.levels.filter((_, i) => i !== index);
    setEditLanguageData({
      ...editLanguageData,
      levels: updatedLevels
    });
  };

  const updateEditLanguageLevel = (index, field, value) => {
    const updatedLevels = [...editLanguageData.levels];
    updatedLevels[index][field] = value;
    setEditLanguageData({
      ...editLanguageData,
      levels: updatedLevels
    });
  };

  // Functions for managing timing within levels
  const addNewLanguageLevelTiming = (levelIndex) => {
    const updatedLevels = [...newLanguage.levels];
    updatedLevels[levelIndex].timing.push({ day: '', start: '', end: '' });
    setNewLanguage({
      ...newLanguage,
      levels: updatedLevels
    });
  };

  const removeNewLanguageLevelTiming = (levelIndex, timingIndex) => {
    const updatedLevels = [...newLanguage.levels];
    updatedLevels[levelIndex].timing = updatedLevels[levelIndex].timing.filter((_, i) => i !== timingIndex);
    setNewLanguage({
      ...newLanguage,
      levels: updatedLevels
    });
  };

  const updateNewLanguageLevelTiming = (levelIndex, timingIndex, field, value) => {
    const updatedLevels = [...newLanguage.levels];
    updatedLevels[levelIndex].timing[timingIndex][field] = value;
    setNewLanguage({
      ...newLanguage,
      levels: updatedLevels
    });
  };

  // Functions for managing timing within edit levels
  const addEditLanguageLevelTiming = (levelIndex) => {
    const updatedLevels = [...editLanguageData.levels];
    updatedLevels[levelIndex].timing.push({ day: '', start: '', end: '' });
    setEditLanguageData({
      ...editLanguageData,
      levels: updatedLevels
    });
  };

  const removeEditLanguageLevelTiming = (levelIndex, timingIndex) => {
    const updatedLevels = [...editLanguageData.levels];
    updatedLevels[levelIndex].timing = updatedLevels[levelIndex].timing.filter((_, i) => i !== timingIndex);
    setEditLanguageData({
      ...editLanguageData,
      levels: updatedLevels
    });
  };

  const updateEditLanguageLevelTiming = (levelIndex, timingIndex, field, value) => {
    const updatedLevels = [...editLanguageData.levels];
    updatedLevels[levelIndex].timing[timingIndex][field] = value;
    setEditLanguageData({
      ...editLanguageData,
      levels: updatedLevels
    });
  };

  const addDefaultLevels = () => {
    const defaultLevelObjects = defaultLevels.map(level => ({
      name: level,
      teacherName: '',
      timing: []
    }));
    setNewLanguage({
      ...newLanguage,
      levels: defaultLevelObjects
    });
  };

  const addDefaultLevelsToEdit = () => {
    const defaultLevelObjects = defaultLevels.map(level => ({
      name: level,
      teacherName: '',
      timing: []
    }));
    setEditLanguageData({
      ...editLanguageData,
      levels: defaultLevelObjects
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-blue-600 mb-2">اللغات</h1>
          <p className="text-xl text-gray-600">إدارة اللغات ومستوياتها</p>
        </div>
        <button
          onClick={() => setShowAddLanguage(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center transition-colors"
        >
          <Plus className="ml-2 h-5 w-5" />
          إضافة لغة جديدة
        </button>
      </div>

      {/* Add Language Modal */}
      {showAddLanguage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-blue-600 mb-4">إضافة لغة جديدة</h3>
            
            <div className="space-y-6">
              {/* Language Name */}
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم اللغة
                </label>
                <input
                  type="text"
                  value={newLanguage.name}
                  onChange={(e) => setNewLanguage({...newLanguage, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="مثال: الإنجليزية"
                />
              </div>

              {/* Levels Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-lg font-medium text-gray-700">
                    المستويات
                  </label>
                  <div className="flex space-x-2 space-x-reverse">
                    <button
                      type="button"
                      onClick={addDefaultLevels}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      إضافة المستويات الافتراضية (A1-C2)
                    </button>
                    <button
                      type="button"
                      onClick={addNewLanguageLevel}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center"
                    >
                      <Plus className="ml-1 h-4 w-4" />
                      إضافة مستوى
                    </button>
                  </div>
                </div>

                {/* Levels List */}
                <div className="space-y-4">
                  {newLanguage.levels.map((level, levelIndex) => (
                    <div key={levelIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-medium text-gray-800">المستوى {levelIndex + 1}</h4>
                        <button
                          type="button"
                          onClick={() => removeNewLanguageLevel(levelIndex)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            اسم المستوى
                          </label>
                          <input
                            type="text"
                            value={level.name}
                            onChange={(e) => updateNewLanguageLevel(levelIndex, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="مثال: A1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            اسم المدرس
                          </label>
                          <input
                            type="text"
                            value={level.teacherName}
                            onChange={(e) => updateNewLanguageLevel(levelIndex, 'teacherName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="اسم المدرس"
                          />
                        </div>
                      </div>

                      {/* Timing Section for this Level */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            أوقات الدروس
                          </label>
                          <button
                            type="button"
                            onClick={() => addNewLanguageLevelTiming(levelIndex)}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs flex items-center"
                          >
                            <Plus className="ml-1 h-3 w-3" />
                            إضافة وقت
                          </button>
                        </div>

                        <div className="space-y-2">
                          {level.timing.map((timing, timingIndex) => (
                            <div key={timingIndex} className="flex items-center space-x-2 space-x-reverse bg-white p-3 rounded border">
                              <select
                                value={timing.day}
                                onChange={(e) => updateNewLanguageLevelTiming(levelIndex, timingIndex, 'day', e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">اختر اليوم</option>
                                {daysOfWeek.map(day => (
                                  <option key={day} value={day}>{day}</option>
                                ))}
                              </select>
                              <input
                                type="time"
                                value={timing.start}
                                onChange={(e) => updateNewLanguageLevelTiming(levelIndex, timingIndex, 'start', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <span className="text-gray-500 text-sm">-</span>
                              <input
                                type="time"
                                value={timing.end}
                                onChange={(e) => updateNewLanguageLevelTiming(levelIndex, timingIndex, 'end', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => removeNewLanguageLevelTiming(levelIndex, timingIndex)}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}

                          {level.timing.length === 0 && (
                            <div className="text-center py-4 bg-white rounded border border-dashed border-gray-300">
                              <p className="text-gray-500 text-sm mb-2">لا توجد أوقات محددة</p>
                              <button
                                type="button"
                                onClick={() => addNewLanguageLevelTiming(levelIndex)}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs flex items-center mx-auto"
                              >
                                <Plus className="ml-1 h-3 w-3" />
                                إضافة وقت درس
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {newLanguage.levels.length === 0 && (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <p className="text-gray-500 mb-4">لم يتم إضافة أي مستويات بعد</p>
                      <div className="flex justify-center space-x-2 space-x-reverse">
                        <button
                          type="button"
                          onClick={addDefaultLevels}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                        >
                          إضافة المستويات الافتراضية
                        </button>
                        <button
                          type="button"
                          onClick={addNewLanguageLevel}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
                        >
                          <Plus className="ml-2 h-4 w-4" />
                          إضافة مستوى مخصص
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 space-x-reverse mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowAddLanguage(false)}
                className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddLanguage}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Language Modal */}
      {editingLanguage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-blue-600 mb-4">تعديل اللغة</h3>
            
            <div className="space-y-6">
              {/* Language Name */}
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم اللغة
                </label>
                <input
                  type="text"
                  value={editLanguageData.name}
                  onChange={(e) => setEditLanguageData({...editLanguageData, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="مثال: الإنجليزية"
                />
              </div>

              {/* Levels Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-lg font-medium text-gray-700">
                    المستويات
                  </label>
                  <div className="flex space-x-2 space-x-reverse">
                    <button
                      type="button"
                      onClick={addDefaultLevelsToEdit}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      إضافة المستويات الافتراضية (A1-C2)
                    </button>
                    <button
                      type="button"
                      onClick={addEditLanguageLevel}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center"
                    >
                      <Plus className="ml-1 h-4 w-4" />
                      إضافة مستوى
                    </button>
                  </div>
                </div>

                {/* Levels List */}
                <div className="space-y-4">
                  {editLanguageData.levels.map((level, levelIndex) => (
                    <div key={levelIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-medium text-gray-800">المستوى {levelIndex + 1}</h4>
                        <button
                          type="button"
                          onClick={() => removeEditLanguageLevel(levelIndex)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            اسم المستوى
                          </label>
                          <input
                            type="text"
                            value={level.name}
                            onChange={(e) => updateEditLanguageLevel(levelIndex, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="مثال: A1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            اسم المدرس
                          </label>
                          <input
                            type="text"
                            value={level.teacherName}
                            onChange={(e) => updateEditLanguageLevel(levelIndex, 'teacherName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="اسم المدرس"
                          />
                        </div>
                      </div>

                      {/* Timing Section for this Level */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            أوقات الدروس
                          </label>
                          <button
                            type="button"
                            onClick={() => addEditLanguageLevelTiming(levelIndex)}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs flex items-center"
                          >
                            <Plus className="ml-1 h-3 w-3" />
                            إضافة وقت
                          </button>
                        </div>

                        <div className="space-y-2">
                          {level.timing && level.timing.map((timing, timingIndex) => (
                            <div key={timingIndex} className="flex items-center space-x-2 space-x-reverse bg-white p-3 rounded border">
                              <select
                                value={timing.day}
                                onChange={(e) => updateEditLanguageLevelTiming(levelIndex, timingIndex, 'day', e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">اختر اليوم</option>
                                {daysOfWeek.map(day => (
                                  <option key={day} value={day}>{day}</option>
                                ))}
                              </select>
                              <input
                                type="time"
                                value={timing.start}
                                onChange={(e) => updateEditLanguageLevelTiming(levelIndex, timingIndex, 'start', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <span className="text-gray-500 text-sm">-</span>
                              <input
                                type="time"
                                value={timing.end}
                                onChange={(e) => updateEditLanguageLevelTiming(levelIndex, timingIndex, 'end', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => removeEditLanguageLevelTiming(levelIndex, timingIndex)}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}

                          {(!level.timing || level.timing.length === 0) && (
                            <div className="text-center py-4 bg-white rounded border border-dashed border-gray-300">
                              <p className="text-gray-500 text-sm mb-2">لا توجد أوقات محددة</p>
                              <button
                                type="button"
                                onClick={() => addEditLanguageLevelTiming(levelIndex)}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs flex items-center mx-auto"
                              >
                                <Plus className="ml-1 h-3 w-3" />
                                إضافة وقت درس
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {editLanguageData.levels.length === 0 && (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <p className="text-gray-500 mb-4">لم يتم إضافة أي مستويات بعد</p>
                      <div className="flex justify-center space-x-2 space-x-reverse">
                        <button
                          type="button"
                          onClick={addDefaultLevelsToEdit}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                        >
                          إضافة المستويات الافتراضية
                        </button>
                        <button
                          type="button"
                          onClick={addEditLanguageLevel}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
                        >
                          <Plus className="ml-2 h-4 w-4" />
                          إضافة مستوى مخصص
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 space-x-reverse mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setEditingLanguage(null);
                  setEditLanguageData({ name: '', levels: [] });
                }}
                className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleUpdateLanguage(editingLanguage, editLanguageData)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Individual Level Modal */}
      {editingLevel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-blue-600 mb-4">تعديل المستوى</h3>
            
            <div className="space-y-6">
              {/* Level Name */}
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم المستوى
                </label>
                <input
                  type="text"
                  value={editingLevelData.name}
                  onChange={(e) => setEditingLevelData({...editingLevelData, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="مثال: A1"
                />
              </div>

              {/* Teacher Name */}
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  اسم المدرس
                </label>
                <input
                  type="text"
                  value={editingLevelData.teacherName}
                  onChange={(e) => setEditingLevelData({...editingLevelData, teacherName: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="اسم المدرس"
                />
              </div>

              {/* Timing Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-lg font-medium text-gray-700">
                    أوقات الدروس
                  </label>
                  <button
                    type="button"
                    onClick={addEditingLevelTiming}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center"
                  >
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة وقت
                  </button>
                </div>

                <div className="space-y-3">
                  {editingLevelData.timing.map((timing, timingIndex) => (
                    <div key={timingIndex} className="flex items-center space-x-2 space-x-reverse bg-gray-50 p-4 rounded border">
                      <select
                        value={timing.day}
                        onChange={(e) => updateEditingLevelTiming(timingIndex, 'day', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">اختر اليوم</option>
                        {daysOfWeek.map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={timing.start}
                        onChange={(e) => updateEditingLevelTiming(timingIndex, 'start', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-gray-500 text-sm">-</span>
                      <input
                        type="time"
                        value={timing.end}
                        onChange={(e) => updateEditingLevelTiming(timingIndex, 'end', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeEditingLevelTiming(timingIndex)}
                        className="text-red-500 hover:text-red-700 p-2"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {editingLevelData.timing.length === 0 && (
                    <div className="text-center py-6 bg-gray-50 rounded border border-dashed border-gray-300">
                      <p className="text-gray-500 text-sm mb-3">لا توجد أوقات محددة</p>
                      <button
                        type="button"
                        onClick={addEditingLevelTiming}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center mx-auto"
                      >
                        <Plus className="ml-1 h-4 w-4" />
                        إضافة وقت درس
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 space-x-reverse mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setEditingLevel(null);
                  setEditingLevelData({ name: '', teacherName: '', timing: [] });
                }}
                className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  const [languageId, levelIndex] = editingLevel.split('-');
                  handleUpdateLevel(languageId, parseInt(levelIndex), editingLevelData);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Languages Grid */}
      <div className="grid grid-cols-1 gap-8">
        {languages.map((language) => (
          <div key={language.id} className="bg-white rounded-xl shadow-md border border-gray-100">
            {/* Language Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-3xl font-bold text-blue-600">{language.name}</h2>
              <div className="flex space-x-2 space-x-reverse">
                <button
                  onClick={() => handleEditLanguage(language)}
                  className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center"
                >
                  <Edit className="h-4 w-4 ml-2" />
                  تعديل اللغة
                </button>
                <button
                  onClick={() => handleDeleteLanguage(language.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center"
                >
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف اللغة
                </button>
              </div>
            </div>

            {/* Levels Grid */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-medium text-gray-700">المستويات:</h3>
                <div className="flex space-x-2 space-x-reverse">
                  <button
                    onClick={() => resetToDefaultLevels(language.id)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    إعادة تعيين للافتراضية
                  </button>
                  <button
                    onClick={() => setShowAddLevel(language.id)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm flex items-center"
                  >
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة مستوى
                  </button>
                </div>
              </div>

              {/* Levels Display */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(language.levels || []).map((level, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-lg font-bold text-blue-600">{level.name || `مستوى ${index + 1}`}</h4>
                      <div className="flex space-x-1 space-x-reverse">
                        <button
                          onClick={() => handleEditLevel(language, index)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteLevel(language.id, index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Teacher Info */}
                    <div className="flex items-center mb-3">
                      <User className="h-4 w-4 text-blue-600 ml-2" />
                      <span className="text-base font-medium">
                        {level.teacherName || 'غير محدد'}
                      </span>
                    </div>

                    {/* Timing Info */}
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 text-gray-600 ml-2" />
                        <span className="text-sm font-medium">أوقات الدروس:</span>
                      </div>
                      <div className="mr-6 space-y-1">
                        {level.timing && level.timing.length > 0 ? (
                          level.timing.map((timing, timingIndex) => (
                            <div key={timingIndex} className="text-sm text-gray-600">
                              {timing.day && timing.start && timing.end ? (
                                `${timing.day} ${timing.start} - ${timing.end}`
                              ) : (
                                'غير مكتمل'
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500">غير محدد</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Level Input */}
              {showAddLevel === language.id && (
                <div className="flex items-center space-x-2 space-x-reverse mt-4 p-4 bg-gray-50 rounded-lg">
                  <input
                    type="text"
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="اسم المستوى (مثال: A1)"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddLevel(language.id);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleAddLevel(language.id)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setShowAddLevel(null);
                      setNewLevel('');
                    }}
                    className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Level Count */}
              <div className="text-sm text-gray-500 text-center pt-4 mt-4 border-t border-gray-200">
                إجمالي المستويات: {(language.levels || []).length}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {languages.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Languages className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">لا توجد لغات</h3>
          <p className="text-gray-600 mb-6">ابدأ بإضافة لغة جديدة لإدارة مستوياتها</p>
          <button
            onClick={() => setShowAddLanguage(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center mx-auto"
          >
            <Plus className="ml-2 h-5 w-5" />
            إضافة لغة جديدة
          </button>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-2">معلومات حول المستويات</h3>
        <div className="text-blue-800 space-y-2">
          <p><strong>A1-A2:</strong> مستوى مبتدئ - أساسيات اللغة</p>
          <p><strong>B1-B2:</strong> مستوى متوسط - استخدام اللغة في المواقف اليومية</p>
          <p><strong>C1-C2:</strong> مستوى متقدم - إتقان اللغة والطلاقة</p>
          <p><strong>ملاحظة:</strong> كل مستوى يمكن أن يكون له مدرس مختلف وأوقات دروس متعددة</p>
        </div>
      </div>
    </div>
  );
};

export default LanguagesAdmin;