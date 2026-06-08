import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LEVEL_TO_ARABIC = {
  middle: 'متوسط',
  high: 'ثانوي',
};

const STUDY_YEAR_TO_ARABIC = {
  mid1: 'أولى',
  mid2: 'ثانية',
  mid3: 'ثالثة',
  mid4: 'رابعة',
  sec1: 'أولى',
  sec2: 'ثانية',
  sec3: 'ثالثة',
};

const normalizeBirthDate = (raw) => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw?.toDate === 'function') return raw.toDate().toISOString().split('T')[0];
  if (raw instanceof Date) return raw.toISOString().split('T')[0];
  return '';
};

/**
 * Returns normalized user profile data derived from the live-streamed profileDoc in AuthContext.
 * Provides pre-filled defaults for all enrollment forms.
 */
export const useUserProfile = () => {
  const { profileDoc, user } = useAuth();

  const profile = useMemo(() => {
    if (!profileDoc) return null;

    const name = profileDoc.fullName || profileDoc.name || '';
    const guardianPhone = profileDoc.guardianPhone || profileDoc.phoneNumber || profileDoc.phone || '';
    const studentPhone = profileDoc.studentPhone || profileDoc.phoneNumber || profileDoc.phone || '';
    const birthDate = normalizeBirthDate(profileDoc.birthDate);
    const birthPlace = profileDoc.birthPlace || '';
    const school = profileDoc.school || profileDoc.schoolName || '';
    const studyYear = profileDoc.studyYear || '';
    const schoolLevel = profileDoc.schoolLevel || '';
    const stream = profileDoc.stream || '';

    return {
      name,
      fullName: name,
      email: user?.email || profileDoc.email || '',
      guardianPhone,
      studentPhone,
      birthDate,
      birthPlace,
      school,
      studyYear,
      schoolLevel,
      stream,
      // Derived Arabic display values for AnnualFeeForm selects
      levelArabic: LEVEL_TO_ARABIC[schoolLevel] || '',
      yearArabic: STUDY_YEAR_TO_ARABIC[studyYear] || '',
    };
  }, [profileDoc, user]);

  return {
    profile,
    profileLoading: !!user && !profileDoc,
  };
};
