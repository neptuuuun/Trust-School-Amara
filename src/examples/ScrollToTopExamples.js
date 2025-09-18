import React, { useState } from 'react';
import useScrollToTop from '../hooks/useScrollToTop';

// Example 1: Support Lessons Page with Level and Subject Selection
const SupportLessonsExample = () => {
    const [selectedLevel, setSelectedLevel] = useState('middle');
    const [selectedGrade, setSelectedGrade] = useState('1');
    const [selectedSubject, setSelectedSubject] = useState('math');

    // Scroll to top when any of these states change
    useScrollToTop([selectedLevel, selectedGrade, selectedSubject]);

    return (
        <div>
            {/* Level selection buttons */}
            <div className="level-selection">
                <button onClick={() => setSelectedLevel('middle')}>المتوسط</button>
                <button onClick={() => setSelectedLevel('high')}>الثانوي</button>
            </div>

            {/* Grade selection */}
            <div className="grade-selection">
                <button onClick={() => setSelectedGrade('1')}>السنة الأولى</button>
                <button onClick={() => setSelectedGrade('2')}>السنة الثانية</button>
                <button onClick={() => setSelectedGrade('3')}>السنة الثالثة</button>
            </div>

            {/* Subject selection */}
            <div className="subject-selection">
                <button onClick={() => setSelectedSubject('math')}>الرياضيات</button>
                <button onClick={() => setSelectedSubject('physics')}>الفيزياء</button>
                <button onClick={() => setSelectedSubject('arabic')}>اللغة العربية</button>
            </div>

            {/* Content that changes based on selections */}
            <div className="content">
                <h2>المحتوى للمستوى: {selectedLevel} - الصف: {selectedGrade} - المادة: {selectedSubject}</h2>
            </div>
        </div>
    );
};

// Example 2: Course Registration with Step Navigation
const CourseRegistrationExample = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedCourse, setSelectedCourse] = useState('');

    // Scroll to top when step or course changes
    useScrollToTop([currentStep, selectedCourse], {
        behavior: 'smooth',
        delay: 150 // Slightly longer delay for step transitions
    });

    return (
        <div>
            {/* Step indicators */}
            <div className="steps">
                <button onClick={() => setCurrentStep(1)}>معلومات الطالب</button>
                <button onClick={() => setCurrentStep(2)}>اختيار الدورة</button>
                <button onClick={() => setCurrentStep(3)}>الدفع</button>
            </div>

            {/* Course selection */}
            <div className="course-selection">
                <button onClick={() => setSelectedCourse('english')}>اللغة الإنجليزية</button>
                <button onClick={() => setSelectedCourse('french')}>اللغة الفرنسية</button>
            </div>

            {/* Step content */}
            <div className="step-content">
                {currentStep === 1 && <div>خطوة معلومات الطالب</div>}
                {currentStep === 2 && <div>خطوة اختيار الدورة: {selectedCourse}</div>}
                {currentStep === 3 && <div>خطوة الدفع</div>}
            </div>
        </div>
    );
};

// Example 3: FAQ Page with Category Filtering
const FAQExample = () => {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Scroll to top when category changes, but NOT when search term changes
    // (since search is typically real-time and shouldn't reset scroll)
    useScrollToTop([selectedCategory]);

    return (
        <div>
            {/* Category filters */}
            <div className="category-filters">
                <button onClick={() => setSelectedCategory('all')}>جميع الأسئلة</button>
                <button onClick={() => setSelectedCategory('registration')}>التسجيل</button>
                <button onClick={() => setSelectedCategory('courses')}>الدورات</button>
                <button onClick={() => setSelectedCategory('payment')}>الدفع</button>
            </div>

            {/* Search input - doesn't trigger scroll */}
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث في الأسئلة..."
            />

            {/* FAQ content */}
            <div className="faq-content">
                <h2>الفئة: {selectedCategory}</h2>
                <p>البحث: {searchTerm}</p>
            </div>
        </div>
    );
};

// Example 4: Advanced Usage with Custom Options
const AdvancedExample = () => {
    const [tab, setTab] = useState('info');
    const [language, setLanguage] = useState('ar');

    // Custom scroll behavior with different options
    useScrollToTop([tab, language], {
        behavior: 'auto', // Instant scroll instead of smooth
        delay: 0,         // No delay
        top: 100         // Scroll to 100px from top instead of 0
    });

    return (
        <div>
            <div className="tabs">
                <button onClick={() => setTab('info')}>المعلومات</button>
                <button onClick={() => setTab('courses')}>الدورات</button>
                <button onClick={() => setTab('contact')}>الاتصال</button>
            </div>

            <div className="language-switch">
                <button onClick={() => setLanguage('ar')}>العربية</button>
                <button onClick={() => setLanguage('en')}>English</button>
            </div>

            <div className="content">
                <h2>التبويب: {tab} - اللغة: {language}</h2>
            </div>
        </div>
    );
};

// Example 5: Conditional Scroll (only scroll on certain conditions)
const ConditionalScrollExample = () => {
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState('all');
    const [shouldScroll, setShouldScroll] = useState(true);

    // Only scroll when shouldScroll is true
    useScrollToTop(shouldScroll ? [page, filter] : [], {
        behavior: 'smooth'
    });

    const handlePageChange = (newPage) => {
        setPage(newPage);
        setShouldScroll(true); // Enable scroll for page changes
    };

    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        setShouldScroll(false); // Disable scroll for filter changes
    };

    return (
        <div>
            <div className="pagination">
                <button onClick={() => handlePageChange(1)}>الصفحة 1</button>
                <button onClick={() => handlePageChange(2)}>الصفحة 2</button>
                <button onClick={() => handlePageChange(3)}>الصفحة 3</button>
            </div>

            <div className="filters">
                <button onClick={() => handleFilterChange('all')}>الكل</button>
                <button onClick={() => handleFilterChange('recent')}>الحديث</button>
                <button onClick={() => handleFilterChange('popular')}>الشائع</button>
            </div>

            <div className="content">
                <h2>الصفحة: {page} - المرشح: {filter}</h2>
            </div>
        </div>
    );
};

export {
    SupportLessonsExample,
    CourseRegistrationExample,
    FAQExample,
    AdvancedExample,
    ConditionalScrollExample
};
