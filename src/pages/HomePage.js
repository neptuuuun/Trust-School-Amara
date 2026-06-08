import React from 'react';
import { Link } from 'react-router-dom';
import ServiceCard from '../components/ServiceCard';
import { Book, Globe, GraduationCap, Users, BarChart3, Target, Play, Phone } from 'lucide-react';
import { useBranch } from '../contexts/BranchContext';
import { buttonClasses } from '../components/ui/button';

const HomePage = () => {
    const { selectedBranchId } = useBranch();

    const handleScrollToDemo = (e) => {
        e.preventDefault();
        const target = document.getElementById('demo');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    };

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
            videoSrc: 'https://jzplbnzmsfbsmeaobamg.supabase.co/storage/v1/object/public/Videos/student-feedback2.mp4',
            studentName: 'طالبة',
        }
    ];

    return (
        <div className="home-page">
            {/* Hero Section */}
            <section className="relative flex min-h-[calc(100vh-5rem)] items-center overflow-hidden bg-gradient-hero text-white">
                <div className="absolute inset-0 bg-primary-900/40" aria-hidden="true"></div>
                <div className="container relative mx-auto px-6 py-20 text-center" dir="rtl">
                    <h1 className="mb-6 text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
                        مرحباً بكم في Trust School Amara
                    </h1>
                    <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/90 md:text-2xl">
                        الثقة في التعليم هو شغفنا، وبناء مستقبل مشرق هو هدفنا
                    </p>
                    <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                        <a href="#demo" onClick={handleScrollToDemo} className={buttonClasses({ variant: 'warning', size: 'lg' })}>
                            <Play className="h-5 w-5" aria-hidden="true" />
                            شاهد عرضنا التعريفي
                        </a>
                        <Link
                            to="/contact"
                            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white/80 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-800"
                        >
                            <Phone className="h-5 w-5" aria-hidden="true" />
                            تواصل معنا
                        </Link>
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
                            <div key={index} className="text-center bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow" dir="rtl">
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
                        <source src="https://jzplbnzmsfbsmeaobamg.supabase.co/storage/v1/object/public/Videos/school-intro.MP4" type="video/mp4" />
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
                                <div className="p-6 text-start" dir="rtl">
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
