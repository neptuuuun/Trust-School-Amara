import React, { useState, useEffect } from 'react';
import { formatWeekdayDate } from '../utils/dateUtils';

const Clock = ({ 
  format = '24-hour', 
  showDate = false,
  className = '',
  size = 'medium' // small, medium, large
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    // Clean up timer on component unmount
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    if (format === '12-hour') {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } else {
      return date.toLocaleTimeString('ar-DZ', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    }
  };

  const sizeClasses = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-lg'
  };

  return (
    <div className={`${sizeClasses[size]} font-medium text-gray-600 ${className}`}>
      <div className="flex flex-col items-end">
        <div>{formatTime(time)}</div>
        {showDate && (
          <div className="text-xs text-gray-500 mt-1">
            {formatWeekdayDate(time)}
          </div>
        )}
      </div>
    </div>
  );
};

export default Clock;
