/** GET /api/tracking/:code — tra cứu tiến độ theo mã, trả về đúng cấu trúc frontend cần */
import { Router } from 'express';
import { pool } from '../db.js';
import { STATUS_LABEL } from '../lib/helpers.js';

const router = Router();

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã tra cứu phải gồm 6 ký tự.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT s.tracking_code, s.original_content, s.ai_processed_content,
              c.code AS category_code, s.status, s.rejection_reason, s.created_at
       FROM submissions s LEFT JOIN categories c ON s.category_id = c.id
       WHERE s.tracking_code = ?`,
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy mã tra cứu. Vui lòng kiểm tra lại 6 ký tự trên phiếu tiếp nhận.' });
    }
    const s = rows[0];

    const [history] = await pool.query(
      `SELECT old_status, new_status, note, changed_at
       FROM status_history h JOIN submissions sub ON sub.id = h.submission_id
       WHERE sub.tracking_code = ? ORDER BY h.changed_at ASC`,
      [code]
    );

    // Dựng timeline: các bước đã xảy ra (done) + các bước tương lai (chưa done)
    const doneSteps = history.map((h) => ({
      status: h.new_status,
      label: STATUS_LABEL[h.new_status],
      timestamp: h.changed_at,
      note: h.note || undefined,
      done: true,
    }));
    const flow = ['received', 'processing', 'resolved'];
    const steps = [...doneSteps];
    if (s.status !== 'rejected') {
      const reachedIdx = flow.indexOf(s.status);
      for (let i = reachedIdx + 1; i < flow.length; i++) {
        steps.push({ status: flow[i], label: STATUS_LABEL[flow[i]], timestamp: '', done: false });
      }
    }

    res.json({
      code: s.tracking_code,
      status: s.status,
      category: s.category_code,
      summary: s.ai_processed_content || s.original_content,
      createdAt: s.created_at,
      steps,
      rejectionReason: s.rejection_reason || undefined,
    });
  } catch (err) {
    console.error('Lỗi tra cứu:', err);
    res.status(500).json({ error: 'Lỗi máy chủ khi tra cứu.' });
  }
});

export default router;
