import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBranch } from '../contexts/BranchContext';
import { storage, db, auth } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { 
  User, 
  Calendar, 
  MapPin, 
  GraduationCap, 
  Phone, 
  Camera, 
  Upload,
  ArrowRight,
  ArrowLeft,
  Check
} from 'lucide-react';

const StudentRegistrationForm = ({ onComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [nationalIdPhoto, setNationalIdPhoto] = useState(null);
  const { selectedBranch } = useBranch();
  
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm();

  const totalSteps = 4;

  const steps = [
    { number: 1, title: 'المعلومات الشخصية', icon: User },
    { number: 2, title: 'معلومات المدرسة', icon: GraduationCap },
    { number: 3, title: 'معلومات الاتصال', icon: Phone },
    { number: 4, title: 'الصور المطلوبة', icon: Camera }
  ];

  const gradeOptions = [
    { value: 'primary1', label: 'السنة الأولى ابتدائي' },
    { value: 'primary2', label: 'السنة الثانية ابتدائي' },
    { value: 'primary3', label: 'السنة الثالثة ابتدائي' },
    { value: 'primary4', label: 'السنة الرابعة ابتدائي' },
    { value: 'primary5', label: 'السنة الخامسة ابتدائي' },
    { value: 'mid1', label: 'السنة الأولى متوسط' },
    { value: 'mid2', label: 'السنة الثانية متوسط' },
    { value: 'mid3', label: 'السنة الثالثة متوسط' },
    { value: 'mid4', label: 'السنة الرابعة متوسط' },
    { value: 'sec1', label: 'السنة الأولى ثانوي' },
    { value: 'sec2', label: 'السنة الثانية ثانوي' },
    { value: 'sec3', label: 'السنة الثالثة ثانوي' }
  ];

  const handleFileUpload = (file, type) => {
    if (file && file.size <= 5 * 1024 * 1024) { // 5MB limit
      if (type === 'profile') {
        setProfilePhoto(file);
      } else if (type === 'nationalId') {
        setNationalIdPhoto(file);
      }
    } else {
      alert('حجم الملف يجب أن يكون أقل من 5 ميجابايت');
    }
  };

  const uploadFile = async (file, path) => {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  };

  const generateEmail = (fullName, phone) => {
    const cleanName = fullName.replace(/\s+/g, '').toLowerCase();
    const phoneLastFour = phone.slice(-4);
    return `${cleanName}${phoneLastFour}@trustschool.edu.dz`;
  };

  const onSubmit = async (data) => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      return;
    }

    if (!profilePhoto || !nationalIdPhoto) {
      alert('يرجى رفع جميع الصور المطلوبة');
      return;
    }

    if (!selectedBranch?.id) {
      alert('يرجى اختيار الفرع أولاً.');
      return;
    }
    setLoading(true);
    try {
      // Generate email and password
      const email = generateEmail(data.fullName, data.studentPhone);
      const password = `TS${data.studentPhone.slice(-6)}`;

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Upload photos
      const profilePhotoUrl = await uploadFile(
        profilePhoto, 
        `students/${user.uid}/profile.jpg`
      );
      const nationalIdPhotoUrl = await uploadFile(
        nationalIdPhoto, 
        `students/${user.uid}/national-id.jpg`
      );

      // Create user document in branch-scoped users: branches/{branchId}/users/{uid}
      await setDoc(doc(db, 'branches', selectedBranch.id, 'users', user.uid), {
        role: 'student',
        branchId: selectedBranch.id,
        email: email,
        createdAt: new Date()
      });

      // Create student document in branch-scoped collection
      await addDoc(collection(db, 'branches', selectedBranch.id, 'students'), {
        userId: user.uid,
        branchId: selectedBranch.id,
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        placeOfBirth: data.placeOfBirth,
        address: data.address,
        schoolName: data.schoolName,
        schoolLevel: data.schoolLevel,
        fatherPhone: data.fatherPhone,
        studentPhone: data.studentPhone,
        profilePhotoUrl,
        nationalIdPhotoUrl,
        verified: false,
        yearlyFeePaid: false,
        status: 'active',
        createdAt: new Date()
      });

      onComplete({
        email,
        password,
        studentData: data
      });

    } catch (error) {
      console.error('Registration error:', error);
      alert('حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-primary mb-6">المعلومات الشخصية</h3>
            
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                الاسم الكامل *
              </label>
              <input
                type="text"
                {...register('fullName', { required: 'الاسم الكامل مطلوب' })}
                className="input text-lg"
                placeholder="الاسم واللقب"
              />
              {errors.fullName && (
                <p className="text-red-500 text-sm mt-1">{errors.fullName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  تاريخ الميلاد *
                </label>
                <input
                  type="date"
                  {...register('dateOfBirth', { required: 'تاريخ الميلاد مطلوب' })}
                  className="input text-lg"
                />
                {errors.dateOfBirth && (
                  <p className="text-red-500 text-sm mt-1">{errors.dateOfBirth.message}</p>
                )}
              </div>

              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  مكان الميلاد *
                </label>
                <input
                  type="text"
                  {...register('placeOfBirth', { required: 'مكان الميلاد مطلوب' })}
                  className="input text-lg"
                  placeholder="الولاية، البلدية"
                />
                {errors.placeOfBirth && (
                  <p className="text-red-500 text-sm mt-1">{errors.placeOfBirth.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                العنوان الكامل *
              </label>
              <textarea
                {...register('address', { required: 'العنوان مطلوب' })}
                className="input text-lg min-h-[100px]"
                placeholder="العنوان الكامل مع الولاية والبلدية"
                rows={3}
              />
              {errors.address && (
                <p className="text-red-500 text-sm mt-1">{errors.address.message}</p>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-primary mb-6">معلومات المدرسة</h3>
            
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                اسم المدرسة *
              </label>
              <input
                type="text"
                {...register('schoolName', { required: 'اسم المدرسة مطلوب' })}
                className="input text-lg"
                placeholder="اسم المؤسسة التعليمية"
              />
              {errors.schoolName && (
                <p className="text-red-500 text-sm mt-1">{errors.schoolName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                المستوى الدراسي *
              </label>
              <select
                {...register('schoolLevel', { required: 'المستوى الدراسي مطلوب' })}
                className="input text-lg"
              >
                <option value="">اختر المستوى الدراسي</option>
                {gradeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.schoolLevel && (
                <p className="text-red-500 text-sm mt-1">{errors.schoolLevel.message}</p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-primary mb-6">معلومات الاتصال</h3>
            
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                رقم هاتف الوالد *
              </label>
              <input
                type="tel"
                {...register('fatherPhone', { 
                  required: 'رقم هاتف الوالد مطلوب',
                  pattern: {
                    value: /^[0-9]{10}$/,
                    message: 'رقم الهاتف يجب أن يكون 10 أرقام'
                  }
                })}
                className="input text-lg"
                placeholder="0123456789"
                maxLength={10}
              />
              {errors.fatherPhone && (
                <p className="text-red-500 text-sm mt-1">{errors.fatherPhone.message}</p>
              )}
            </div>

            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                رقم هاتف الطالب
              </label>
              <input
                type="tel"
                {...register('studentPhone', {
                  pattern: {
                    value: /^[0-9]{10}$/,
                    message: 'رقم الهاتف يجب أن يكون 10 أرقام'
                  }
                })}
                className="input text-lg"
                placeholder="0123456789 (اختياري)"
                maxLength={10}
              />
              {errors.studentPhone && (
                <p className="text-red-500 text-sm mt-1">{errors.studentPhone.message}</p>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-primary mb-6">الصور المطلوبة</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Profile Photo */}
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  صورة شخصية *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                  {profilePhoto ? (
                    <div>
                      <img
                        src={URL.createObjectURL(profilePhoto)}
                        alt="Profile preview"
                        className="w-32 h-32 object-cover rounded-full mx-auto mb-4"
                      />
                      <p className="text-green-600 font-medium">{profilePhoto.name}</p>
                    </div>
                  ) : (
                    <div>
                      <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-2">اضغط لرفع الصورة الشخصية</p>
                      <p className="text-sm text-gray-500">JPG, PNG أقل من 5MB</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e.target.files[0], 'profile')}
                    className="hidden"
                    id="profile-photo"
                  />
                  <label
                    htmlFor="profile-photo"
                    className="cursor-pointer inline-block mt-4 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    <Upload className="w-4 h-4 inline ml-2" />
                    اختيار صورة
                  </label>
                </div>
              </div>

              {/* National ID Photo */}
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  صورة بطاقة الهوية *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                  {nationalIdPhoto ? (
                    <div>
                      <img
                        src={URL.createObjectURL(nationalIdPhoto)}
                        alt="National ID preview"
                        className="w-32 h-20 object-cover rounded mx-auto mb-4"
                      />
                      <p className="text-green-600 font-medium">{nationalIdPhoto.name}</p>
                    </div>
                  ) : (
                    <div>
                      <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-2">اضغط لرفع صورة بطاقة الهوية</p>
                      <p className="text-sm text-gray-500">JPG, PNG أقل من 5MB</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e.target.files[0], 'nationalId')}
                    className="hidden"
                    id="national-id-photo"
                  />
                  <label
                    htmlFor="national-id-photo"
                    className="cursor-pointer inline-block mt-4 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    <Upload className="w-4 h-4 inline ml-2" />
                    اختيار صورة
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-bold text-primary">تسجيل طالب جديد</h2>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  currentStep >= step.number 
                    ? 'bg-primary text-white' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentStep > step.number ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <span className={`mr-2 text-sm font-medium ${
                  currentStep >= step.number ? 'text-primary' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-4 ${
                    currentStep > step.number ? 'bg-primary' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6">
          {renderStep()}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={prevStep}
              className={`btn btn-outline-primary ${
                currentStep === 1 ? 'invisible' : ''
              }`}
            >
              <ArrowLeft className="w-4 h-4 ml-2" />
              السابق
            </button>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2"></div>
                  جاري التسجيل...
                </div>
              ) : currentStep === totalSteps ? (
                <div className="flex items-center">
                  <Check className="w-4 h-4 ml-2" />
                  إنهاء التسجيل
                </div>
              ) : (
                <div className="flex items-center">
                  التالي
                  <ArrowRight className="w-4 h-4 mr-2" />
                </div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentRegistrationForm;
