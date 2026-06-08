import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { buttonClasses } from './ui/button';

const ServiceCard = ({ icon, title, description, link, linkText }) => {
    return (
        <div
            dir="rtl"
            className="group flex h-full flex-col items-center rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
        >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary" aria-hidden="true">
                {icon}
            </div>
            <h3 className="mb-2 text-xl font-bold text-primary">{title}</h3>
            <p className="mb-6 flex-1 leading-relaxed text-gray-600">{description}</p>
            <Link to={link} className={buttonClasses({ variant: 'secondary', className: 'mt-auto' })}>
                <span>{linkText}</span>
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
            </Link>
        </div>
    );
};

export default ServiceCard;
