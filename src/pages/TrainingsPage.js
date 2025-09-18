import React, { useState, useEffect } from 'react';
import emailjs from 'emailjs-com';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { GraduationCap, User, Clock, MessageSquare, Send, Mail } from 'lucide-react';
import UnifiedRegistrationForm from '../components/UnifiedRegistrationForm'; // Add this import

const TrainingsPage = () => {
    const [activeTrainings, setActiveTrainings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        course: '',
        message: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState('');
    
    // Add the missing state variables
    const [showRegistrationForm, setShowRegistrationForm] = useState(false);
    const [selectedTraining, setSelectedTraining] = useState(null);

    useEffect(() => {
        // Listen to active trainings
        const trainingsQuery = query(
            collection(db, 'trainings'),
            where('active', '==', true)
        );
        const unsubscribe = onSnapshot(trainingsQuery, (snapshot) => {
            const trainingsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setActiveTrainings(trainingsData);
            setLoading(false);
            
            // If no active trainings, show the trainer request form
            if (trainingsData.length === 0) {
                setShowForm(true);
            }
        });

        return () => unsubscribe();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Fix the handleRegisterForTraining function
    const handleRegisterForTraining = (training) => {
        setSelectedTraining(training);
        setShowRegistrationForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitStatus('');

        try {
            // Save trainer request to Firestore with the correct structure
            await addDoc(collection(db, 'trainingRequests'), {
                name: formData.name,
                phone: formData.phone,
                email: formData.email,
                course: formData.course || selectedTraining?.title,
                message: formData.message || '',
                trainingId: selectedTraining?.id,
                timing: selectedTraining?.timing
                ? {
                    day: selectedTraining.timing.day || null,
                    start: selectedTraining.timing.start?.toDate().toISOString() || null,
                    end: selectedTraining.timing.end?.toDate().toISOString() || null,
                    }
                : null,
                createdAt: serverTimestamp(),
                status: 'pending',
                processed: false
            });
            
            setSubmitStatus('success');
            setFormData({
                name: '',
                email: '',
                phone: '',
                course: '',
                message: ''
            });
        } catch (error) {
            console.error('Error submitting training request:', error);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
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
        <div className="trainings-page py-12 px-6 md:px-12" dir="rtl">
            <div className="container mx-auto max-w-6xl">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">الدورات التكوينية</h1>
                    <p className="text-xl text-gray-600">
                        {activeTrainings.length > 0 
                            ? 'اكتشف دوراتنا التكوينية المتاحة حالياً'
                            : 'لا توجد دورات متاحة حالياً - يمكنك طلب مدرب'
                        }
                    </p>
                </div>

                {/* Active Trainings or Request Form */}
                {activeTrainings.length > 0 ? (
                    /* Active Trainings Grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                        {activeTrainings.map((training) => (
                            <div key={training.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow">
                                <div className="flex items-start justify-between mb-4">
                                    <GraduationCap className="h-8 w-8 text-primary flex-shrink-0" />
                                    <span className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full">
                                        متاح
                                    </span>
                                </div>
                                
                                <h3 className="text-xl font-bold text-primary mb-3">{training.title}</h3>
                                <p className="text-gray-600 mb-4 line-clamp-3">{training.description}</p>
                                
                                <div className="space-y-2 mb-6">
                                    <div className="flex items-center">
                                        <User className="h-4 w-4 text-secondary ml-2" />
                                        <span className="text-sm">{training.trainerName || 'غير محدد'}</span>
                                    </div>
                                    <div className="flex items-center">
                                        <Clock className="h-4 w-4 text-accent ml-2" />
                                        <span className="text-sm">
                                            {training.timing?.day && training.timing?.start && training.timing?.end
                                                ? `${training.timing.day} ${training.timing.start} - ${training.timing.end}`
                                                : 'غير محدد'
                                            }
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Fixed button */}
                                <button
                                    onClick={() => handleRegisterForTraining(training)}
                                    className="w-full bg-primary hover:bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                                >
                                    التسجيل في الدورة
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* Trainer Request Form */
                    <div className="max-w-2xl mx-auto">
                        <div className="bg-white rounded-xl shadow-lg p-8">
                            <div className="text-center mb-8">
                                <MessageSquare className="h-16 w-16 text-primary mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-primary mb-2">طلب مدرب</h2>
                                <p className="text-gray-600">
                                    لا توجد دورات متاحة حالياً. يمكنك طلب مدرب في المجال الذي تريده وسنتواصل معك
                                </p>
                            </div>

                            {submitStatus === 'success' && (
                                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
                                    ✅ تم إرسال طلبك بنجاح! سنتواصل معك قريباً.
                                </div>
                            )}

                            {submitStatus === 'error' && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                                    ❌ حدث خطأ في إرسال الطلب. يرجى المحاولة مرة أخرى.
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label htmlFor="name" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <User className="h-4 w-4 ml-2" />
                                        الاسم الكامل *
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg text-right"
                                        placeholder="أدخل اسمك الكامل"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="email" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <Mail className="h-4 w-4 ml-2" />
                                        البريد الإلكتروني *
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg"
                                        placeholder="example@email.com"
                                        dir="ltr"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="phone" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <MessageSquare className="h-4 w-4 ml-2" />
                                        رقم الهاتف *
                                    </label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg text-right"
                                        placeholder="0555123456"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="course" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <GraduationCap className="h-4 w-4 ml-2" />
                                        المجال المطلوب *
                                    </label>
                                    <input
                                        type="text"
                                        id="course"
                                        name="course"
                                        value={formData.course}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg text-right"
                                        placeholder="مثال: تطوير المواقع، التصميم الجرافيكي، التسويق الرقمي..."
                                    />
                                </div>

                                <div>
                                    <label htmlFor="message" className="block text-lg font-medium text-gray-700 mb-2">
                                        رسالة إضافية (اختياري)
                                    </label>
                                    <textarea
                                        id="message"
                                        name="message"
                                        value={formData.message}
                                        onChange={handleInputChange}
                                        rows="4"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg resize-vertical text-right"
                                        placeholder="أضف أي تفاصيل إضافية حول ما تريد تعلمه..."
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-primary hover:bg-primary-600 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-300 text-lg flex items-center justify-center"
                                >
                                    {isSubmitting ? (
                                        'جاري الإرسال...'
                                    ) : (
                                        <>
                                            <Send className="h-5 w-5 ml-2" />
                                            إرسال الطلب
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            {/* Registration Modal */}
            {showRegistrationForm && selectedTraining && (
                <UnifiedRegistrationForm
                    courseType="training"
                    courseData={selectedTraining}
                    onClose={() => setShowRegistrationForm(false)}
                    onSuccess={() => setShowRegistrationForm(false)}
                />
            )}
        </div>
    );
};

export default TrainingsPage;