/**
 * Hard-coded Study Levels and Years Structure
 * 
 * This file defines the fixed structure of study levels and years that must
 * ALWAYS appear on the main website, even if there are zero lessons.
 * 
 * This ensures a consistent user experience regardless of Firestore data.
 */

export const STUDY_LEVELS = [
  {
    id: 'middle',
    name: 'التعليم المتوسط',
    nameEn: 'Middle School',
    years: [
      {
        id: 'mid1',
        name: 'السنة الأولى متوسط',
        nameShort: 'أولى متوسط',
        number: 1
      },
      {
        id: 'mid2',
        name: 'السنة الثانية متوسط',
        nameShort: 'ثانية متوسط',
        number: 2
      },
      {
        id: 'mid3',
        name: 'السنة الثالثة متوسط',
        nameShort: 'ثالثة متوسط',
        number: 3
      },
      {
        id: 'mid4',
        name: 'السنة الرابعة متوسط',
        nameShort: 'رابعة متوسط',
        number: 4
      }
    ]
  },
  {
    id: 'high',
    name: 'التعليم الثانوي',
    nameEn: 'High School',
    years: [
      {
        id: 'sec1',
        name: 'السنة الأولى ثانوي',
        nameShort: 'أولى ثانوي',
        number: 1
      },
      {
        id: 'sec2',
        name: 'السنة الثانية ثانوي',
        nameShort: 'ثانية ثانوي',
        number: 2
      },
      {
        id: 'sec3',
        name: 'السنة الثالثة ثانوي',
        nameShort: 'ثالثة ثانوي',
        number: 3
      }
    ]
  }
];

const buildStudyLevelLabelMap = () => {
  const mapping = {};
  for (const level of STUDY_LEVELS) {
    for (const year of level.years) {
      if (year.nameShort) {
        mapping[year.nameShort] = year.id;
      }
      if (year.name) {
        mapping[year.name] = year.id;
      }
    }
  }
  return mapping;
};

/**
 * Map of Arabic study level labels to their machine-readable year codes.
 * Example: "ثالثة ثانوي" -> "sec3"
 */
export const STUDY_LEVEL_LABEL_TO_YEAR = buildStudyLevelLabelMap();

/**
 * Convert a study level label (Arabic) to its year code (e.g. "sec3").
 * @param {string} label
 * @returns {string|null}
 */
export const getYearIdFromLabel = (label) => {
  if (!label) return null;
  const normalizedLabel = label.trim();
  return STUDY_LEVEL_LABEL_TO_YEAR[normalizedLabel] || null;
};

/**
 * Get a level by its ID
 * @param {string} levelId - 'middle' or 'high'
 * @returns {object|null} The level object or null if not found
 */
export const getLevelById = (levelId) => {
  return STUDY_LEVELS.find(level => level.id === levelId) || null;
};

/**
 * Get a year by its ID
 * @param {string} yearId - e.g. 'mid1', 'sec2'
 * @returns {object|null} The year object with level info or null if not found
 */
export const getYearById = (yearId) => {
  for (const level of STUDY_LEVELS) {
    const year = level.years.find(y => y.id === yearId);
    if (year) {
      return {
        ...year,
        level: level
      };
    }
  }
  return null;
};

/**
 * Get all label variants that represent a given year ID.
 * Returns an array like ['أولى ثانوي', 'السنة الأولى ثانوي'].
 * @param {string} yearId
 * @returns {string[]} Array of normalized (trimmed) labels
 */
export const getYearLabels = (yearId) => {
  const year = getYearById(yearId);
  if (!year) return [];
  const labels = [];
  if (year.nameShort) labels.push(year.nameShort.trim());
  if (year.name) labels.push(year.name.trim());
  return labels;
};

/**
 * Get all years for a specific level
 * @param {string} levelId - 'middle' or 'high'
 * @returns {array} Array of year objects
 */
export const getYearsByLevel = (levelId) => {
  const level = getLevelById(levelId);
  return level ? level.years : [];
};

/**
 * Convert grade ID to level ID
 * @param {string} gradeId - e.g. 'mid1', 'sec2'
 * @returns {string|null} 'middle', 'high', or null
 */
export const gradeToLevel = (gradeId) => {
  if (!gradeId) return null;
  if (gradeId.startsWith('mid')) return 'middle';
  if (gradeId.startsWith('sec')) return 'high';
  return null;
};

/**
 * Check if a grade ID is valid
 * @param {string} gradeId - The grade ID to check
 * @returns {boolean} True if valid
 */
export const isValidGrade = (gradeId) => {
  return getYearById(gradeId) !== null;
};

export default STUDY_LEVELS;

