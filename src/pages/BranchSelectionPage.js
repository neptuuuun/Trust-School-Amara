import React from 'react';
import { useBranch } from '../contexts/BranchContext';
import { MapPin, Phone, Users, ArrowRight } from 'lucide-react';
import { buttonClasses } from '../components/ui/button';

/**
 * BranchSelectionPage
 *
 * IMPORTANT: This page is ONLY for unauthenticated users choosing a branch
 * before they register. It does NOT set branch state in BranchContext —
 * that is exclusively done by AuthContext after reading the Firestore user doc.
 *
 * Usage: Pass an `onSelect` prop to receive the chosen branchId, then use it
 * in your signup flow:
 *
 *   <BranchSelectionPage onSelect={(id) => setSignupBranch(id)} />
 *
 * If no `onSelect` is provided the component is read-only (useful for display).
 */
const BranchSelectionPage = ({ onSelect }) => {
  const { branchId: activeBranchId } = useBranch();

  // Source branches from BranchContext (Firestore-backed, read-only here)
  const [branches, setBranches] = React.useState([]);

  React.useEffect(() => {
    // Import lazily to avoid circular dependency if BranchProvider also reads this page
    import('../firebase').then(({ db }) => {
      const { collection, getDocs } = require('firebase/firestore');
      getDocs(collection(db, 'branches')).then((snap) => {
        setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    });
  }, []);

  const handleSelect = (branchId) => {
    if (typeof onSelect === 'function') {
      onSelect(branchId);
    }
    // Do NOT call selectBranch() or any BranchContext setter here.
    // Branch state in context is set ONLY from Firestore after authentication.
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            مرحباً بكم في Trust School Amara
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            اختر الفرع الذي تريد التسجيل فيه
          </p>
        </div>

        {branches.length === 0 && (
          <p className="text-center text-gray-400">جاري تحميل الفروع...</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer border border-gray-100"
              onClick={() => handleSelect(branch.id)}
            >
              <div className="p-8">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {branch.name}
                  </h2>
                  <p className="text-gray-600">{branch.description}</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center text-gray-700">
                    <MapPin className="w-5 h-5 text-primary me-3" />
                    <span>{branch.address}</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Phone className="w-5 h-5 text-primary me-3" />
                    <span>{branch.phone}</span>
                  </div>
                </div>

                {branch.priceOverrides && (
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
                          {branch.priceOverrides.supportLessons?.monthly} دج
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <button type="button" className={buttonClasses({ fullWidth: true })}>
                  <span>اختيار هذا الفرع</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-gray-600">
            سيتم تحديد فرعك تلقائياً بعد تسجيل الدخول
          </p>
        </div>
      </div>
    </div>
  );
};

export default BranchSelectionPage;