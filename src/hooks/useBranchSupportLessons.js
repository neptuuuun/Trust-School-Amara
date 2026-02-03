import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { gradeToLevel, getYearIdFromLabel, getYearLabels } from '../data/studyLevels';

/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} name
 * @property {string} subject
 * @property {string} level - 'middle' | 'high'
 * @property {string} studyLevel - Arabic label used for display
 * @property {string} year - Machine-readable code (mid1, sec3, ...)
 * @property {string} grade - Legacy field kept for compatibility
 * @property {Array<{day: string, start: string, end: string}>} times
 * @property {number|Date} createdAt
 */

/**
 * useBranchSupportLessons hook
 *
 * Listens in real-time to `branches/{branchId}/supportLessons` and returns the lessons
 * for the requested branch only. Each branch page should call this hook with the
 * currently selected `branchId` so we never mix lessons from other branches.
 *
 * ✅ FIXED ISSUES:
 * 1. No Firestore composite index required - removed orderBy from query, sorts in JavaScript
 * 2. Graceful handling of missing branchId - doesn't throw errors, just waits
 * 3. Always returns structured state - even when empty, returns { lessons: [], loading: false }
 *
 * Supports optional filtering by level and year.
 * Handles multiple time slots per lesson (times array).
 *
 * Integration guide:
 *   const { lessons, loading, error } = useBranchSupportLessons(branchId);
 *   const { lessons, loading, error } = useBranchSupportLessons(branchId, 'middle', 'mid1');
 *   - `branchId` must be the active branch slug/id (e.g. from BranchContext or route)
 *   - `level` (optional): 'middle' or 'high' to filter by level
 *   - `year` (optional): 'mid1', 'sec2', etc. to filter by specific year
 *   - Call inside components rendered per-branch so the listener is scoped correctly
 */
export function useBranchSupportLessons(branchId, level = null, year = null) {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // ✅ FIX #2: Loading guard for missing branchId
    // When BranchContext finishes loading after component mounts, branchId might be null initially.
    // This is NOT an error - just wait for it to be ready.
    if (!branchId) {
      console.log('[useBranchSupportLessons] Branch not ready yet, waiting...');
      setLessons([]);
      setLoading(false); // Set loading to false so UI doesn't show spinner forever
      setError(null); // Clear any previous errors
      return; // Don't attach listener until branchId is available
    }

    console.log('[useBranchSupportLessons] Branch ID:', branchId);
    console.log('[useBranchSupportLessons] Level filter:', level);
    console.log('[useBranchSupportLessons] Year filter:', year);
    console.log('[useBranchSupportLessons] Firestore path: branches/' + branchId + '/supportLessons');

    setLoading(true);
    setError(null);

    const lessonsRef = collection(db, 'branches', branchId, 'supportLessons');
    const lessonsQuery = query(lessonsRef);

    // Subscribe to real-time updates for JUST this branch.
    const yearLabelMatches = year ? getYearLabels(year) : [];

    const unsubscribe = onSnapshot(
      lessonsQuery,
      (snapshot) => {
        // Map Firestore documents to lesson objects
        let nextLessons = snapshot.docs.map((doc) => {
          const data = doc.data();

          // Normalize createdAt timestamp
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : data.createdAt instanceof Date
            ? data.createdAt
            : data.createdAt
            ? new Date(data.createdAt)
            : new Date(0); // Fallback to epoch if missing

          // Normalize times field - support both old single timing and new multiple times
          let times = [];
          if (data.times && Array.isArray(data.times)) {
            // New format: times array
            times = data.times;
          } else if (data.timings && Array.isArray(data.timings)) {
            // Alternative format: timings array
            times = data.timings;
          } else if (data.dayOfWeek || data.day || data.startTime || data.start || data.endTime || data.end) {
            // Old format: single timing fields
            times = [{
              day: data.dayOfWeek || data.day || '',
              start: data.startTime || data.start || '',
              end: data.endTime || data.end || ''
            }];
          }

          const normalizedYear = data.studyYear || data.year || data.grade || getYearIdFromLabel(data.studyLevel || '');
          const normalizedStudyLabel = data.studyLevel || '';


          // Derive level from year/grade if not present
          const lessonLevel = data.level || gradeToLevel(normalizedYear || data.grade);

          return {
            id: doc.id,
            ...data,
            studyLevel: normalizedStudyLabel || data.studyLevel || '',
            year: normalizedYear || '',
            grade: data.grade || normalizedYear || '',
            level: lessonLevel,
            times: times, // Normalized times array
            createdAt,
          };
        });

        // ✅ FIX #1: Sort in JavaScript by createdAt (descending) instead of using Firestore orderBy
        // This avoids the composite index requirement
        nextLessons.sort((a, b) => {
          const aTime = a.createdAt?.getTime?.() || a.createdAt || 0;
          const bTime = b.createdAt?.getTime?.() || b.createdAt || 0;
          return bTime - aTime; // Descending order (newest first)
        });

        // Apply level filter if provided
        if (level) {
          nextLessons = nextLessons.filter(lesson => {
            const lessonLevel = lesson.level || gradeToLevel(lesson.year || lesson.grade);
            return lessonLevel === level;
          });
        }

        // Apply year filter client-side to support legacy documents without the `year` field
        if (year) {
          nextLessons = nextLessons.filter(lesson => {
            const lessonYear = lesson.year || lesson.grade || getYearIdFromLabel(lesson.studyLevel);
            if (lessonYear) {
              return lessonYear === year;
            }
            const normalizedStudyLabel = (lesson.studyLevel || '').trim();
            return normalizedStudyLabel && yearLabelMatches.includes(normalizedStudyLabel);
          });
        }

        console.log('[useBranchSupportLessons] Fetched lessons:', nextLessons.length, 'lessons for branch', branchId);
        if (level || year) {
          console.log('[useBranchSupportLessons] Filtered by level:', level, 'year:', year);
        }

        // ✅ FIX #3: Always set structured state, even if empty
        setLessons(nextLessons);
        setLoading(false);
        setError(null); // Clear any previous errors on successful fetch
      },
      (snapshotError) => {
        // Only log actual Firestore errors, not missing branchId (handled above)
        console.error('[useBranchSupportLessons] Failed to fetch branch support lessons:', snapshotError);
        console.error('[useBranchSupportLessons] Branch ID was:', branchId);
        setError(snapshotError);
        // ✅ FIX #3: Always return structured state even on error
        setLessons([]);
        setLoading(false);
      }
    );

    // Clean up the snapshot listener when the branch changes/unmounts.
    return () => {
      console.log('[useBranchSupportLessons] Cleaning up listener for branch:', branchId);
      unsubscribe();
    };
  }, [branchId, level, year]);

  // ✅ FIX #3: Always return structured state
  // This ensures components always receive { lessons: [], loading: false } even when empty
  return { lessons, loading, error };
}

export default useBranchSupportLessons;
