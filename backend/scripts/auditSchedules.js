/**
 * auditSchedules.js — historical schedule-conflict diagnostic
 * -----------------------------------------------------------
 * Read-only sweep of the ENTIRE database (all branches) that reports every
 * scheduling problem the live guards now prevent, but which may already exist
 * in historical data:
 *
 *   1. Teacher conflicts          (same teacher, overlapping time)
 *   2. Classroom conflicts        (same room, overlapping time)
 *   3. Student conflicts          (same student enrolled in overlapping classes)
 *   4. Duplicate schedules        (identical day+start+end rows in one class)
 *   5. Duplicate teacher slots     (same teacher, EXACT same day+time, 2+ classes)
 *   6. Invalid time ranges        (missing/unparseable times, start >= end)
 *   7. Orphaned schedule records  (registration → a classId that no longer exists)
 *
 * Usage (from backend/):
 *   node scripts/auditSchedules.js                 # human-readable report
 *   node scripts/auditSchedules.js --json out.json # also write machine report
 *   node scripts/auditSchedules.js --branch <id>   # restrict to one branch
 *
 * Requires the same service-account credentials as the server (config/firebase).
 * It NEVER writes — safe to run against production.
 */

/* eslint-disable no-console */
const fs = require('fs');
const { db } = require('../config/firebase');
const {
  rowsConflict,
  findOverlappingRows,
  normalizeName,
  timeToMinutes,
} = require('../services/scheduleConflictService');

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonPath = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const branchIdx = args.indexOf('--branch');
const onlyBranch = branchIdx >= 0 ? args[branchIdx + 1] : null;

const rowKey = (r) => `${normalizeName(r.day)}|${String(r.start || '').trim()}|${String(r.end || '').trim()}`;
const fmtRow = (r) => `${r.day} ${r.start}-${r.end}`;

async function getActiveSupportByBranch() {
  // One pass over the global support collection, grouped by branch + user.
  const snap = await db.collection('supportLessonRegistrations').get();
  const now = new Date();
  const byBranch = {};
  snap.forEach((d) => {
    const x = d.data() || {};
    if (String(x.status || '').toLowerCase() !== 'verified') return;
    const end = x.endDate && x.endDate.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
    if (end && end <= now) return;
    if (!x.branchId) return;
    (byBranch[x.branchId] = byBranch[x.branchId] || []).push({ id: d.id, ...x });
  });
  return byBranch;
}

