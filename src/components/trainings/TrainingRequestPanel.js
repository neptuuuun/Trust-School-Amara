// TrainingRequestPanel — student-facing "request a training" experience.
//
// Design principle: the account already knows who the student is (name, email,
// phone, branch, uid). We NEVER ask for those again. The student only supplies
// what the system cannot know: the topic they want, and (optionally) a preferred
// time, their level, and a note.
//
// The panel is login-gated by design — Firestore rules require the request's
// userId to equal the caller's uid, so an anonymous submission is impossible.
// Instead of failing silently, we show a clean sign-in prompt.
//
// After (and before) submitting, the student sees their own live request list
// with status, so they get real feedback and don't double-submit.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDoc, collection, onSnapshot, query, where, serverTimestamp,
} from 'firebase/firestore';
import {
  GraduationCap, Send, Clock, User, Mail, Phone as PhoneIcon,
  Sparkles, LogIn,
} from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { Button } from '../ui/button';
import { Input, Textarea, Label, Select } from '../ui/input';
import { Alert } from '../ui/feedback';
import {
  PREFERRED_TIME_OPTIONS, EXPERIENCE_OPTIONS,
  STATUS, STATUS_META, normalizeStatus, isOpen, getTopic, relativeTime,
  preferredTimeLabel, experienceLabel,
} from '../../utils/trainingRequests';

