/**
 * Gom toàn bộ route quản trị dưới /api/admin
 *
 * 🔒 CHẶN XÁC THỰC TẠI ĐÂY — TUYẾN PHÒNG THỦ CHÍNH
 *
 * Trước đây mỗi router con tự gọi requireAuth. Cách đó phụ thuộc vào việc
 * người viết KHÔNG QUÊN. Và đã quên thật: trash.js và kiosk.js import
 * requireAuth nhưng không bao giờ gọi, trong khi chú thích đầu file vẫn ghi
 * "Route nằm sau requireAuth". Hậu quả:
 *
 *   GET    /api/admin/trash          bất kỳ ai đọc được toàn bộ tin báo đã xoá,
 *                                    kèm danh tính người tố giác
 *   DELETE /api/admin/trash          bất kỳ ai xoá sạch vĩnh viễn thùng rác
 *   POST   /api/admin/kiosk/submit   bất kỳ ai chèn tin báo giả vào hệ thống
 *
 * Nay chặn ngay tại chỗ gắn router: MỌI đường dẫn dưới /api/admin đều phải
 * qua requireAuth, kể cả router thêm mới sau này. Quên gắn ở file con cũng
 * không còn hở.
 */
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import submissionsRouter from './submissions.js';
import dashboardRouter from './dashboard.js';
import bannedWordsRouter from './banned-words.js';
import staffRouter from './staff.js';
import reportsRouter from './reports.js';
import logsRouter from './logs.js';
import kioskRouter from './kiosk.js';
import trashRouter from './trash.js';

const router = Router();

/* ĐẶT TRƯỚC MỌI router con — thứ tự này quan trọng.
   Express chạy middleware theo đúng thứ tự khai báo. */
router.use(requireAuth);

router.use('/submissions', submissionsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/banned-words', bannedWordsRouter);
router.use('/staff', staffRouter);
router.use('/reports', reportsRouter);
router.use('/logs', logsRouter);
router.use('/kiosk', kioskRouter);
router.use('/trash', trashRouter);

export default router;