async function auditBranch(branchId, supportRegs) {
  const report = {
    branchId,
    teacherConflicts: [],
    classroomConflicts: [],
    studentConflicts: [],
    duplicateSchedules: [],
    duplicateTeacherSlots: [],
    invalidTimeRanges: [],
    orphanedRecords: [],
  };

  const branchRef = db.collection('branches').doc(branchId);
  const classesSnap = await branchRef.collection('classes').get();
  const classes = classesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const classIds = new Set(classes.map((c) => c.id));
  const activeClasses = classes.filter((c) => (c.status || 'active') === 'active');

  // ── 4 + 6: per-class duplicate rows & invalid ranges ──────────────────────
  classes.forEach((c) => {
    const seen = new Map();
    (Array.isArray(c.schedules) ? c.schedules : []).forEach((r, idx) => {
      const s = timeToMinutes(r.start);
      const e = timeToMinutes(r.end);
      if (!normalizeName(r.day) || s == null || e == null || s >= e) {
        report.invalidTimeRanges.push({
          collection: 'classes', docId: c.id, entity: `${c.teacherName || '—'} · ${c.groupName || '—'}`,
          row: fmtRow(r), reason: !normalizeName(r.day) ? 'missing day'
            : (s == null || e == null) ? 'unparseable time' : 'start >= end',
        });
        return;
      }
      const k = rowKey(r);
      if (seen.has(k)) {
        report.duplicateSchedules.push({
          collection: 'classes', docId: c.id, entity: `${c.teacherName || '—'} · ${c.groupName || '—'}`,
          row: fmtRow(r), reason: `duplicate of row #${seen.get(k)}`,
        });
      } else { seen.set(k, idx); }
    });
  });

  // ── 1 + 5: teacher conflicts & exact-duplicate teacher slots ──────────────
  const byTeacher = {};
  activeClasses.forEach((c) => {
    const t = normalizeName(c.teacherName);
    if (t) (byTeacher[t] = byTeacher[t] || []).push(c);
  });
  Object.values(byTeacher).forEach((group) => {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        findOverlappingRows(group[i].schedules, group[j].schedules).forEach(({ a, b }) => {
          const exact = rowKey(a) === rowKey(b);
          const entry = {
            collection: 'classes', teacher: group[i].teacherName,
            classA: { docId: group[i].id, group: group[i].groupName, slot: fmtRow(a) },
            classB: { docId: group[j].id, group: group[j].groupName, slot: fmtRow(b) },
            reason: `${group[i].teacherName} double-booked ${fmtRow(a)} ↔ ${fmtRow(b)}`,
          };
          report.teacherConflicts.push(entry);
          if (exact) report.duplicateTeacherSlots.push(entry);
        });
      }
    }
  });

  // ── 2: classroom conflicts ────────────────────────────────────────────────
  const byRoom = {};
  activeClasses.forEach((c) => {
    const r = normalizeName(c.classroom);
    if (r) (byRoom[r] = byRoom[r] || []).push(c);
  });
  Object.values(byRoom).forEach((group) => {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        findOverlappingRows(group[i].schedules, group[j].schedules).forEach(({ a, b }) => {
          report.classroomConflicts.push({
            collection: 'classes', classroom: group[i].classroom,
            classA: { docId: group[i].id, group: group[i].groupName, slot: fmtRow(a) },
            classB: { docId: group[j].id, group: group[j].groupName, slot: fmtRow(b) },
            reason: `Room ${group[i].classroom} double-booked ${fmtRow(a)} ↔ ${fmtRow(b)}`,
          });
        });
      }
    }
  });

  // ── Gather all registrations (for 3 + 7) ──────────────────────────────────
  const [langSnap, trainSnap] = await Promise.all([
    branchRef.collection('languagesRegistered').get(),
    branchRef.collection('trainingsRegistered').get(),
  ]);
  const regs = [];
  const collect = (snap, coll) => snap.forEach((d) => {
    const x = d.data() || {};
    regs.push({
      coll, docId: d.id, userId: x.userId || null,
      studentName: x.studentName || x.userName || x.userEmail || x.userId || '—',
      classId: x.classId || x.lessonId || null,
      groupName: x.groupName || x.subjectName || x.languageName || x.trainingName || '—',
      schedules: Array.isArray(x.schedules) ? x.schedules : [],
    });
  });
  collect(langSnap, 'languagesRegistered');
  collect(trainSnap, 'trainingsRegistered');
  (supportRegs || []).forEach((x) => regs.push({
    coll: 'supportLessonRegistrations', docId: x.id, userId: x.userId || null,
    studentName: x.userName || x.studentName || x.userId || '—',
    classId: x.classId || x.lessonId || null,
    groupName: x.groupName || x.subjectName || x.lessonName || '—',
    schedules: Array.isArray(x.schedules) ? x.schedules : [],
  }));

  // ── 7: orphaned records (classId no longer exists) ────────────────────────
  regs.forEach((r) => {
    if (r.classId && !classIds.has(r.classId)) {
      report.orphanedRecords.push({
        collection: r.coll, docId: r.docId, entity: r.studentName,
        reason: `classId "${r.classId}" not found in branch classes`,
      });
    }
  });

  // ── 3: student conflicts (overlap across the student's own enrolments) ────
  const byUser = {};
  regs.forEach((r) => { if (r.userId) (byUser[r.userId] = byUser[r.userId] || []).push(r); });
  Object.values(byUser).forEach((list) => {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (list[i].classId && list[i].classId === list[j].classId) continue; // same class
        findOverlappingRows(list[i].schedules, list[j].schedules).forEach(({ a, b }) => {
          report.studentConflicts.push({
            collection: `${list[i].coll} ↔ ${list[j].coll}`,
            student: list[i].studentName, userId: list[i].userId,
            classA: { docId: list[i].docId, group: list[i].groupName, slot: fmtRow(a) },
            classB: { docId: list[j].docId, group: list[j].groupName, slot: fmtRow(b) },
            reason: `${list[i].studentName} enrolled in overlapping ${fmtRow(a)} ↔ ${fmtRow(b)}`,
          });
        });
      }
    }
  });

  return report;
}

