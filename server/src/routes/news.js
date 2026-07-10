/** GET /api/news?tag=&limit= — danh sách tin tức (map category DB -> tag frontend) */
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const CAT_TO_TAG = { security: 'an_ninh', warning: 'canh_giac', guide: 'thu_tuc', document: 'van_ban' };
const TAG_TO_CAT = { an_ninh: 'security', canh_giac: 'warning', thu_tuc: 'guide', van_ban: 'document' };

router.get('/', async (req, res) => {
  const { tag, limit } = req.query;
  try {
    let sql =
      `SELECT id, title, summary, category, image_url, source_name, source_url, published_at
       FROM news WHERE is_published = TRUE`;
    const params = [];
    if (tag && tag !== 'all' && TAG_TO_CAT[tag]) {
      sql += ' AND category = ?';
      params.push(TAG_TO_CAT[tag]);
    }
    sql += ' ORDER BY published_at DESC';
    if (limit) {
      sql += ' LIMIT ?';
      params.push(Number(limit));
    }
    const [rows] = await pool.query(sql, params);

    res.json(
      rows.map((n) => ({
        id: String(n.id),
        title: n.title,
        summary: n.summary,
        thumbnail: n.image_url || `https://picsum.photos/seed/htans${n.id}/640/400`,
        publishedAt: n.published_at,
        tag: CAT_TO_TAG[n.category] || 'an_ninh',
        externalUrl: n.source_url || '#',
        source: n.source_name || '',
      }))
    );
  } catch (err) {
    console.error('Lỗi tin tức:', err);
    res.status(500).json({ error: 'Lỗi máy chủ khi tải tin tức.' });
  }
});

export default router;
