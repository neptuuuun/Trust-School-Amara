import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useUserProfile } from '../hooks/useUserProfile';
import {
  getTrainings,
  isUserVerified,
  getStudentTrainingRegistrations,
} from '../services/firestoreService';
import { GraduationCap } from 'lucide-react';
import EnrollmentProfileCard from './EnrollmentProfileCard';
import ChargilyPayButton from './payments/ChargilyPayButton';
import EnrolledNotice from './payments/EnrolledNotice';
import { Button } from './ui/button';
import { Select, Label } from './ui/input';
import { Alert, LoadingState } from './ui/feedback';
import { DEFAULT_SCHOOL } from '../utils/personData';

const parseNumericPrice = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatPriceText = (raw) => {
  const price = parseNumericPrice(raw);
  if (price == null) return 'السعر غير متوفر';
  if (price === 0) return 'مجاني';
  return `${price.toLocaleString('en-US')} دج`;
};

const normalizeTrainingCourse = (trainingDoc = {}) => {
  const displayName = trainingDoc.title || trainingDoc.name || 'دورة تكوينية';
  const rawPrice = trainingDoc.price;
  const parsedPrice = typeof rawPrice === 'number' ? rawPrice : Math.round(Number(rawPrice));
  return {
    id: trainingDoc.id,
    displayName,
    description: trainingDoc.description || '',
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    teacherName: trainingDoc.teacherName || trainingDoc.trainerName || '',
    schedule: trainingDoc.schedule || trainingDoc.timing || '',
  };
};

