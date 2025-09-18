import React from 'react';
import PageHeader from '../components/PageHeader';
import RegistrationForm from '../components/RegistrationForm';

const FormationPage = () => {
    const breadcrumb = [
        { label: 'الرئيسية', link: '/' },
        { label: 'الدورات التكوينية', link: '/formation' }
    ];

    const courses = [
        {
            title: 'تطوير الويب',
            description: 'تعلم تطوير المواقع الإلكترونية من الصفر إلى الاحتراف',
            fields: [
                { label: 'الاسم الكامل', name: 'fullName', type: 'text', placeholder: 'الاسم الكامل' },
                { label: 'رقم الهاتف', name: 'phone', type: 'tel', placeholder: 'رقم الهاتف' },
                { label: 'الدورة المطلوبة', name: 'course', type: 'select', placeholder: 'اختر الدورة', options: [
                    { value: 'web', label: 'تطوير الويب' },
                    { value: 'marketing', label: 'التسويق الرقمي' },
                    { value: 'design', label: 'التصميم الجرافيكي' }
                ]}
            ],
            buttonText: 'سجل الآن'
        },
        {
            title: 'التسويق الرقمي',
            description: 'احترف التسويق الرقمي ووسائل التواصل الاجتماعي',
            fields: [
                { label: 'الاسم الكامل', name: 'fullName', type: 'text', placeholder: 'الاسم الكامل' },
                { label: 'رقم الهاتف', name: 'phone', type: 'tel', placeholder: 'رقم الهاتف' },
                { label: 'الدورة المطلوبة', name: 'course', type: 'select', placeholder: 'اختر الدورة', options: [
                    { value: 'web', label: 'تطوير الويب' },
                    { value: 'marketing', label: 'التسويق الرقمي' },
                    { value: 'design', label: 'التصميم الجرافيكي' }
                ]}
            ],
            buttonText: 'سجل الآن'
        },
        {
            title: 'التصميم الجرافيكي',
            description: 'تعلم أساسيات التصميم الجرافيكي وأدواته',
            fields: [
                { label: 'الاسم الكامل', name: 'fullName', type: 'text', placeholder: 'الاسم الكامل' },
                { label: 'رقم الهاتف', name: 'phone', type: 'tel', placeholder: 'رقم الهاتف' },
                { label: 'الدورة المطلوبة', name: 'course', type: 'select', placeholder: 'اختر الدورة', options: [
                    { value: 'web', label: 'تطوير الويب' },
                    { value: 'marketing', label: 'التسويق الرقمي' },
                    { value: 'design', label: 'التصميم الجرافيكي' }
                ]}
            ],
            buttonText: 'سجل الآن'
        }
    ];

    return (
        <div className="formation-page">
            <PageHeader title="الدورات التكوينية" breadcrumb={breadcrumb} />
            
            <section style={{ padding: '60px 0' }}>
                <div className="container">
                    <h2 className="section-title">دوراتنا التكوينية</h2>
                    <div className="courses-grid">
                        {courses.map((course, index) => (
                            <div key={index} className="course-card">
                                <h3>{course.title}</h3>
                                <p>{course.description}</p>
                                <RegistrationForm title={course.title} fields={course.fields} buttonText={course.buttonText} />
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default FormationPage;
