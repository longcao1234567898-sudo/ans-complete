/** Gom toàn bộ route quản trị dưới /api/admin */
import { Router } from 'express';
import submissionsRouter from './submissions.js';
import dashboardRouter from './dashboard.js';
import bannedWordsRouter from './banned-words.js';
import staffRouter from './staff.js';
import reportsRouter from './reports.js';

const router = Router();
router.use('/submissions', submissionsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/banned-words', bannedWordsRouter);
router.use('/staff', staffRouter);
router.use('/reports', reportsRouter);

export default router;
