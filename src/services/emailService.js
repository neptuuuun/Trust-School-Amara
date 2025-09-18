import emailjs from 'emailjs-com';

// EmailJS configuration
const EMAILJS_SERVICE_ID = 'your_service_id'; // Replace with your EmailJS service ID
const EMAILJS_TEMPLATE_ID = 'your_template_id'; // Replace with your EmailJS template ID
const EMAILJS_USER_ID = 'your_user_id'; // Replace with your EmailJS user ID

// Initialize EmailJS
emailjs.init(EMAILJS_USER_ID);

export const sendRegistrationEmail = async (registrationData) => {
    try {
        const templateParams = {
            to_name: registrationData.fullName,
            to_email: registrationData.email,
            student_name: registrationData.fullName,
            student_email: registrationData.email,
            student_phone: registrationData.phone,
            course_name: registrationData.course,
            course_level: registrationData.level || 'غير محدد',
            payment_method: getPaymentMethodName(registrationData.paymentMethod),
            registration_date: new Date(registrationData.registrationDate).toLocaleDateString('ar-DZ'),
            message: `
تم تسجيل الطالب ${registrationData.fullName} بنجاح في الدورة: ${registrationData.course}
${registrationData.level ? `المستوى: ${registrationData.level}` : ''}
رقم الهاتف: ${registrationData.phone}
طريقة الدفع: ${getPaymentMethodName(registrationData.paymentMethod)}
تاريخ التسجيل: ${new Date(registrationData.registrationDate).toLocaleDateString('ar-DZ')}
            `.trim()
        };

        const result = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            templateParams
        );

        console.log('Email sent successfully:', result);
        return { success: true, result };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error };
    }
};

export const sendAdminNotification = async (registrationData) => {
    try {
        const templateParams = {
            to_email: 'admin@trustschoolamara.dz', // Replace with admin email
            subject: 'تسجيل جديد في الموقع',
            student_name: registrationData.fullName,
            student_email: registrationData.email,
            student_phone: registrationData.phone,
            course_name: registrationData.course,
            course_level: registrationData.level || 'غير محدد',
            payment_method: getPaymentMethodName(registrationData.paymentMethod),
            registration_date: new Date(registrationData.registrationDate).toLocaleDateString('ar-DZ'),
            message: `
تم تسجيل طالب جديد:

الاسم: ${registrationData.fullName}
البريد الإلكتروني: ${registrationData.email}
رقم الهاتف: ${registrationData.phone}
الدورة: ${registrationData.course}
${registrationData.level ? `المستوى: ${registrationData.level}` : ''}
طريقة الدفع: ${getPaymentMethodName(registrationData.paymentMethod)}
تاريخ التسجيل: ${new Date(registrationData.registrationDate).toLocaleDateString('ar-DZ')}

يرجى متابعة الطالب والتواصل معه لتحديد مواعيد الحصص.
            `.trim()
        };

        const result = await emailjs.send(
            EMAILJS_SERVICE_ID,
            'admin_notification_template', // Replace with admin notification template ID
            templateParams
        );

        console.log('Admin notification sent successfully:', result);
        return { success: true, result };
    } catch (error) {
        console.error('Failed to send admin notification:', error);
        return { success: false, error };
    }
};

const getPaymentMethodName = (method) => {
    const methods = {
        'edahabia': 'الذهبية (Edahabia)',
        'ccp': 'الحساب الجاري البريدي (CCP)',
        'baridimob': 'بريدي موب (BaridiMob)'
    };
    return methods[method] || method;
};

// Algerian Payment Gateway Integration
export const initiateAlgerianPayment = async (registrationData) => {
    try {
        // This is a mock implementation for Algerian payment gateway
        // Replace with actual Algérie Poste e-payment API integration
        
        const paymentData = {
            amount: calculateCoursePrice(registrationData.course),
            currency: 'DZD',
            customer: {
                name: registrationData.fullName,
                email: registrationData.email,
                phone: registrationData.phone
            },
            order: {
                id: generateOrderId(),
                description: `تسجيل في ${registrationData.course}`,
                items: [{
                    name: registrationData.course,
                    quantity: 1,
                    price: calculateCoursePrice(registrationData.course)
                }]
            },
            paymentMethod: registrationData.paymentMethod,
            returnUrl: `${window.location.origin}/registration-confirmation`,
            cancelUrl: `${window.location.origin}/`
        };

        // Mock payment gateway response
        // In real implementation, this would call the actual Algérie Poste API
        const mockResponse = {
            success: true,
            paymentUrl: `https://epaiment.poste.dz/payment?order=${paymentData.order.id}`,
            orderId: paymentData.order.id,
            status: 'pending'
        };

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return mockResponse;
    } catch (error) {
        console.error('Payment initiation failed:', error);
        return { success: false, error };
    }
};

const calculateCoursePrice = (courseName) => {
    // Course pricing in DZD
    const prices = {
        'دروس الدعم - الطور الثانوي': 15000,
        'دروس الدعم - الطور المتوسط': 12000,
        'اللغة الإنجليزية': 18000,
        'اللغة الفرنسية': 18000,
        'اللغة الإسبانية': 20000,
        'اللغة الألمانية': 20000,
        'اللغة الإيطالية': 20000,
        'دورة تكوينية مخصصة': 25000
    };
    
    return prices[courseName] || 15000;
};

const generateOrderId = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `TSA-${timestamp}-${random}`;
};
