/**
 * Admin · Training courses catalog (الدورات التكوينية)
 *
 * New Subject → Class → Schedule model. Each Subject is a training program;
 * each Class is a joinable group (trainer · group · schedules · capacity · price).
 * Fully branch-isolated. All catalog logic lives in the reusable
 * SubjectClassManager so the three services stay consistent.
 *
 * NOTE: the separate "custom training request" lead-gen flow (طلبات الدورات
 * التكوينية) is unaffected and still lives on TrainingRequestsPage.
 */

import React from 'react';
import SubjectClassManager from '../components/SubjectClassManager';

const TrainingsPage = () => <SubjectClassManager serviceType="training" />;

export default TrainingsPage;
