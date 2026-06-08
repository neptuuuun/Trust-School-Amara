/**
 * Admin · Languages catalog (دورات اللغات)
 *
 * New Subject → Class → Schedule model. Each Subject is a language; each Class
 * is a joinable group (teacher · group · schedules · capacity · price). The
 * class form surfaces an optional CEFR level. Fully branch-isolated.
 *
 * All catalog logic lives in the reusable SubjectClassManager so the three
 * services (language | training | support) stay consistent.
 */

import React from 'react';
import SubjectClassManager from '../components/SubjectClassManager';

const LanguagesPage = () => <SubjectClassManager serviceType="language" />;

export default LanguagesPage;
