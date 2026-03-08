"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useForm } from "react-hook-form"
import { db } from "../firebase"
import { collection, addDoc, serverTimestamp, getDocs, doc, getDoc, setDoc, query, where, limit } from "firebase/firestore"
import { supabase } from "../supabase"
import { useAuth } from "../contexts/AuthContext"
import { useBranch } from "../contexts/BranchContext"
import { Upload, CreditCard, BookOpen, Phone, School, GraduationCap, CheckCircle, AlertCircle } from "lucide-react"
import { gradeToLevel, getYearIdFromLabel, getYearLabels } from "../data/studyLevels"
import { ensureSupportLessonRegistrationRecord, listenStudentSupportLessonRegistrations } from "../services/firestoreService"

const ANNUAL_FEE = 1000 // Base annual registration fee
const LOG_PREFIX = "[AnnualFeeForm]"

const LEVEL_TRANSLATIONS = {
  ثانوي: "high",
  متوسط: "middle",
}

const FORM_YEAR_TO_ID = {
  high: {
    أولى: "sec1",
    ثانية: "sec2",
    ثالثة: "sec3",
  },
  middle: {
    أولى: "mid1",
    ثانية: "mid2",
    ثالثة: "mid3",
    رابعة: "mid4",
  },
}

const normalizeStatus = (status) => String(status || "").toLowerCase()

const isBlockingRegistrationStatus = (status) => {
  const normalized = normalizeStatus(status)
  return normalized === "pending" || normalized === "verified"
}

const subjectKeyFromSubject = (subject) =>
  (subject?.id || subject?.subjectId || subject?.name || "").toString().toLowerCase()

const getSubjectIdentifiers = (subject) => {
  if (!subject) {
    return {
      subjectId: null,
      subjectName: "",
    }
  }

  const fallbackKey = subjectKeyFromSubject(subject)
  return {
    subjectId: subject.id || subject.subjectId || subject.lessonId || fallbackKey || subject.name || "",
    subjectName: subject.name || subject.subjectName || subject.subject || subject.title || fallbackKey || "مادة",
  }
}

const subjectKeyFromRegistration = (registration) =>
  (registration?.subjectId || registration?.subjectName || "").toString().toLowerCase()

const buildSubjectYearKey = (subjectKey, yearId) => `${subjectKey || "unknown"}|${yearId || "unknown"}`

const getRegistrationYearValue = (registration) =>
  registration?.year || registration?.yearId || registration?.yearLabel || registration?.metadata?.year || "unknown"

const REGISTRATION_STATUS_DISPLAY = {
  pending: { label: "قيد المراجعة", classes: "bg-amber-50 text-amber-700 border border-amber-200" },
  verified: { label: "مفعل ✓", classes: "bg-green-50 text-green-700 border border-green-200" },
  rejected: { label: "مرفوض", classes: "bg-red-50 text-red-700 border border-red-200" },
}

const getRegistrationStatusInfo = (status) => {
  const normalized = normalizeStatus(status)
  return (
    REGISTRATION_STATUS_DISPLAY[normalized] || {
      label: "مسجل",
      classes: "bg-gray-100 text-gray-700 border border-gray-200",
    }
  )
}

const normalizeLevelLabel = (levelLabel) => {
  if (!levelLabel || typeof levelLabel !== "string") return null
  const trimmed = levelLabel.trim()
  return LEVEL_TRANSLATIONS[trimmed] || trimmed
}

const deriveLessonLevel = (lesson) => {
  return (
    lesson.level ||
    gradeToLevel(lesson.year || lesson.grade || getYearIdFromLabel(lesson.studyLevel)) ||
    null
  )
}

const shouldApplyYearFilter = (normalizedYearId, normalizedYearLabels) => {
  return Boolean(normalizedYearId || (normalizedYearLabels && normalizedYearLabels.length > 0))
}

const matchesYear = (lesson, normalizedYearId, normalizedYearLabels) => {
  if (!shouldApplyYearFilter(normalizedYearId, normalizedYearLabels)) {
    return true
  }

  console.log(`${LOG_PREFIX} 🔍 Matching year for lesson ${lesson.id}:`, {
    lessonYear: lesson.year,
    lessonGrade: lesson.grade,
    lessonStudyLevel: lesson.studyLevel,
    normalizedYearId,
    normalizedYearLabels
  })

  const lessonYear = (lesson.year || lesson.grade || "").trim()
  if (normalizedYearId && lessonYear === normalizedYearId) {
    console.log(`${LOG_PREFIX} ✅ Match by year field`)
    return true
  }

  const lessonStudyLevel = (lesson.studyLevel || "").trim()
  if (!lessonStudyLevel) {
    console.log(`${LOG_PREFIX} ❌ No studyLevel field`)
    return false
  }

  if (normalizedYearLabels.includes(lessonStudyLevel)) {
    console.log(`${LOG_PREFIX} ✅ Match by studyLevel in labels`)
    return true
  }

  const derivedYearFromLabel = getYearIdFromLabel(lessonStudyLevel)
  console.log(`${LOG_PREFIX} Derived year from label: ${derivedYearFromLabel}`)
  return Boolean(derivedYearFromLabel && normalizedYearId && derivedYearFromLabel === normalizedYearId)
}

const createFilterSignature = (branchId, normalizedLevel, normalizedYearId, streamValue) => {
  const normalizedStream = (streamValue || "").trim()
  return [
    branchId || "no-branch",
    normalizedLevel || "no-level",
    normalizedYearId || "no-year",
    normalizedStream || "no-stream",
  ].join("|")
}

