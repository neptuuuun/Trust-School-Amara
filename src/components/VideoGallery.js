import React, { useState } from 'react';
import useScrollToTop from '../hooks/useScrollToTop';

// Import video files
import schoolIntroVideo from '../assets/videos/school-intro.mp4';
import studentFeedback1Video from '../assets/videos/student-feedback.mp4';
import studentFeedback2Video from '../assets/videos/student-feedback (2).mp4';
import honoringBacVideo from '../assets/videos/bac-honoring.mp4';

const VideoGallery = () => {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedLevel, setSelectedLevel] = useState('all');
    
    // Automatically scroll to top when category or level changes
    useScrollToTop([selectedCategory, selectedLevel], { 
        behavior: 'smooth',
        delay: 100 // Small delay to ensure content has rendered
    });

    const categories = [
        { id: 'all', name: 'جميع الفيديوهات', nameEn: 'All Videos' },
        { id: 'intro', name: 'تعريف بالمدرسة', nameEn: 'School Introduction' },
        { id: 'testimonials', name: 'شهادات الطلاب', nameEn: 'Student Testimonials' },
        { id: 'events', name: 'الفعاليات', nameEn: 'Events' }
    ];

    const levels = [
        { id: 'all', name: 'جميع المستويات', nameEn: 'All Levels' },
        { id: 'middle', name: 'المتوسط', nameEn: 'Middle School' },
        { id: 'high', name: 'الثانوي', nameEn: 'High School' },
        { id: 'courses', name: 'الدورات', nameEn: 'Courses' }
    ];

    return (
        <div className="video-gallery">
            {/* Filter Controls */}
            <section className="py-8 px-6 md:px-12 bg-white border-b">
                <div className="container mx-auto">
                    <div className="text-center mb-8" dir="rtl">
                        <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">معرض الفيديوهات</h1>
                        <p className="text-gray-700 text-lg">اختر الفئة والمستوى لعرض الفيديوهات المناسبة</p>
                    </div>
                    
                    {/* Category Filter */}
                    <div className="mb-6" dir="rtl">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">الفئة:</h3>
                        <div className="flex flex-wrap gap-3 justify-center">
                            {categories.map((category) => (
                                <button
                                    key={category.id}
                                    onClick={() => setSelectedCategory(category.id)}
                                    className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                                        selectedCategory === category.id
                                            ? 'bg-primary text-white shadow-lg'
                                            : 'bg-gray-100 text-gray-700 hover:bg-primary-100 hover:text-primary'
                                    }`}
                                >
                                    {category.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Level Filter */}
                    <div className="mb-6" dir="rtl">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">المستوى:</h3>
                        <div className="flex flex-wrap gap-3 justify-center">
                            {levels.map((level) => (
                                <button
                                    key={level.id}
                                    onClick={() => setSelectedLevel(level.id)}
                                    className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                                        selectedLevel === level.id
                                            ? 'bg-secondary text-white shadow-lg'
                                            : 'bg-gray-100 text-gray-700 hover:bg-secondary-100 hover:text-secondary'
                                    }`}
                                >
                                    {level.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* School Introduction Section */}
            {(selectedCategory === 'all' || selectedCategory === 'intro') && (
                <section className="py-12 px-6 md:px-12 bg-gradient-hero text-white">
                    <div className="container mx-auto">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" dir="rtl">جولة في عالم Trust School Amara</h2>
                            <p className="text-gray-200 text-lg max-w-2xl mx-auto" dir="rtl">تعرف على منشآتنا ومرافقنا التعليمية المميزة</p>
                        </div>
                    
                    <div className="max-w-4xl mx-auto">
                        <div className="relative rounded-lg overflow-hidden shadow-lg">
                            <video 
                                controls 
                                className="w-full h-auto rounded-lg shadow-lg"
                                poster="/images/school-intro-poster.jpg"
                            >
                                <source src={schoolIntroVideo} type="video/mp4" />
                                متصفحك لا يدعم تشغيل الفيديو.
                            </video>
                        </div>
                    </div>
                </div>
                </section>
            )}

            {/* Student Testimonials Section */}
            {(selectedCategory === 'all' || selectedCategory === 'testimonials') && (
                <section className="py-12 px-6 md:px-12 bg-white">
                    <div className="container mx-auto">
                        <div className="text-center mb-12" dir="rtl">
                            <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">شهادات الطلاب</h2>
                            <p className="text-gray-700 text-lg">استمع إلى تجارب طلابنا الناجحة</p>
                        </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
                        <div className="bg-gray-50 rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                            <video 
                                controls 
                                className="w-full h-auto rounded-t-lg"
                                poster="/images/student-feedback-1-poster.jpg"
                            >
                                <source src={studentFeedback1Video} type="video/mp4" />
                                متصفحك لا يدعم تشغيل الفيديو.
                            </video>
                            <div className="p-6 text-right" dir="rtl">
                                <h3 className="text-xl font-semibold text-primary mb-2">شهادة طالبة متفوقة</h3>
                                <p className="text-gray-700 mb-3">تجربة ناجحة في دروس الدعم</p>
                                <div className="flex items-center justify-between text-sm text-gray-600">
                                    <span className="font-medium">فاطمة أحمد</span>
                                    <span>الصف الثالث ثانوي</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                            <video 
                                controls 
                                className="w-full h-auto rounded-t-lg"
                                poster="/images/student-feedback-2-poster.jpg"
                            >
                                <source src={studentFeedback2Video} type="video/mp4" />
                                متصفحك لا يدعم تشغيل الفيديو.
                            </video>
                            <div className="p-6 text-right" dir="rtl">
                                <h3 className="text-xl font-semibold text-primary mb-2">نجاح في دورة اللغة الإنجليزية</h3>
                                <p className="text-gray-700 mb-3">من المبتدئ إلى المتقدم</p>
                                <div className="flex items-center justify-between text-sm text-gray-600">
                                    <span className="font-medium">محمد العلي</span>
                                    <span>دورة اللغة الإنجليزية</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </section>
            )}

            {/* BAC Honoring Section */}
            {(selectedCategory === 'all' || selectedCategory === 'events') && (
                <section className="py-12 px-6 md:px-12 bg-primary-50">
                    <div className="container mx-auto">
                        <div className="text-center mb-8" dir="rtl">
                            <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">حفل تكريم طلبة الباك</h2>
                            <p className="text-gray-800 text-lg max-w-3xl mx-auto leading-relaxed">
                                نحتفل بنجاح طلابنا الذين اجتازوا امتحانات البكالوريا بتفوق وامتياز. إنجازاتهم تعكس جودة التعليم في مدرستنا والتزامهم بالتميز.
                            </p>
                        </div>
                    
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                            <video 
                                controls 
                                className="w-full h-auto rounded-lg shadow-lg"
                                poster="/images/honoring-bac-poster.jpg"
                            >
                                <source src={honoringBacVideo} type="video/mp4" />
                                متصفحك لا يدعم تشغيل الفيديو.
                            </video>
                            <div className="p-6 text-center" dir="rtl">
                                <h3 className="text-2xl font-semibold text-primary mb-2">حفل تكريم المتفوقين</h3>
                                <p className="text-gray-700">لحظات مميزة من احتفالنا بإنجازات طلابنا المتميزين في امتحانات البكالوريا</p>
                            </div>
                        </div>
                    </div>
                </div>
                </section>
            )}
        </div>
    );
};

export default VideoGallery;
