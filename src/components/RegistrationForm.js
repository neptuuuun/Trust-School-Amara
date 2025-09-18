import React, { useState } from 'react';

const RegistrationForm = ({ title, fields, buttonText }) => {
    const [formData, setFormData] = useState({});
    const [successMessage, setSuccessMessage] = useState('');

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setSuccessMessage('تم إرسال طلبك بنجاح! سنتواصل معك قريباً.');
        setFormData({});

        // Remove success message after 5 seconds
        setTimeout(() => {
            setSuccessMessage('');
        }, 5000);
    };

    return (
        <div className="registration-form">
            <h2 className="section-title">{title}</h2>
            <form onSubmit={handleSubmit}>
                {fields.map((field, index) => (
                    <div key={index} className="form-group">
                        <label>{field.label}</label>
                        {field.type === 'select' ? (
                            <select
                                name={field.name}
                                value={formData[field.name] || ''}
                                onChange={handleChange}
                                required
                            >
                                <option value="">{field.placeholder}</option>
                                {field.options.map((option, optIndex) => (
                                    <option key={optIndex} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type={field.type}
                                name={field.name}
                                placeholder={field.placeholder}
                                value={formData[field.name] || ''}
                                onChange={handleChange}
                                required
                            />
                        )}
                    </div>
                ))}
                <button type="submit" className="submit-btn">{buttonText}</button>
                {successMessage && <div className="success-message">{successMessage}</div>}
            </form>
        </div>
    );
};

export default RegistrationForm;