const AnnualFeeForm = ({ onClose, onSubmitted }) => {
  const { user } = useAuth()
  const { selectedBranchId } = useBranch()
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm()
  const [loading, setLoading] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const [subjectsMeta, setSubjectsMeta] = useState({
    rawLessonCount: 0,
    matchedLessonCount: 0,
    filtersKey: null,
    timestamp: 0,
  })
  const isMountedRef = useRef(true)
  const fetchingRef = useRef(null)
  const componentIdRef = useRef(Date.now() + Math.random())
  const [studentRegistrations, setStudentRegistrations] = useState([])
  const [registrationsLoading, setRegistrationsLoading] = useState(false)
  const [registrationsError, setRegistrationsError] = useState(null)
  const [selectedSubjectKeys, setSelectedSubjectKeys] = useState(() => new Set())

  useEffect(() => {
    const componentId = componentIdRef.current
    console.log(`${LOG_PREFIX} 🟢 Component MOUNTED (id: ${componentId})`)
    isMountedRef.current = true
    
    return () => {
      console.log(`${LOG_PREFIX} 🔴 Component UNMOUNTING (id: ${componentId})`)
      console.trace(`${LOG_PREFIX} Unmount stack trace`)
      isMountedRef.current = false
    }
  }, [])

  const level = watch("level")
  const stream = watch("stream")
  const year = watch("year")

  const normalizedLevel = normalizeLevelLabel(level)
  const yearKey = (year || "").trim()
  const normalizedYearId = normalizedLevel ? FORM_YEAR_TO_ID[normalizedLevel]?.[yearKey] : null
  const normalizedYearLabels = useMemo(() => {
    return normalizedYearId ? getYearLabels(normalizedYearId).map((label) => label.trim()) : []
  }, [normalizedYearId])
  const currentFilterSignature = useMemo(() => {
    return createFilterSignature(selectedBranchId, normalizedLevel, normalizedYearId, stream)
  }, [selectedBranchId, normalizedLevel, normalizedYearId, stream])
  const hasValidSelection = Boolean(normalizedLevel && yearKey && !validationError)
  const hasFetchAttempt = subjectsMeta.timestamp > 0
  const normalizedYearKeyForSelection = normalizedYearId || "unknown"
  const supportLessonRegistrations = useMemo(() => {
    return (studentRegistrations || [])
      .filter((entry) => entry?.type === "supportLesson")
      .map((entry) => ({
        ...entry,
        statusInfo: getRegistrationStatusInfo(entry?.status),
        normalizedSubjectKey: subjectKeyFromRegistration(entry),
        normalizedYearKey: getRegistrationYearValue(entry),
      }))
  }, [studentRegistrations])

  const registrationKeyMap = useMemo(() => {
    const map = new Map()
    supportLessonRegistrations.forEach((entry) => {
      const combinedKey = buildSubjectYearKey(entry.normalizedSubjectKey, entry.normalizedYearKey)
      if (!map.has(combinedKey)) {
        map.set(combinedKey, entry)
      }
    })
    return map
  }, [supportLessonRegistrations])

  const blockingRegistrationKeys = useMemo(() => {
    const set = new Set()
    supportLessonRegistrations.forEach((entry) => {
      if (isBlockingRegistrationStatus(entry.status)) {
        const combinedKey = buildSubjectYearKey(entry.normalizedSubjectKey, entry.normalizedYearKey)
        set.add(combinedKey)
      }
    })
    return set
  }, [supportLessonRegistrations])

  const registrationsForCurrentYear = useMemo(
    () => supportLessonRegistrations.filter((entry) => entry.normalizedYearKey === normalizedYearKeyForSelection),
    [supportLessonRegistrations, normalizedYearKeyForSelection],
  )

  const blockingRegistrationsForCurrentYear = useMemo(
    () =>
      registrationsForCurrentYear.filter((entry) => entry.normalizedYearKey === normalizedYearKeyForSelection && isBlockingRegistrationStatus(entry.status)),
    [registrationsForCurrentYear, normalizedYearKeyForSelection],
  )

  const hasRequiredRegistrations = blockingRegistrationsForCurrentYear.length > 0

  const subjectStatusList = useMemo(() => {
    return subjects.map((subject) => {
      const normalizedSubjectKey = subjectKeyFromSubject(subject)
      const combinedKey = buildSubjectYearKey(normalizedSubjectKey, normalizedYearKeyForSelection)
      const existingRegistration = registrationKeyMap.get(combinedKey)
      const isBlocked = blockingRegistrationKeys.has(combinedKey)
      const isSelected = selectedSubjectKeys.has(combinedKey)
      return {
        subject,
        combinedKey,
        normalizedSubjectKey,
        isBlocked,
        isSelected,
        existingRegistration,
        statusInfo: existingRegistration?.statusInfo || null,
      }
    })
  }, [subjects, registrationKeyMap, blockingRegistrationKeys, normalizedYearKeyForSelection, selectedSubjectKeys])

  const selectedSubjectEntries = useMemo(() => {
    return subjectStatusList.filter((entry) => entry.isSelected)
  }, [subjectStatusList])

  const subjectKeyToSubjectMap = useMemo(() => {
    const map = new Map()
    subjects.forEach((subject) => {
      map.set(subjectKeyFromSubject(subject), subject)
    })
    return map
  }, [subjects])

  const registeredSubjectSummaries = useMemo(() => {
    return blockingRegistrationsForCurrentYear.map((registration) => {
      const subject = subjectKeyToSubjectMap.get(registration.normalizedSubjectKey) || null
      const fallbackName =
        subject?.name ||
        registration.subjectName ||
        registration.subjectId ||
        registration.metadata?.subjectName ||
        "مادة"
      const price =
        subject?.price ??
        registration.metadata?.price ??
        (typeof registration.monthlyPrice === "number" ? registration.monthlyPrice : 0)

      return {
        id: registration.id,
        subjectName: fallbackName,
        price,
        statusInfo: registration.statusInfo,
      }
    })
  }, [blockingRegistrationsForCurrentYear, subjectKeyToSubjectMap])

  const registeredSubjectsCount = registeredSubjectSummaries.length
  const selectedSubjectsCount = selectedSubjectEntries.length

  // Validate user and branch on mount
  useEffect(() => {
    const validateUserAndBranch = async () => {
      console.log(`${LOG_PREFIX} Validating user and branch...`)

      // Validate user
      if (!user || !user.uid || typeof user.uid !== "string" || user.uid.trim() === "") {
        const error = "يجب تسجيل الدخول أولاً للوصول إلى نموذج الرسوم السنوية"
        console.error(`${LOG_PREFIX} User validation failed:`, { user, uid: user?.uid })
        if (isMountedRef.current) {
          setValidationError(error)
        }
        return
      }

      // Validate branch
      if (!selectedBranchId || typeof selectedBranchId !== "string" || selectedBranchId.trim() === "") {
        const error = "يجب اختيار الفرع أولاً. يرجى تحديد فرع من القائمة."
        console.error(`${LOG_PREFIX} Branch validation failed:`, { selectedBranchId })
        if (isMountedRef.current) {
          setValidationError(error)
        }
        return
      }

      // Verify user exists in branch users collection
      try {
        console.log(`${LOG_PREFIX} Verifying user exists in branch: ${selectedBranchId}`)
        const userDocRef = doc(db, "branches", selectedBranchId, "users", user.uid)
        const userDoc = await getDoc(userDocRef)

        if (!userDoc.exists()) {
          const error = "حسابك غير مسجل في هذا الفرع. يرجى التواصل مع الإدارة."
          console.error(`${LOG_PREFIX} User not found in branch users:`, {
            branchId: selectedBranchId,
            userId: user.uid,
            path: `branches/${selectedBranchId}/users/${user.uid}`,
          })
          if (isMountedRef.current) {
            setValidationError(error)
          }
          return
        }

        console.log(`${LOG_PREFIX} User validation successful:`, {
          userId: user.uid,
          branchId: selectedBranchId,
          userData: userDoc.data(),
        })

        if (isMountedRef.current) {
          setValidationError(null)
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Error verifying user in branch:`, {
          error: error.message,
          errorCode: error.code,
          userId: user.uid,
          branchId: selectedBranchId,
          stack: error.stack,
        })
        if (isMountedRef.current) {
          setValidationError("حدث خطأ أثناء التحقق من حسابك. يرجى المحاولة مرة أخرى.")
        }
      }
    }

    validateUserAndBranch()
  }, [user, selectedBranchId])

  useEffect(() => {
    if (!user?.uid || !selectedBranchId) {
      setStudentRegistrations([])
      return
    }

    setRegistrationsLoading(true)
    setRegistrationsError(null)

    const unsubscribe = listenStudentSupportLessonRegistrations(selectedBranchId, user.uid, (entries) => {
      if (!isMountedRef.current) return
      setStudentRegistrations(entries || [])
      setRegistrationsLoading(false)
    })

    return () => {
      unsubscribe?.()
      if (isMountedRef.current) {
        setRegistrationsLoading(false)
      }
    }
  }, [selectedBranchId, user?.uid])

  // Load available subjects based on level
  useEffect(() => {
    const validateAndLoadSubjects = async () => {
      // Skip if validation error exists
      if (validationError) {
        console.log(`${LOG_PREFIX} Skipping subjects load due to validation error`)
        if (isMountedRef.current) {
          setLoadingSubjects(false)
          setSubjects([])
        }
        return
      }

      // Guard: Check user exists and has uid
      if (!user || !user.uid || typeof user.uid !== "string" || user.uid.trim() === "") {
        console.warn(`${LOG_PREFIX} Skipped subjects loading: user is invalid`, { user, uid: user?.uid })
        if (isMountedRef.current) {
          setSubjects([])
          setLoadingSubjects(false)
        }
        return
      }

      // Guard: Check selectedBranchId exists
      if (!selectedBranchId || typeof selectedBranchId !== "string" || selectedBranchId.trim() === "") {
        console.warn(`${LOG_PREFIX} Skipped subjects loading: selectedBranchId is invalid`, { selectedBranchId })
        if (isMountedRef.current) {
          setSubjects([])
          setLoadingSubjects(false)
        }
        return
      }

      // Guard: Check level exists
      if (!level || typeof level !== "string" || level.trim() === "") {
        console.log(`${LOG_PREFIX} Skipped subjects loading: level not selected`)
        // Always set loading to false when level/year are empty
        // The render logic will show subjects if they exist, or show the "select level/year" message
        if (isMountedRef.current) {
          setLoadingSubjects(false)
        }
        return
      }

      // Guard: Check year exists - CRITICAL FOR FILTERING
      if (!year || typeof year !== "string" || year.trim() === "") {
        console.log(`${LOG_PREFIX} Skipped subjects loading: year not selected`)
        // Always set loading to false when level/year are empty
        // The render logic will show subjects if they exist, or show the "select level/year" message
        if (isMountedRef.current) {
          setLoadingSubjects(false)
        }
        return
      }

      // Check if we already have subjects for this exact filter signature
      // If so, skip loading and keep existing subjects
      // IMPORTANT: Only skip if we have subjects AND the filter matches
      // If subjects.length is 0, we must fetch even if filter signature matches
      if (subjects.length > 0 && subjectsMeta.filtersKey === currentFilterSignature) {
        console.log(`${LOG_PREFIX} Already have subjects for this filter, skipping reload`)
        if (isMountedRef.current) {
          setLoadingSubjects(false)
        }
        return
      }
      
      // If a fetch is already in progress for this filter, skip
      if (fetchingRef.current === currentFilterSignature) {
        console.log(`${LOG_PREFIX} Fetch already in progress for this filter, skipping`)
        return
      }
      
      // If filter signature changed or subjects are empty, clear subjects first
      if (subjectsMeta.filtersKey !== currentFilterSignature && subjects.length > 0) {
        console.log(`${LOG_PREFIX} Filter signature changed, clearing old subjects`)
        if (isMountedRef.current) {
          setSubjects([])
        }
      }
      
      // Store the component ID at the start of fetch to verify it's still the same component
      const fetchComponentId = componentIdRef.current
      console.log(`${LOG_PREFIX} Starting fetch with component ID: ${fetchComponentId}`)

      // All guards passed, proceed with loading
      if (isMountedRef.current) {
        setLoadingSubjects(true)
      }

      if (!normalizedLevel) {
        console.warn(`${LOG_PREFIX} Skipped subjects loading: normalized level is invalid`, { level })
        if (isMountedRef.current) setLoadingSubjects(false)
        return
      }

      const fetchSignature = currentFilterSignature
      fetchingRef.current = fetchSignature

      try {
        console.log(`${LOG_PREFIX} Loading subjects with validated params:`, {
          branchId: selectedBranchId,
          level,
          normalizedLevel,
          year: year || "N/A",
          stream: stream || "N/A",
          userId: user.uid,
        })

        // SAFE FIRESTORE QUERY: All parameters validated
        const lessonsRef = collection(db, "branches", selectedBranchId, "supportLessons")
        const snapshot = await getDocs(lessonsRef)

        console.log(`${LOG_PREFIX} ===== FIRESTORE FETCH DEBUG =====`)
        console.log(`${LOG_PREFIX} Total lessons fetched: ${snapshot.docs.length}`)
        console.log(`${LOG_PREFIX} Filter criteria:`, {
          normalizedLevel,
          normalizedYearId,
          normalizedYearLabels,
          stream: stream || "N/A",
        })

        snapshot.docs.slice(0, 3).forEach((doc, idx) => {
          const data = doc.data()
          console.log(`${LOG_PREFIX} Lesson ${idx + 1} (${doc.id}):`, {
            level: data.level,
            year: data.year,
            grade: data.grade,
            studyLevel: data.studyLevel,
            subject: data.subject,
            stream: data.stream,
            derivedLevel: deriveLessonLevel(data),
          })
        })

        let lessonsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        const rawLessonCount = lessonsData.length

        // Filter by level - match normalized level codes (middle/high)
        lessonsData = lessonsData.filter((lesson) => {
          const lessonLevel = deriveLessonLevel(lesson)
          const matches = lessonLevel === normalizedLevel
          if (!matches) {
            console.log(`${LOG_PREFIX} Lesson ${lesson.id} excluded by level`, {
              lessonLevel,
              targetLevel: normalizedLevel,
            })
          }
          return matches
        })

        console.log(`${LOG_PREFIX} After level filter: ${lessonsData.length} lessons`)

        if (shouldApplyYearFilter(normalizedYearId, normalizedYearLabels)) {
          console.log(`${LOG_PREFIX} Applying year filter for labels:`, normalizedYearLabels)
          lessonsData = lessonsData.filter((lesson) => matchesYear(lesson, normalizedYearId, normalizedYearLabels))
          console.log(`${LOG_PREFIX} After year filter: ${lessonsData.length} lessons`)
        }

        // If stream is selected (for ثانوي), filter by stream
        if (level === "ثانوي" && stream && stream.trim() !== "") {
          console.log(`${LOG_PREFIX} Applying stream filter: "${stream}"`)
          lessonsData = lessonsData.filter((lesson) => {
            // Include lessons without stream field or matching stream
            if (!lesson.stream || lesson.stream === "") {
              console.log(`${LOG_PREFIX} Lesson ${lesson.id} has no stream, including it`)
              return true
            }
            const matches = lesson.stream === stream
            console.log(`${LOG_PREFIX} Lesson ${lesson.id} stream="${lesson.stream}" matches="${matches}"`)
            return matches
          })
          console.log(`${LOG_PREFIX} After stream filter: ${lessonsData.length} lessons`)
        }

        // Extract unique subjects with prices
        const subjectsMap = new Map()
        lessonsData.forEach((lesson) => {
          if (lesson.subject) {
            const key = lesson.subject.toLowerCase().trim()
            const numericPrice = Math.round(Number(lesson.price))
            const calculatedPrice = Number.isFinite(numericPrice) && numericPrice >= 0 ? numericPrice : 0
            if (!subjectsMap.has(key)) {
              subjectsMap.set(key, {
                name: lesson.subject,
                price: calculatedPrice,
                id: lesson.id,
                levelId: deriveLessonLevel(lesson),
                levelLabel: level || lesson.studyLevel || '',
                yearId: lesson.year || lesson.grade || normalizedYearId || '',
                yearLabel: year || lesson.studyLevel || '',
              })
              console.log(`${LOG_PREFIX} Added subject: ${lesson.subject} (${calculatedPrice} DZD)`)
            }
          } else {
            console.warn(`${LOG_PREFIX} Lesson ${lesson.id} missing subject name; skipping`)
          }
        })

        const uniqueSubjects = Array.from(subjectsMap.values())
        console.log(`${LOG_PREFIX} FINAL: Extracted ${uniqueSubjects.length} unique subjects:`, uniqueSubjects)
        console.log(`${LOG_PREFIX} ===== END DEBUG =====`)

        const matchedLessonCount = lessonsData.length

        // CRITICAL FIX: Always update state when subjects are successfully fetched
        // Check if this is still the same component instance that started the fetch
        const isSameComponent = componentIdRef.current === fetchComponentId
        const isStillMounted = isMountedRef.current
        const isFetchStillRelevant = currentFilterSignature === fetchSignature
        const hasSubjects = uniqueSubjects.length > 0
        
        console.log(`${LOG_PREFIX} State update check:`, {
          isSameComponent,
          isStillMounted,
          isFetchStillRelevant,
          hasSubjects,
          fetchSignature,
          currentFilterSignature,
          subjectsCount: uniqueSubjects.length,
          fetchComponentId,
          currentComponentId: componentIdRef.current
        })
        
        // CRITICAL: Always update if fetch is still relevant (same filter)
        // React will safely handle state updates even if component appears unmounted
        // (This handles React Strict Mode double-mounting in development)
        if (isFetchStillRelevant || (isSameComponent && hasSubjects)) {
          console.log(`${LOG_PREFIX} ✅ Updating state with ${uniqueSubjects.length} subjects for filter: ${fetchSignature}`)
          
          // Always update state - subjects were successfully fetched
          // React's setState is safe to call even if component appears unmounted
          // (React will ignore it if truly unmounted, or apply it if remounted)
          setLoadingSubjects(false)
          setSubjects(uniqueSubjects)
          setSubjectsMeta({
            rawLessonCount,
            matchedLessonCount,
            filtersKey: fetchSignature,
            timestamp: Date.now(),
          })
          console.log(`${LOG_PREFIX} ✅ STATE UPDATE COMPLETE - subjects.length=${uniqueSubjects.length}, filtersKey=${fetchSignature}`)
        } else {
          console.warn(`${LOG_PREFIX} ⚠️ Skipping state update:`, {
            reason: !isSameComponent ? 'Component remounted with different filter' : 
                    !isFetchStillRelevant ? 'Filter changed during fetch' : 'Unknown',
            fetchComponentId,
            currentComponentId: componentIdRef.current,
            fetchSignature,
            currentFilterSignature
          })
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Error loading subjects:`, {
          error: error.message,
          errorCode: error.code,
          branchId: selectedBranchId,
          level,
          stream: stream || "N/A",
          userId: user.uid,
          stack: error.stack,
        })

        if (isMountedRef.current) {
          setSubjects([])
          setLoadingSubjects(false)
          setSubjectsMeta({
            rawLessonCount: 0,
            matchedLessonCount: 0,
            filtersKey: currentFilterSignature,
            timestamp: Date.now(),
          })
        }
        alert("حدث خطأ أثناء تحميل المواد. يرجى المحاولة مرة أخرى.")
      } finally {
        // Clear the fetching ref
        if (fetchingRef.current === fetchSignature) {
          fetchingRef.current = null
        }
      }
    }

    validateAndLoadSubjects()
  }, [user, selectedBranchId, level, stream, year, validationError, normalizedLevel, normalizedYearId, normalizedYearLabels, currentFilterSignature])

  // Calculate total amount (annual fee + selected support lesson subjects)
  const totalAmount = useMemo(() => {
    const subjectsTotal = selectedSubjectEntries.reduce((sum, entry) => {
      const rawPrice = Math.round(Number(entry?.subject?.price))
      const price = Number.isFinite(rawPrice) ? rawPrice : 0
      return sum + price
    }, 0)

    return ANNUAL_FEE + subjectsTotal
  }, [selectedSubjectEntries])

  const handleSubjectSelection = (subject) => {
    if (!subject) return

    if (!hasValidSelection || !normalizedYearKeyForSelection || normalizedYearKeyForSelection === "unknown") {
      alert("يرجى اختيار المستوى والسنة قبل اختيار المواد.")
      return
    }

    const normalizedSubjectKey = subjectKeyFromSubject(subject)
    const combinedKey = buildSubjectYearKey(normalizedSubjectKey, normalizedYearKeyForSelection)

    if (blockingRegistrationKeys.has(combinedKey)) {
      return
    }

    setSelectedSubjectKeys((prev) => {
      const next = new Set(prev)
      if (next.has(combinedKey)) {
        next.delete(combinedKey)
      } else {
        next.add(combinedKey)
      }
      return next
    })
  }

  useEffect(() => {
    setSelectedSubjectKeys(new Set())
  }, [currentFilterSignature, normalizedYearKeyForSelection])

  const handleReceiptUpload = (file) => {
    if (file && file.size <= 10 * 1024 * 1024) {
      setReceipt(file)
    } else {
      alert("حجم الملف يجب أن يكون أقل من 10 ميجابايت")
    }
  }

  const onSubmit = async (data) => {
    console.log(`${LOG_PREFIX} ========== SUBMIT STARTED ==========`)
    console.log(`${LOG_PREFIX} Form data:`, data)

    // CRITICAL VALIDATION: Check for any validation errors
    if (validationError) {
      console.error(`${LOG_PREFIX} Submit blocked: validation error exists:`, validationError)
      alert(validationError)
      return
    }

    // CRITICAL GUARD 1: Validate user
    if (!user || !user.uid || typeof user.uid !== "string" || user.uid.trim() === "") {
      const error = "يجب تسجيل الدخول أولاً"
      console.error(`${LOG_PREFIX} Submit failed: user is invalid`, { user, uid: user?.uid })
      alert(error)
      return
    }

    // CRITICAL GUARD 2: Validate selectedBranchId
    if (!selectedBranchId || typeof selectedBranchId !== "string" || selectedBranchId.trim() === "") {
      const error = "يجب اختيار الفرع أولاً"
      console.error(`${LOG_PREFIX} Submit failed: selectedBranchId is invalid`, { selectedBranchId })
      alert(error)
      return
    }

    console.log(`${LOG_PREFIX} Validated parameters:`, {
      userId: user.uid,
      branchId: selectedBranchId,
      userEmail: user.email,
    })

    // Check if annual fee is already verified (SINGLE SOURCE OF TRUTH: branches/{branchId}/annualPayments)
    try {
      const paymentsRef = collection(db, "branches", selectedBranchId, "annualPayments")
      const alreadyVerifiedQuery = query(
        paymentsRef,
        where("userId", "==", user.uid),
        where("status", "==", "verified"),
        limit(1),
      )
      const verifiedSnapshot = await getDocs(alreadyVerifiedQuery)

      if (!verifiedSnapshot.empty) {
        console.warn(`${LOG_PREFIX} Annual fee already verified for user ${user.uid}`)
        alert("لقد قمت بدفع الرسوم السنوية مسبقاً")
        if (onClose) onClose()
        return
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error checking annualPayments status:`, {
        error: error.message,
        errorCode: error.code,
        uid: user.uid,
        branchId: selectedBranchId,
        stack: error.stack,
      })

      if (error.code === "permission-denied") {
        alert("ليس لديك صلاحية للوصول إلى هذا الفرع. يرجى التواصل مع الإدارة.")
        return
      }

      console.warn(`${LOG_PREFIX} Continuing with submission despite annualPayments check error`)
    }

    if (!receipt) {
      console.warn(`${LOG_PREFIX} Submit validation failed: no receipt uploaded`)
      alert("الرجاء رفع صورة إثبات الدفع")
      return
    }

    setLoading(true)
    console.log(`${LOG_PREFIX} Starting payment submission...`)

    try {
      // Upload receipt to Supabase storage
      const fileExt = receipt.name.split(".").pop()?.toLowerCase() || "jpg"
      const timestamp = Date.now()
      // Correct path: branch/userId-timestamp.ext (NO bucket name in path)
      const fileName = `${selectedBranchId}/${user.uid}-${timestamp}.${fileExt}`

      console.log(`${LOG_PREFIX} Uploading receipt to Supabase:`, {
        bucket: "annual-fee",
        fileName,
        fileSize: receipt.size,
        fileType: receipt.type,
      })

      // Validate file size before upload (max 10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
      if (receipt.size > MAX_FILE_SIZE) {
        throw new Error("حجم الملف يجب أن يكون أقل من 10 ميجابايت")
      }

      // Validate file type
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
      if (!validTypes.includes(receipt.type.toLowerCase())) {
        throw new Error("نوع الملف غير مدعوم. يرجى رفع صورة بصيغة JPG أو PNG")
      }
      // Add RIGHT BEFORE the supabase.storage.from('annual-fee').upload() call
      console.log(`${LOG_PREFIX} ========== AUTH DEBUG ==========`)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      console.log(`${LOG_PREFIX} Auth session exists:`, !!session)
      console.log(`${LOG_PREFIX} Session user:`, session?.user?.id)
      console.log(`${LOG_PREFIX} Session access_token exists:`, !!session?.access_token)
      console.log(`${LOG_PREFIX} Firebase user:`, user.uid)
      console.log(`${LOG_PREFIX} ========== END AUTH DEBUG ==========`)
      // Upload to Supabase
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("annual-fee") // Bucket name
        .upload(fileName, receipt, {
          cacheControl: "3600",
          upsert: false, // Don't overwrite existing files
          contentType: receipt.type,
        })

      if (uploadError) {
        console.error(`${LOG_PREFIX} Supabase upload error:`, {
          error: uploadError,
          message: uploadError.message,
          statusCode: uploadError.statusCode,
        })

        // Provide specific error messages
        if (uploadError.message?.includes("Bucket not found")) {
          throw new Error("خطأ في الإعدادات: لم يتم العثور على مساحة التخزين. يرجى التواصل مع المسؤول.")
        } else if (uploadError.message?.includes("already exists")) {
          throw new Error("تم رفع هذا الملف مسبقاً. يرجى استخدام ملف آخر.")
        } else if (uploadError.statusCode === 413) {
          throw new Error("حجم الملف كبير جداً. يرجى استخدام صورة أصغر.")
        } else {
          throw new Error(`فشل رفع الإيصال: ${uploadError.message}`)
        }
      }

      console.log(`${LOG_PREFIX} Receipt uploaded successfully:`, uploadData)

      // Get public URL - CRITICAL: Use same bucket name 'annual-fee'
      const {
        data: { publicUrl: receiptUrl },
      } = supabase.storage
        .from("annual-fee") // Must match upload bucket
        .getPublicUrl(fileName)

      console.log(`${LOG_PREFIX} Receipt public URL: ${receiptUrl}`)

      // Store both the public URL and the path for future reference
      const receiptPath = fileName
      const firestoreTimestamp = serverTimestamp()

      // Prepare payment data for BRANCH-SCOPED annualPayments collection
      const paymentData = {
        userId: user.uid,
        userEmail: user.email || "",
        userName: user.displayName || data.fullName || "",
        userPhone: data.guardianPhone || user.phoneNumber || "",
        studentPhone: data.studentPhone || "",
        level: data.level || "",
        year: data.year || "",
        academicYear: normalizedYearId || "",
        stream: data.stream || null,
        school: data.school || "",
        annualFee: ANNUAL_FEE,
        amount: totalAmount,
        paymentMethod: data.paymentMethod || "",
        receiptUrl: receiptUrl, // Public URL for viewing
        receiptPath: receiptPath, // Storage path for management
        status: "pending",
        branchId: selectedBranchId,
        createdAt: firestoreTimestamp,
        updatedAt: firestoreTimestamp,
        meta: {
          clientIp: null,
          userAgent: navigator.userAgent || null,
          submittedFrom: "web-form",
          fileSize: receipt.size,
          fileType: receipt.type,
          originalFileName: receipt.name,
        },
      }

      console.log(`${LOG_PREFIX} Prepared payment data:`, {
        ...paymentData,
        createdAt: "serverTimestamp()",
        updatedAt: "serverTimestamp()",
      })

      // SAFE FIRESTORE WRITE: Write to branch-scoped annualPayments collection
      const paymentsCollectionPath = `branches/${selectedBranchId}/annualPayments`
      console.log(`${LOG_PREFIX} Saving to Firestore path: ${paymentsCollectionPath}`)

      const paymentsRef = collection(db, "branches", selectedBranchId, "annualPayments")
      const docRef = await addDoc(paymentsRef, paymentData)

      // CRITICAL: Write studyYear and schoolLevel to user document
      // studyYear is the canonical source of truth for access control
      // schoolLevel is the level (middle/high), not the year
      try {
        const userRef = doc(db, "branches", selectedBranchId, "users", user.uid)
        await setDoc(
          userRef,
          {
            studyYear: normalizedYearId || null, // e.g., "mid1", "sec2" - THE CANONICAL SOURCE OF TRUTH
            schoolLevel: normalizedLevel || null, // e.g., "middle", "high" - the level, not the year
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        console.log(`${LOG_PREFIX} ✅ Updated user studyYear=${normalizedYearId}, schoolLevel=${normalizedLevel}`)
      } catch (e) {
        console.error(`${LOG_PREFIX} Failed to update user studyYear after annual fee submit:`, e)
      }

      console.log(`${LOG_PREFIX} Payment saved successfully!`, {
        paymentId: docRef.id,
        path: `${paymentsCollectionPath}/${docRef.id}`,
      })

      if (selectedSubjectEntries.length > 0) {
        await Promise.all(
          selectedSubjectEntries.map(async (entry) => {
            const subject = entry?.subject
            const { subjectId, subjectName } = getSubjectIdentifiers(subject)
            if (!subjectId) return

            const rawPrice = Math.round(Number(subject?.price))
            const normalizedPrice = Number.isFinite(rawPrice) ? rawPrice : 0

            try {
              await ensureSupportLessonRegistrationRecord({
                branchId: selectedBranchId,
                studentId: user.uid,
                subjectId,
                subjectName,
                yearId: normalizedYearKeyForSelection,
                yearLabel: year || normalizedYearLabels?.[0] || yearKey || null,
                metadata: {
                  feeRequired: true,
                  feePaid: true,
                  source: "annualFee",
                  extraFields: {
                    paymentId: docRef.id,
                    paymentStatus: "pending",
                    price: normalizedPrice,
                    formLevel: level || "",
                    formYear: year || "",
                    filterSignature: currentFilterSignature,
                  },
                },
              })
            } catch (error) {
              if (error?.code === "support-lesson-registration-exists") {
                return
              }
              throw error
            }
          }),
        )
      }

      // Immediately mark annual fee status as pending in global collection for real-time dashboard updates
      if (user?.uid) {
        const globalAnnualFeeRef = doc(db, "annualFees", user.uid)
        await setDoc(
          globalAnnualFeeRef,
          {
            paid: false,
            year: data.year || "",
            paidAt: null,
          },
          { merge: true },
        )
        console.log(`${LOG_PREFIX} Updated global annualFees doc to pending for user ${user.uid}`)
      }

      const submissionResult = {
        ...paymentData,
        id: docRef.id,
      }

      let formClosed = false
      if (onClose) {
        try {
          console.log(`${LOG_PREFIX} Closing form immediately after Firestore write`)
          onClose()
          formClosed = true
        } catch (closeError) {
          console.error(`${LOG_PREFIX} Error while closing form:`, closeError)
        }
      }

      if (onSubmitted) {
        try {
          console.log(`${LOG_PREFIX} Calling onSubmitted callback after close`)
          onSubmitted(submissionResult)
        } catch (callbackError) {
          console.error(`${LOG_PREFIX} onSubmitted callback threw an error:`, callbackError)
        }
      }

      const notifySuccess = () => {
        alert("تم إرسال طلب الرسوم السنوية بنجاح. سيتم مراجعته من قبل الإدارة.")
      }

      if (formClosed) {
        setTimeout(notifySuccess, 0)
      } else {
        notifySuccess()
      }

      console.log(`${LOG_PREFIX} ========== SUBMIT COMPLETED SUCCESSFULLY ==========`)
    } catch (error) {
      console.error(`${LOG_PREFIX} ========== SUBMIT FAILED ==========`)
      console.error(`${LOG_PREFIX} Error details:`, {
        error: error.message,
        errorCode: error.code,
        errorName: error.name,
        userId: user.uid,
        branchId: selectedBranchId,
        stack: error.stack,
      })

      let errorMessage = "حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى."

      if (error.code === "permission-denied") {
        errorMessage = "ليس لديك صلاحية لإرسال هذا الطلب. يرجى التواصل مع الإدارة."
      } else if (error.message) {
        errorMessage = `حدث خطأ: ${error.message}`
      }

      alert(errorMessage)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
      console.log(`${LOG_PREFIX} Submit process completed (loading=${loading})`)
    }
  }

  // Show validation error if exists
  if (validationError) {
    return (
      <div
        className={`${onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "block"}`}
        dir="rtl"
      >
        <div className="bg-white rounded-xl max-w-2xl w-full p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-8 h-8 text-red-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-700 mb-2">خطأ في التحقق</h3>
              <p className="text-gray-700">{validationError}</p>
            </div>
          </div>
          {onClose && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Right before: return (
  console.log(
    `${LOG_PREFIX} RENDER: subjects.length=${subjects.length}, registeredSubjectsCount=${registeredSubjectsCount}, loadingSubjects=${loadingSubjects}`,
  )

  return (
    <div
      className={`${onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "block"}`}
      dir="rtl"
    >
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {onClose && (
          <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
            <h2 className="text-2xl font-bold text-primary">دفع الرسوم السنوية</h2>
            <button onClick={onClose} className="text-2xl leading-none hover:text-gray-600">
              ×
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Level Selection */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-2">
              <GraduationCap className="w-4 h-4 inline ml-1" />
              المستوى الدراسي *
            </label>
            <select
              {...register("level", { required: "المستوى الدراسي مطلوب" })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">-- اختر المستوى --</option>
              <option value="ثانوي">ثانوي</option>
              <option value="متوسط">متوسط</option>
            </select>
            {errors.level && <p className="text-red-500 text-sm mt-1">{errors.level.message}</p>}
          </div>

          {/* Year Selection - Conditional */}
          {level && (
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">السنة الدراسية *</label>
              <select
                {...register("year", { required: "السنة الدراسية مطلوبة" })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">-- اختر السنة --</option>
                <option value="أولى">أولى</option>
                <option value="ثانية">ثانية</option>
                <option value="ثالثة">ثالثة</option>
                {level === "متوسط" && <option value="رابعة">رابعة</option>}
              </select>
              {errors.year && <p className="text-red-500 text-sm mt-1">{errors.year.message}</p>}
            </div>
          )}

          {/* Stream - Only for ثانوي */}
          {level === "ثانوي" && (
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">الشعبة</label>
              <input
                type="text"
                {...register("stream")}
                placeholder="مثال: رياضيات، آداب، علوم تجريبية"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          )}

          {/* School */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-2">
              <School className="w-4 h-4 inline ml-1" />
              المؤسسة التعليمية *
            </label>
            <input
              type="text"
              {...register("school", { required: "المؤسسة التعليمية مطلوبة" })}
              placeholder="اسم المدرسة أو الثانوية"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            {errors.school && <p className="text-red-500 text-sm mt-1">{errors.school.message}</p>}
          </div>

          {/* Phone Numbers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                <Phone className="w-4 h-4 inline ml-1" />
                رقم هاتف الولي *
              </label>
              <input
                type="tel"
                {...register("guardianPhone", {
                  required: "رقم هاتف الولي مطلوب",
                  pattern: {
                    value: /^[0-9]{9,10}$/,
                    message: "رقم الهاتف غير صحيح",
                  },
                })}
                placeholder="0XXXXXXXXX"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              {errors.guardianPhone && <p className="text-red-500 text-sm mt-1">{errors.guardianPhone.message}</p>}
            </div>
            <div>
              <label className="block text-lg font-medium text-gray-700 mb-2">
                <Phone className="w-4 h-4 inline ml-1" />
                رقم هاتف التلميذ
              </label>
              <input
                type="tel"
                {...register("studentPhone", {
                  pattern: {
                    value: /^[0-9]{9,10}$/,
                    message: "رقم الهاتف غير صحيح",
                  },
                })}
                placeholder="0XXXXXXXXX (اختياري)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              {errors.studentPhone && <p className="text-red-500 text-sm mt-1">{errors.studentPhone.message}</p>}
            </div>
          </div>

          {/* Subjects Selection */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-2">
              <BookOpen className="w-4 h-4 inline ml-1" />
              المواد المختارة
            </label>
            {(() => {
              console.log(`${LOG_PREFIX} RENDER DECISION:`, {
                loadingSubjects,
                subjectsLength: subjects.length,
                hasSubjects: subjects.length > 0,
                level,
                year,
                timestamp: Date.now(),
              })

              if (!hasValidSelection) {
                return (
                  <div className="rounded-lg border border-dashed border-gray-200 p-4 text-gray-600">
                    يرجى اختيار المستوى والسنة لعرض المواد المتاحة.
                  </div>
                )
              }

              // If we have subjects, show them even if loadingSubjects is true
              // This prevents the UI from getting stuck in loading state when level/year temporarily become empty
              if (subjects.length > 0) {
                console.log(`${LOG_PREFIX} -> Rendering ${subjects.length} SUBJECTS (even if loading=${loadingSubjects})`)
                return (
                  <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-4">
                    {subjectStatusList.map(({ subject, combinedKey, isBlocked, isSelected, existingRegistration, statusInfo }, index) => {
                      const isDisabled = Boolean(isBlocked)
                      const isChecked = Boolean(isBlocked || isSelected)
                      const borderClass = isBlocked ? "border-amber-300 bg-amber-50" : isSelected ? "border-primary/40 bg-primary/5" : "border-gray-200"

                      return (
                        <label
                          key={subject.id || `${subject.name}-${index}`}
                          className={`flex items-center p-3 border rounded-lg transition-colors ${
                            isDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-gray-50"
                          } ${borderClass}`}
                          title={
                            isBlocked
                              ? `هذه المادة مسجلة بالفعل (${statusInfo?.label || existingRegistration?.status || ""})`
                              : ""
                          }
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => {
                              if (!isDisabled) {
                                handleSubjectSelection(subject)
                              }
                            }}
                            className="ml-3 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                          />
                          <div className="flex-1 flex justify-between items-center">
                            <div>
                              <div className="font-medium text-gray-900 flex items-center gap-2">
                                <span>{subject.name}</span>
                              </div>
                              <div className="text-sm text-gray-600">{subject.price ?? 0} دج/شهر</div>
                              {isBlocked && statusInfo && (
                                <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs mt-1 ${statusInfo.classes}`}>
                                  {statusInfo.label}
                                </div>
                              )}
                            </div>
                            {isChecked && <CheckCircle className="w-5 h-5 text-primary" />}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )
              }

              if (loadingSubjects) {
                console.log(`${LOG_PREFIX} -> Showing LOADING message`)
                return (
                  <div className="rounded-lg border border-dashed border-gray-200 p-4 text-gray-600 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                    سيتم عرض المواد هنا فور توفرها.
                  </div>
                )
              }

              if (subjects.length === 0) {
                console.log(`${LOG_PREFIX} -> Showing NO SUBJECTS warning`)
                return (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <AlertCircle className="w-5 h-5 text-yellow-600 inline ml-2" />
                    <span className="text-yellow-800">
                      لا توجد مواد متاحة لهذا المستوى والسنة المختارة. يرجى التحقق من إعدادات الفرع أو اختيار مستوى/سنة أخرى.
                    </span>
                  </div>
                )
              }

              // This should never be reached since we check subjects.length > 0 above
              // But keeping as fallback
              console.log(`${LOG_PREFIX} -> Rendering ${subjects.length} SUBJECTS (fallback)`)
              return (
                <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-4">
                  {subjectStatusList.map(({ subject, isBlocked, isCreating, statusInfo }, index) => {
                    const isDisabled = Boolean(isBlocked || isCreating)
                    return (
                      <label
                        key={subject.id || `${subject.name}-${index}`}
                        className={`flex items-center p-3 border rounded-lg transition-colors ${
                          isDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-gray-50"
                        } ${isBlocked ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}
                      >
                        <input
                          type="checkbox"
                          checked={isBlocked}
                          disabled={isDisabled}
                          onChange={() => {
                            if (!isDisabled) {
                              handleSubjectSelection(subject)
                            }
                          }}
                          className="ml-3 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <div className="flex-1 flex justify-between items-center">
                          <div>
                            <div className="font-medium text-gray-900">{subject.name}</div>
                            <div className="text-sm text-gray-600">{subject.price ?? 0} دج/شهر</div>
                            {isBlocked && statusInfo && (
                              <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs mt-1 ${statusInfo.classes}`}>
                                {statusInfo.label}
                              </div>
                            )}
                          </div>
                          {isBlocked && <CheckCircle className="w-5 h-5 text-primary" />}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Price Summary */}
          {(registeredSubjectsCount > 0 || selectedSubjectsCount > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">ملخص الأسعار</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>الرسوم السنوية:</span>
                  <span className="font-medium">{ANNUAL_FEE} دج</span>
                </div>
                {selectedSubjectEntries.map((entry) => {
                  const subjectName = entry?.subject?.name || "مادة"
                  const rawPrice = Math.round(Number(entry?.subject?.price))
                  const price = Number.isFinite(rawPrice) ? rawPrice : 0
                  return (
                    <div key={entry.combinedKey} className="flex justify-between text-sm">
                      <span className="text-gray-600">• {subjectName}:</span>
                      <span>{price} دج/شهر</span>
                    </div>
                  )
                })}
                <div className="border-t border-blue-300 pt-2 mt-2 flex justify-between font-bold text-lg">
                  <span>المبلغ الإجمالي:</span>
                  <span className="text-primary">{totalAmount} دج</span>
                </div>
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-3">
              <CreditCard className="w-4 h-4 inline ml-1" />
              طريقة الدفع *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { value: "CCP", label: "بريد الجزائر CCP", account: "1234567890" },
                { value: "Baridimob", label: "بريدي موب BaridiMob", account: "0123456789" },
              ].map((method) => (
                <label
                  key={method.value}
                  className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-primary transition-colors"
                >
                  <input
                    type="radio"
                    value={method.value}
                    {...register("paymentMethod", { required: "طريقة الدفع مطلوبة" })}
                    className="ml-3"
                  />
                  <div>
                    <div className="font-medium">{method.label}</div>
                    <div className="text-sm text-gray-600">{method.account}</div>
                  </div>
                </label>
              ))}
            </div>
            {errors.paymentMethod && <p className="text-red-500 text-sm mt-1">{errors.paymentMethod.message}</p>}
          </div>

          {/* Receipt Upload */}
          <div>
            <label className="block text-lg font-medium text-gray-700 mb-2">
              <Upload className="w-4 h-4 inline ml-1" />
              صورة إيصال الدفع * (JPG/PNG &lt; 10MB)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
              {receipt ? (
                <div>
                  <img
                    src={URL.createObjectURL(receipt) || "/placeholder.svg"}
                    alt="Receipt"
                    className="max-w-full h-48 object-contain mx-auto mb-4 rounded"
                  />
                  <p className="text-green-600 font-medium">{receipt.name}</p>
                  <button
                    type="button"
                    onClick={() => setReceipt(null)}
                    className="text-red-500 text-sm mt-2 hover:underline"
                  >
                    إزالة الصورة
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">اضغط لرفع صورة الإيصال</p>
                  <p className="text-sm text-gray-500">JPG, PNG أقل من 10MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleReceiptUpload(e.target.files?.[0])}
                className="hidden"
                id="annual-receipt"
              />
              <label
                htmlFor="annual-receipt"
                className="cursor-pointer inline-block mt-4 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
              >
                اختيار صورة
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-4 space-x-reverse pt-4 border-t border-gray-200">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                إلغاء
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !receipt}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "جاري الإرسال..." : "إرسال"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AnnualFeeForm