function countAll(r) {
  return r.teacherConflicts.length + r.classroomConflicts.length + r.studentConflicts.length
    + r.duplicateSchedules.length + r.duplicateTeacherSlots.length
    + r.invalidTimeRanges.length + r.orphanedRecords.length;
}

function printReport(r) {
  const total = countAll(r);
  console.log(`\n━━━ Branch ${r.branchId} — ${total} issue(s) ━━━`);
  const section = (title, items, fmt) => {
    console.log(`\n  ${title}: ${items.length}`);
    items.slice(0, 50).forEach((it) => console.log(`    • ${fmt(it)}`));
    if (items.length > 50) console.log(`    … ${items.length - 50} more`);
  };
  section('1. Teacher conflicts', r.teacherConflicts, (x) =>
    `${x.teacher}: [${x.classA.docId} ${x.classA.slot}] ↔ [${x.classB.docId} ${x.classB.slot}]`);
  section('2. Classroom conflicts', r.classroomConflicts, (x) =>
    `${x.classroom}: [${x.classA.docId} ${x.classA.slot}] ↔ [${x.classB.docId} ${x.classB.slot}]`);
  section('3. Student conflicts', r.studentConflicts, (x) =>
    `${x.student}: [${x.classA.group} ${x.classA.slot}] ↔ [${x.classB.group} ${x.classB.slot}]`);
  section('4. Duplicate schedules', r.duplicateSchedules, (x) => `${x.docId} ${x.entity}: ${x.row} (${x.reason})`);
  section('5. Duplicate teacher slots', r.duplicateTeacherSlots, (x) =>
    `${x.teacher}: ${x.classA.docId} ↔ ${x.classB.docId} @ ${x.classA.slot}`);
  section('6. Invalid time ranges', r.invalidTimeRanges, (x) => `${x.docId} ${x.entity}: ${x.row} (${x.reason})`);
  section('7. Orphaned records', r.orphanedRecords, (x) => `${x.collection}/${x.docId} ${x.entity}: ${x.reason}`);
}

(async () => {
  try {
    console.log('Schedule audit — scanning…');
    const supportByBranch = await getActiveSupportByBranch();

    let branchIds;
    if (onlyBranch) {
      branchIds = [onlyBranch];
    } else {
      const snap = await db.collection('branches').get();
      branchIds = snap.docs.map((d) => d.id);
    }

    const reports = [];
    let grandTotal = 0;
    for (const branchId of branchIds) {
      // eslint-disable-next-line no-await-in-loop
      const r = await auditBranch(branchId, supportByBranch[branchId] || []);
      reports.push(r);
      grandTotal += countAll(r);
      printReport(r);
    }

    console.log(`\n════════════════════════════════════════`);
    console.log(`TOTAL ISSUES ACROSS ${branchIds.length} BRANCH(ES): ${grandTotal}`);
    console.log(`════════════════════════════════════════\n`);

    if (jsonPath) {
      fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), grandTotal, reports }, null, 2));
      console.log(`Machine-readable report written to ${jsonPath}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Audit failed:', err);
    process.exit(1);
  }
})();