const TrainingRegistrationForm = ({ initialSelection = null, onSuccess }) => {
  const location = useLocation();
  const navigationSelection = location.state?.trainingSelection || null;
  const providedSelection = initialSelection || navigationSelection || null;

  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const { profile } = useUserProfile();

  const [trainings,       setTrainings]       = useState([]);
  const [trainingDetails, setTrainingDetails] = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [verified,        setVerified]        = useState(false);
  const [myRegistrations, setMyRegistrations] = useState([]);

  useEffect(() => {
    if (!user || !selectedBranchId) {
      setTrainings([]); setVerified(false); setMyRegistrations([]); setLoading(false); return;
    }
    const loadData = async () => {
      try {
        setLoading(true);
        const [verifiedStatus, trainingsData, myRegs] = await Promise.all([
          isUserVerified(selectedBranchId, user.uid),
          getTrainings(selectedBranchId),
          getStudentTrainingRegistrations(selectedBranchId, user.uid).catch(() => []),
        ]);
        setVerified(verifiedStatus);
        setTrainings(trainingsData.map(normalizeTrainingCourse));
        setMyRegistrations(Array.isArray(myRegs) ? myRegs : []);
      } catch (err) {
        console.error('Error loading training form data:', err);
        setError('فشل في تحميل بيانات الدورات. يرجى المحاولة لاحقاً.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [selectedBranchId, user]);

  const selectionKey = providedSelection
    ? `${providedSelection.trainingId || ''}-${providedSelection.trainingName || ''}-${providedSelection.price ?? ''}`
    : 'none';

  useEffect(() => {
    if (!providedSelection) { setTrainingDetails(null); return; }
    const match = trainings.find((t) => t.id === providedSelection.trainingId);
    const resolvedPrice = (() => {
      const raw = match?.price ?? providedSelection.price;
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    })();
    setTrainingDetails({
      trainingId:   providedSelection.trainingId || match?.id || '',
      trainingName: match?.displayName || providedSelection.trainingName || 'دورة تكوينية',
      price:        resolvedPrice,
      teacherName:  match?.teacherName || providedSelection.teacherName || '',
      schedule:     match?.schedule    || providedSelection.schedule    || '',
      description:  match?.description || providedSelection.description || '',
      subjectId:    providedSelection.subjectId  || '',
      classId:      providedSelection.classId    || providedSelection.trainingId || '',
      groupName:    providedSelection.groupName  || '',
      schedules:    Array.isArray(providedSelection.schedules) ? providedSelection.schedules : [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, trainings]);

  if (!user) return <div className="p-6" dir="rtl"><Alert variant="danger">يرجى تسجيل الدخول للوصول إلى نموذج التسجيل.</Alert></div>;
  if (!selectedBranchId) return <div className="p-6" dir="rtl"><Alert variant="warning">يرجى اختيار الفرع أولاً للمتابعة في عملية التسجيل.</Alert></div>;
  if (loading) return <div dir="rtl"><LoadingState label="جاري تحميل بيانات الدورات…" /></div>;
  if (!verified) return (
    <div className="p-6" dir="rtl">
      <Alert variant="warning" title="حسابك قيد المراجعة">
        سيتم تفعيل إمكانية التسجيل في الدورات بعد أن يقوم فريق الإدارة بتوثيق حسابك.
      </Alert>
    </div>
  );
  if (!providedSelection) return (
    <div className="p-6" dir="rtl">
      <Alert variant="warning">يرجى العودة إلى صفحة الدورات التكوينية واختيار دورة للمتابعة في التسجيل.</Alert>
    </div>
  );

  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">نموذج التسجيل في الدورات التكوينية</h1>
          <p className="text-gray-600">تم اختيار الدورة مسبقاً. يرجى مراجعة بياناتك وإتمام الدفع.</p>
        </header>

        <EnrollmentProfileCard />

        {error && <Alert variant="danger">{error}</Alert>}

        {!trainingDetails ? (
          <div className="bg-white rounded-lg shadow p-10 text-center">
            <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">لا يمكن العثور على بيانات الدورة</h3>
            <p className="text-gray-600">يبدو أن هذه الدورة لم تعد متاحة. يرجى اختيار دورة أخرى من الصفحة الرئيسية.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            {/* Training summary */}
            <div>
              <Label htmlFor="training-selected">الدورة المختارة</Label>
              <Select id="training-selected" value={trainingDetails.trainingId} disabled>
                <option value={trainingDetails.trainingId}>
                  {trainingDetails.trainingName}{` — ${formatPriceText(trainingDetails.price)}`}
                </option>
              </Select>
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-1 text-sm text-gray-700">
              {trainingDetails.description && <p>{trainingDetails.description}</p>}
              <p><strong>المؤطر:</strong> {trainingDetails.teacherName || '—'}</p>
              {trainingDetails.groupName && <p><strong>المجموعة:</strong> {trainingDetails.groupName}</p>}
              <p><strong>السعر:</strong> {formatPriceText(trainingDetails.price)}</p>
              {trainingDetails.schedule && <p><strong>الجدول:</strong> {trainingDetails.schedule}</p>}
            </div>

            {myRegistrations.some((r) => r?.paid !== false && (r.trainingId === trainingDetails.trainingId || r.subjectId === trainingDetails.trainingId)) ? (
              <EnrolledNotice />
            ) : (
            <ChargilyPayButton
              amount={trainingDetails.price}
              branchId={selectedBranchId}
              serviceType="training"
              serviceData={{
                studentName:  profile?.name || '',
                birthDate:    profile?.birthDate   || null,
                birthPlace:   profile?.birthPlace  || '',
                school:       profile?.school || DEFAULT_SCHOOL,
                studentPhone: profile?.studentPhone || profile?.guardianPhone || '',
                trainingId:   trainingDetails.trainingId,
                trainingName: trainingDetails.trainingName,
                subjectId:    trainingDetails.subjectId,
                classId:      trainingDetails.classId,
                groupName:    trainingDetails.groupName,
                teacherName:  trainingDetails.teacherName,
                schedule:     trainingDetails.schedule,
                schedules:    trainingDetails.schedules,
                price:        trainingDetails.price,
                serviceName:  trainingDetails.trainingName,
              }}
              disabled={!trainingDetails.trainingId}
            />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingRegistrationForm;
