import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../contexts/BranchContext';
import { MapPin, Phone, Users, ArrowRight } from 'lucide-react';

const BranchSelectionPage = () => {
  const { branches, selectBranch } = useBranch();
  const navigate = useNavigate();

  const handleBranchSelect = (branchId) => {
    selectBranch(branchId);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            مرحباً بكم في Trust School Amara
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            اختر الفرع الذي تريد التسجيل فيه
          </p>
        </div>

        {/* Branch Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer border border-gray-100"
              onClick={() => handleBranchSelect(branch.id)}
            >
              <div className="p-8">
                {/* Branch Header */}
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {branch.name}
                  </h2>
                  <p className="text-gray-600">{branch.description}</p>
                </div>

                {/* Branch Details */}
                <div className="space-y-4 mb-8">
                  <div className="flex items-center text-gray-700">
                    <MapPin className="w-5 h-5 text-primary ml-3" />
                    <span>{branch.address}</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Phone className="w-5 h-5 text-primary ml-3" />
                    <span>{branch.phone}</span>
                  </div>
                </div>

                {/* Pricing Info */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-gray-800 mb-3">الأسعار:</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>الرسوم السنوية:</span>
                      <span className="font-semibold text-primary">
                        {branch.priceOverrides.yearlyFee} دج
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>دروس الدعم (شهرياً):</span>
                      <span className="font-semibold text-primary">
                        {branch.priceOverrides.supportLessons.monthly} دج
                      </span>
                    </div>
                  </div>
                </div>

                {/* Select Button */}
                <button className="w-full bg-primary hover:bg-primary-600 text-white font-semibold py-4 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center">
                  <span className="ml-2">اختيار هذا الفرع</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center mt-12">
          <p className="text-gray-600">
            يمكنك تغيير الفرع في أي وقت من خلال الإعدادات
          </p>
        </div>
      </div>
    </div>
  );
};

export default BranchSelectionPage;
