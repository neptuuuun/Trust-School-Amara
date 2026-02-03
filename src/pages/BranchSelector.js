import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../contexts/BranchContext';

const BranchCard = ({ id, title, subtitle, onSelect }) => (
  <div
    className="bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer border border-gray-100"
    onClick={() => onSelect(id)}
  >
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-primary text-2xl font-bold">🏫</span>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
      <p className="text-gray-600 mb-6">{subtitle}</p>
      <button className="w-full bg-primary hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200">
        اختيار هذا الفرع
      </button>
    </div>
  </div>
);

const BranchSelector = () => {
  const { selectBranch, branches } = useBranch();
  const navigate = useNavigate();

  const handleSelect = (branchId) => {
    selectBranch(branchId);
    // Persist explicitly for safety and navigate to homepage
    try {
      localStorage.setItem('branchId', branchId);
    } catch (e) {
      // ignore storage error
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">اختر الفرع</h1>
          <p className="text-xl text-gray-600">يرجى اختيار الفرع للمتابعة</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {(() => {
            // Try to resolve the two branches by name from Firestore for correct IDs
            const boumerdes = branches.find(b => (b.name || '').includes('بومرداس')) || null;
            const bordjMenaiel = branches.find(b => (b.name || '').includes('برج منايل')) || null;

            return (
              <>
                <BranchCard
                  id={boumerdes?.id || 'boumerdes'}
                  title="الفرع الأول"
                  subtitle="بومرداس"
                  onSelect={handleSelect}
                />
                <BranchCard
                  id={bordjMenaiel?.id || 'bordj_menaiel'}
                  title="الفرع الثاني"
                  subtitle="برج منايل"
                  onSelect={handleSelect}
                />
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default BranchSelector;

