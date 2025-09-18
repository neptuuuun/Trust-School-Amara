import React, { useState, useEffect } from 'react';
import ServiceCard from '../components/ServiceCard';
import CourseRegistrationForm from '../components/CourseRegistrationForm';
import { Book, Globe, GraduationCap, Users, BarChart3, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sendRegistrationEmail, sendAdminNotification, initiateAlgerianPayment } from '../services/emailService';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
// Import video files
import schoolIntroVideo from '../assets/videos/school-intro.mp4';
import studentFeedback1Video from '../assets/videos/student-feedback.mp4';
import studentFeedback2Video from '../assets/videos/student-feedback (2).mp4';
import honoringBacVideo from '../assets/videos/bac-honoring.mp4';

const HomePage = () => {
    const [showRegistrationForm, setShowRegistrationForm] = useState(false);
    const [selectedCourseType, setSelectedCourseType] = useState('');
    const [activeTrainings, setActiveTrainings] = useState([]);
    const [supportLessons, setSupportLessons] = useState([]);
    const [languages, setLanguages] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        // Listen to active trainings
        const trainingsQuery = query(
            collection(db, 'trainings'),
            where('active', '==', true)
        );
        const trainingsUnsubscribe = onSnapshot(trainingsQuery, (snapshot) => {
            const trainingsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setActiveTrainings(trainingsData);
        });

        // Listen to support lessons
        const supportLessonsUnsubscribe = onSnapshot(collection(db, 'supportCourses'), (snapshot) => {
            const lessonsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSupportLessons(lessonsData);
        });

        // Listen to languages
        const languagesUnsubscribe = onSnapshot(collection(db, 'languages'), (snapshot) => {
            const languagesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setLanguages(languagesData);
        });

        return () => {
            trainingsUnsubscribe();
            supportLessonsUnsubscribe();
            languagesUnsubscribe();
        };
    }, []);

    const services = [
        {
            icon: <Book className="w-8 h-8 text-primary" />,
            title: 'دروس الدعم',
            description: 'دروس دعم مكثفة لطلاب الطورين المتوسط والثانوي',
            link: '/support-lessons',
            linkText: 'المزيد من التفاصيل'
        },
        {
            icon: <Globe className="w-8 h-8 text-primary" />,
            title: 'تعليم اللغات',
            description: 'دورات لتعلم اللغات الأجنبية بمستويات مختلفة',
            link: '/languages',
            linkText: 'اكتشف اللغات'
        },
        {
            icon: <GraduationCap className="w-8 h-8 text-primary" />,
            title: 'دورات تكوينية',
            description: 'برامج تدريبية متخصصة في مختلف المجالات',
            link: '/trainings',
            linkText: 'عرض الدورات'
        }
    ];

    const features = [
        {
            icon: <Users className="w-10 h-10 text-warning" />,
            title: 'أساتذة متخصصون',
            description: 'فريق من الأساتذة الأكفاء ذوي الخبرة'
        },
        {
            icon: <BarChart3 className="w-10 h-10 text-warning" />,
            title: 'مناهج متطورة',
            description: 'أحدث المناهج والوسائل التعليمية'
        },
        {
            icon: <Target className="w-10 h-10 text-warning" />,
            title: 'نتائج مضمونة',
            description: 'متابعة فردية ونتائج ممتازة'
        }
    ];

    const videoTestimonials = [
        {
            title: 'تجربة تلميذة',
            description: 'تجربة ناجحة في دروس الدعم',
            videoSrc: studentFeedback2Video,
            studentName: 'طالبة',
        }
    ];

    const handleRegistration = (courseType) => {
        setSelectedCourseType(courseType);
        setShowRegistrationForm(true);
    };

    const handleRegistrationSubmit = async (registrationData) => {
        try {
            await sendRegistrationEmail(registrationData);
            await sendAdminNotification(registrationData);
            const paymentResult = await initiateAlgerianPayment(registrationData);

            if (paymentResult.success) {
                navigate('/registration-confirmation', {
                    state: { registrationData }
                });
            }
        } catch (error) {
            console.error('Registration failed:', error);
            alert('حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.');
        }

        setShowRegistrationForm(false);
    };

    return (
        <div className="home-page">
            {/* Hero Section */}
            <section className="hero">
                <div className="overlay"></div>
                <div className="container">
                    <div className="hero-content">
                        <h1>مرحباً بكم في Trust School Amara</h1>
                        <p>الثقة في التعليم هو شغفنا، وبناء مستقبل مشرق هو هدفنا</p>
                        <div className="hero-buttons">
                            <a href="#demo" className="cta-button primary">شاهد عرضنا التعريفي <i className="fas fa-play-circle"></i></a>
                            <a href="/contact" className="cta-button secondary">تواصل معنا <i className="fas fa-arrow-left"></i></a>
                        </div>
                    </div>
                </div>
            </section>

            {/* Services Section */}
            <section id="services" className="py-12 px-6 md:px-12 bg-white">
                <div className="container mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-primary text-center mb-12" dir="rtl">خدماتنا التعليمية</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {services.map((service, index) => (
                            <ServiceCard key={index} {...service} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Why Choose Us */}
            <section className="py-12 px-6 md:px-12 bg-gray-50">
                <div className="container mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-primary text-center mb-12" dir="rtl">لماذا تختارنا؟</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <div key={index} className="text-center bg-white p-8 rounded-lg shadow-md hover:shadow-lg transition-shadow" dir="rtl">
                                <div className="flex justify-center mb-4">{feature.icon}</div>
                                <h3 className="text-xl font-semibold text-primary mb-3">{feature.title}</h3>
                                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Demo Section */}
            <section id="demo" className="py-12 px-6 md:px-12 bg-gradient-hero text-white">
                <div className="container mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">جولة في عالم Trust School Amara</h2>
                        <p className="text-gray-200 text-lg max-w-2xl mx-auto">تعرف على منشآتنا ومرافقنا التعليمية المميزة</p>
                    </div>

                    <div className="relative rounded-xl overflow-hidden shadow-2xl mb-12 max-w-4xl mx-auto">
                        <video
                            className="w-full h-auto rounded-2xl shadow-lg border-4 border-white"
                            controls
                        >
                            <source src={schoolIntroVideo} type="video/mp4" />
                            متصفحك لا يدعم تشغيل الفيديو.
                        </video>
                        <p className="text-gray-200 mt-2 text-center">انقر لمشاهدة الفيديو التعريفي</p>
                    </div>
                </div>
            </section>

            {/* Student Video Feedback Section */}
            <section className="py-12 px-6 md:px-12 bg-white">
                <div className="container mx-auto">
                    <div className="text-center mb-12" dir="rtl">
                        <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">شهادات طلابنا</h2>
                        <p className="text-gray-700 text-lg">استمع إلى تجارب طلابنا الناجحة</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
                        {videoTestimonials.map((video, index) => (
                            <div key={index} className="bg-gray-50 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                                <video
                                    className="w-full h-auto rounded-2xl shadow-lg border-4 border-white"
                                    controls
                                >
                                    <source src={video.videoSrc} type="video/mp4" />
                                    متصفحك لا يدعم تشغيل الفيديو.
                                </video>
                                <div className="p-6 text-right" dir="rtl">
                                    <h3 className="text-xl font-semibold text-primary mb-2">{video.title}</h3>
                                    <p className="text-gray-700 mb-3">{video.description}</p>
                                    <div className="flex items-center justify-between text-sm text-gray-600">
                                        <span className="font-medium">{video.studentName}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default HomePage;
