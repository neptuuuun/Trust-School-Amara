import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../contexts/BranchContext';
import { Building2 } from 'lucide-react';
import { buttonClasses } from '../components/ui/button';

const BranchCard = ({ id, title, subtitle, onSelect }) => (
  <div
    className="bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer border border-gray-100"
    onClick={() => onSelect(id)}
  >
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-8 h-8 text-primary" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 after:hidden" style={{ marginBottom: 0 }}>{title}</h2>
      <span
        className="block mx-auto"
        style={{ width: '48px', height: '3px', borderRadius: '2px', backgroundColor: '#F59E0B', marginTop: '6px', marginBottom: '8px' }}
        aria-hidden="true"
      />
      <p className="text-gray-600 mb-6">{subtitle}</p>
      <button type="button" className={buttonClasses({ fullWidth: true })}>
        اختيار هذا الفرع
      </button>
    </div>
  </div>
);

const BranchSelector = ({ onSelect }) => {
  const { branches, selectBranch } = useBranch();
  const navigate = useNavigate();

  const handleSelect = (branchId) => {
    if (typeof onSelect === 'function') {
      onSelect(branchId);
    }
    // selectBranch updates both React state and localStorage atomically,
    // so BranchGuard and all components using selectedBranchId stay in sync.
    selectBranch(branchId);
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