const StatusPill = ({ status }) => {
  const meta = STATUS_META[normalizeStatus(status)];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

// A short human explanation of what each status means for the student.
const STATUS_HINT = {
  [STATUS.NEW]: 'استلمنا اهتمامك — سنراجعه ونتواصل معك قريباً.',
  [STATUS.CONTACTED]: 'تواصلنا معك بخصوص هذا الاهتمام.',
  [STATUS.FOLLOWING_UP]: 'اهتمامك قيد المتابعة — سنوافيك بأي جديد بخصوص فتح هذه الدورة.',
  [STATUS.CLOSED]: 'أُغلق هذا الطلب حالياً. يمكنك إرسال اهتمام جديد في أي وقت.',
};

const TrainingRequestPanel = ({ branchId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useUserProfile();

  const [topic, setTopic] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [experience, setExperience] = useState('');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSent, setJustSent] = useState(false);

  const [myRequests, setMyRequests] = useState([]);

  const phone = profile?.studentPhone || profile?.guardianPhone || '';

  // Live stream of THIS student's own training requests (rules allow reading
  // own docs). Single equality filter → no composite index needed; type is
  // filtered and sorting done client-side.
  useEffect(() => {
    if (!branchId || !user?.uid) { setMyRequests([]); return undefined; }
    const q = query(
      collection(db, 'branches', branchId, 'registrations'),
      where('userId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.type === 'training_request')
        .sort((a, b) => {
          const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const dbb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return dbb - da;
        });
      setMyRequests(rows);
    }, () => setMyRequests([]));
    return () => unsub();
  }, [branchId, user?.uid]);

  const openTopics = useMemo(
    () => new Set(myRequests.filter((r) => isOpen(r.status)).map((r) => getTopic(r).toLowerCase())),
    [myRequests],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanTopic = topic.trim();
    if (cleanTopic.length < 3) { setError('يرجى إدخال المجال أو الدورة التي ترغب بها (٣ أحرف على الأقل).'); return; }
    if (!branchId) { setError('يرجى اختيار الفرع أولاً.'); return; }
    if (openTopics.has(cleanTopic.toLowerCase())) {
      setError('لديك بالفعل طلب مفتوح بنفس المجال. يمكنك متابعته في الأسفل.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: 'training_request',
        status: STATUS.NEW,
        userId: user.uid,                                  // required by security rules
        studentName: profile?.name || '',
        studentEmail: profile?.email || user.email || '',
        studentPhone: phone,
        topic: cleanTopic,
        courseName: cleanTopic,                            // legacy mirror for any old reader
        branchId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (preferredTime) payload.preferredTime = preferredTime;
      if (experience) payload.experience = experience;
      if (note.trim()) payload.note = note.trim();

      await addDoc(collection(db, 'branches', branchId, 'registrations'), payload);

      setTopic(''); setPreferredTime(''); setExperience(''); setNote('');
      setJustSent(true);
      setTimeout(() => setJustSent(false), 6000);
    } catch (err) {
      console.error('Error submitting training request:', err);
      setError('حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <LogIn className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">سجّل الدخول لطلب دورة</h2>
        <p className="mb-6 text-gray-600">
          طلب الدورات متاح لحسابات الطلاب. سجّل الدخول وسنملأ بياناتك تلقائياً — لن تحتاج إلى كتابة اسمك أو رقمك من جديد.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => navigate('/login')}>تسجيل الدخول</Button>
          <Button variant="secondary" onClick={() => navigate('/register')}>إنشاء حساب</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Requesting-as identity card — pulled from the account, not typed */}
      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" /> سيُرسَل الطلب باسم
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-700">
          <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
            <User className="h-4 w-4 text-gray-400" />
            {profile?.name || '—'}
          </span>
          <span className="inline-flex items-center gap-1.5" dir="ltr">
            <Mail className="h-4 w-4 text-gray-400" />
            {profile?.email || user.email || '—'}
          </span>
          <span className="inline-flex items-center gap-1.5" dir="ltr">
            <PhoneIcon className="h-4 w-4 text-gray-400" />
            {phone || 'لا يوجد رقم'}
          </span>
        </div>
        {!phone && (
          <p className="mt-2 text-xs text-warning-600">
            لا يوجد رقم هاتف في حسابك — أضِفه من ملفك الشخصي ليسهل علينا التواصل معك.
          </p>
        )}
      </div>

      {/* The actual request — only what we don't already know */}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {justSent && (
          <Alert variant="success" className="!mb-0">
            تم إرسال طلبك بنجاح — ستجده في القائمة أدناه وسنتواصل معك قريباً.
          </Alert>
        )}
        {error && <Alert variant="danger" className="!mb-0">{error}</Alert>}

        <div>
          <Label htmlFor="tr-topic" required className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> ما المجال أو الدورة التي ترغب بها؟
          </Label>
          <Input
            id="tr-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="مثال: التسويق الرقمي، البرمجة، اللغة الإنجليزية…"
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tr-time">الوقت المفضل <span className="text-gray-400">(اختياري)</span></Label>
            <Select id="tr-time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)}>
              <option value="">لا تفضيل</option>
              {PREFERRED_TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-exp">مستواك الحالي <span className="text-gray-400">(اختياري)</span></Label>
            <Select id="tr-exp" value={experience} onChange={(e) => setExperience(e.target.value)}>
              <option value="">غير محدد</option>
              {EXPERIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="tr-note">ملاحظة <span className="text-gray-400">(اختياري)</span></Label>
          <Textarea
            id="tr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="أي تفاصيل إضافية تساعدنا على تجهيز الدورة المناسبة لك…"
          />
        </div>

        <Button type="submit" size="lg" fullWidth disabled={submitting}>
          {submitting ? 'جاري الإرسال…' : (<><Send className="h-5 w-5" /> إرسال الطلب</>)}
        </Button>
      </form>

      {/* The student's own requests — real feedback + lifecycle visibility */}
      {myRequests.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-900">
            <Clock className="h-4 w-4 text-gray-400" /> طلباتي السابقة
          </h3>
          <ul className="space-y-3">
            {myRequests.map((r) => {
              const status = normalizeStatus(r.status);
              const chips = [preferredTimeLabel(r.preferredTime), experienceLabel(r.experience)].filter(Boolean);
              return (
                <li key={r.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{getTopic(r) || 'دورة'}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{relativeTime(r.createdAt)}</p>
                      {chips.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {chips.map((c) => (
                            <span key={c} className="rounded-md bg-white px-1.5 py-0.5 text-[11px] text-gray-500 ring-1 ring-gray-200">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">{STATUS_HINT[status]}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TrainingRequestPanel;
