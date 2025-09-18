import React from 'react';
import { Link } from 'react-router-dom';

const ServiceCard = ({ icon, title, description, link, linkText }) => {
    return (
        <div className="service-card">
            <div className="service-icon flex justify-center mb-5">{icon}</div>
            <h3>{title}</h3>
            <p>{description}</p>
            <Link to={link} className="service-button">{linkText}</Link>
        </div>
    );
};

export default ServiceCard;
