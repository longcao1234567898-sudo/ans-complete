/** Gom toàn bộ route quản trị dưới /api/admin */
import { Router } from 'express';
import submissionsRouter from './submissions.js';
import dashboardRouter from './dashboard.js';
import bannedWordsRouter from './banned-words.js';

const router = Router();
router.use('/submissions', submissionsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/banned-words', bannedWordsRouter);

export default router;
