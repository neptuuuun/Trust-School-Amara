import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { Users, BookOpen, GraduationCap, FileText, MessageSquare } from 'lucide-react';

const Overview = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    signups: 0,
    trainings: 0,
    trainingRequests: 0,
    languages: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    const unsubscribes = [];

    // Listen to signups collection
    const signupsUnsubscribe = onSnapshot(
      collection(db, 'signups'),
      (snapshot) => {
        setStats(prev => ({ ...prev, signups: snapshot.size }));
      },
      (error) => console.error('Error fetching signups:', error)
    );
    unsubscribes.push(signupsUnsubscribe);

    // Listen to trainings collection
    const trainingsUnsubscribe = onSnapshot(
      collection(db, 'trainings'),
      (snapshot) => {
        setStats(prev => ({ ...prev, trainings: snapshot.size }));
      },
      (error) => console.error('Error fetching trainings:', error)
    );
    unsubscribes.push(trainingsUnsubscribe);

    // Listen to training requests collection
    const trainingRequestsUnsubscribe = onSnapshot(
      collection(db, 'training_requests'),
      (snapshot) => {
        setStats(prev => ({ ...prev, trainingRequests: snapshot.size }));
      },
      (error) => console.error('Error fetching training requests:', error)
    );
    unsubscribes.push(trainingRequestsUnsubscribe);

    // Listen to languages collection
    const languagesUnsubscribe = onSnapshot(
      collection(db, 'languages'),
      (snapshot) => {
        setStats(prev => ({ ...prev, languages: snapshot.size }));
        setLoading(false);
      },
      (error) => console.error('Error fetching languages:', error)
    );
    unsubscribes.push(languagesUnsubscribe);

    // Listen to recent activity collection
    const recentActivityQuery = query(
      collection(db, 'recent_activity'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    
    const activityUnsubscribe = onSnapshot(
      recentActivityQuery,
      (snapshot) => {
        const activities = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRecentActivity(activities);
        setActivityLoading(false);
      },
      (error) => {
        console.error('Error fetching recent activity:', error);
        setActivityLoading(false);
      }
    );
    unsubscribes.push(activityUnsubscribe);

    // Cleanup subscriptions
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  // Handle quick action navigation
  const handleQuickAction = (action) => {
    switch (action) {
      case 'addLanguage':
        navigate('/admin/languages');
        break;
      case 'addTraining':
        navigate('/admin/trainings');
        break;
      case 'viewSignups':
        navigate('/admin/signups');
        break;
      default:
        break;
    }
  };

  // Get dot color based on activity type
  const getDotColor = (type) => {
    switch (type) {
      case 'signup':
        return 'bg-success';
      case 'request':
        return 'bg-primary';
      case 'update':
        return 'bg-warning';
      default:
        return 'bg-gray-400';
    }
  };

  // Format timestamp to relative time
  const formatRelativeTime = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return '';
    
    const now = new Date();
    const activityTime = timestamp.toDate();
    const diffInMinutes = Math.floor((now - activityTime) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'منذ لحظات';
    if (diffInMinutes < 60) return `منذ ${diffInMinutes} دقيقة`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `منذ ${diffInHours} ساعة`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `منذ ${diffInDays} يوم`;
  };

  const statCards = [
    {
      title: 'إجمالي التسجيلات',
      value: stats.signups,
      icon: FileText,
      color: 'bg-primary',
      textColor: 'text-primary-600'
    },
    {
      title: 'الدورات التكوينية',
      value: stats.trainings,
      icon: GraduationCap,
      color: 'bg-secondary',
      textColor: 'text-secondary-600'
    },
    {
      title: 'طلبات التدريب',
      value: stats.trainingRequests,
      icon: MessageSquare,
      color: 'bg-accent',
      textColor: 'text-accent-600'
    },
    {
      title: 'اللغات المتاحة',
      value: stats.languages,
      icon: BookOpen,
      color: 'bg-warning',
      textColor: 'text-warning-600'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-bold text-primary mb-2">نظرة عامة</h1>
        <p className="text-xl text-gray-600">إحصائيات سريعة حول النظام</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-medium text-gray-600 mb-2">{stat.title}</p>
                  <p className={`text-4xl font-bold ${stat.textColor}`}>
                    {stat.value.toLocaleString('ar-EG')}
                  </p>
                </div>
                <div className={`p-4 rounded-full ${stat.color} bg-opacity-10`}>
                  <Icon className={`h-8 w-8 ${stat.textColor}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-primary mb-6">إجراءات سريعة</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button 
            onClick={() => handleQuickAction('addLanguage')}
            className="btn btn-primary btn-lg text-right"
          >
            إضافة لغة جديدة
          </button>
          <button 
            onClick={() => handleQuickAction('addTraining')}
            className="btn btn-secondary btn-lg text-right"
          >
            إضافة دورة تكوينية
          </button>
          <button 
            onClick={() => handleQuickAction('viewSignups')}
            className="btn btn-accent btn-lg text-right"
          >
            عرض التسجيلات الجديدة
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-primary mb-6">النشاط الأخير</h2>
        
        {activityLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-lg">لا توجد أنشطة حديثة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center p-4 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0">
                  <div className={`w-3 h-3 ${getDotColor(activity.type)} rounded-full`}></div>
                </div>
                <div className="mr-4">
                  <p className="text-lg font-medium text-gray-900">{activity.message}</p>
                  <p className="text-gray-600">{formatRelativeTime(activity.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Overview;