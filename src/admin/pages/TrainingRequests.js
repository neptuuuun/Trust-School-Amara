import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { FileText, Calendar, CheckCircle, XCircle } from 'lucide-react';

const TrainingRequests = () => {
  const { selectedBranchId } = useBranch();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBranchId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Use registrations with type='training_request'
    const q = query(
      collection(db, 'branches', selectedBranchId, 'registrations'),
      where('type', '==', 'training_request'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRequests(list);
      setLoading(false);
    }, (e) => {
      console.error('Failed to load training requests', e);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBranchId]);

  const formatDate = (ts) => {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleDateString('ar-DZ') : 'غير محدد';
  };

  const approve = async (r) => {
    try {
      await updateDoc(doc(db, 'branches', selectedBranchId, 'registrations', r.id), {
        status: 'approved',
        reviewedAt: new Date(),
      });
      alert('تمت الموافقة على الطلب');
    } catch (e) {
      console.error(e);
      alert('تعذر الموافقة');
    }
  };

  const reject = async (r) => {
    try {
      await updateDoc(doc(db, 'branches', selectedBranchId, 'registrations', r.id), {
        status: 'rejected',
        reviewedAt: new Date(),
      });
      alert('تم رفض الطلب');
    } catch (e) {
      console.error(e);
      alert('تعذر الرفض');
    }
  };

  if (!selectedBranchId) {
    return <div className="text-center py-12 text-gray-600">يرجى اختيار فرع.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">طلبات الدورات التكوينية</h1>
          <p className="text-xl text-gray-600">مراجعة وقبول/رفض الطلبات</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-100">
        <div className="p-6 overflow-x-auto">
          {requests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">لا توجد طلبات</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الاسم</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الهاتف</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الدورة</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الحالة</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">التاريخ</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <span className="font-semibold text-gray-800">{r.name || '—'}</span>
                    </td>
                    <td className="py-4 px-4">{r.phone || '—'}</td>
                    <td className="py-4 px-4">{r.courseName || '—'}</td>
                    <td className="py-4 px-4">
                      {r.status === 'approved' ? (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">مقبول</span>
                      ) : r.status === 'rejected' ? (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">مرفوض</span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">قيد المراجعة</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600 flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        <button onClick={() => approve(r)} className="btn btn-success btn-sm">
                          <CheckCircle className="w-4 h-4 ml-1" /> موافقة
                        </button>
                        <button onClick={() => reject(r)} className="btn btn-danger btn-sm">
                          <XCircle className="w-4 h-4 ml-1" /> رفض
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingRequests;
