import React from 'react';
import PageHeader from '../components/PageHeader';
import RegistrationForm from '../components/RegistrationForm';

const FormationPage = () => {
    const breadcrumb = [
        { label: 'الرئيسية', link: '/' },
        { label: 'الدورات التكوينية', link: '/formation' }
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
