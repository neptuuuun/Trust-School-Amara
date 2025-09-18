import React from 'react';

const PageHeader = ({ title, breadcrumb }) => {
    return (
        <section className="page-header">
            <div className="container">
                <h1>{title}</h1>
                <div className="breadcrumb">
                    {breadcrumb.map((item, index) => (
                        <span key={index}>
                            {index > 0 && ' / '}
                            <a href={item.link}>{item.label}</a>
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default PageHeader;
