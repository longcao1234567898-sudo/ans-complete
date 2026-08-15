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
      `SELECT id, title, summary, category, image_url, source_name, source_url, published_at,
              /* Cột do nang_cap_v13.sql thêm. COALESCE để database chưa nâng
                 cấp thì coi như không có bài nào được chọn — trang vẫn chạy,
                 chỉ là quay về cách cũ (bài mới nhất làm tin nổi bật). */
              COALESCE(is_featured, 0) AS is_featured
       FROM news WHERE is_published = TRUE`;
    const params = [];
    if (tag && tag !== 'all' && TAG_TO_CAT[tag]) {
      sql += ' AND category = ?';
      params.push(TAG_TO_CAT[tag]);
    }
    /* LIMIT là KHÔNG ĐIỀU KIỆN — luôn nối vào câu lệnh.
       Bản trước chỉ thêm LIMIT khi client có gửi ?limit=, nên gọi trần
       /api/news là kéo cả bảng tin tức về trong một lời gọi. Endpoint này
       công khai, không cần đăng nhập, nên đó là đường làm nghẽn máy chủ
       rẻ nhất mà ai cũng gọi được. */
    const MAX_LIMIT = 100;
    const soYeuCau = Number(limit);
    const soLay = Number.isFinite(soYeuCau) && soYeuCau > 0
      ? Math.min(Math.floor(soYeuCau), MAX_LIMIT)
      : MAX_LIMIT;
    /* Tin nổi bật lên ĐẦU, rồi mới tới bài mới nhất.
       Chưa chọn bài nào thì mọi bài đều is_featured = 0, thứ tự y như cũ. */
    sql += ' ORDER BY COALESCE(is_featured, 0) DESC, published_at DESC LIMIT ?';
    params.push(soLay);
    const [rows] = await pool.query(sql, params);

    res.json(
      rows.map((n) => ({
        id: String(n.id),
        title: n.title,
        summary: n.summary,
        /* ------------------------------------------------------------------
           BÀI KHÔNG CÓ ẢNH -> TRẢ VỀ RỖNG, KHÔNG LẤY ẢNH NGẪU NHIÊN

           Trước đây thiếu ảnh thì lấy một tấm ngẫu nhiên từ dịch vụ ảnh mẫu.
           Kết quả trên trang thật: tin "Cảnh giác chiêu trò việc nhẹ lương
           cao" hiện ảnh ngọn núi tuyết, tin "Hướng dẫn đăng ký cư trú" hiện
           ảnh cầu Brooklyn ban đêm. Ảnh chẳng liên quan gì tới nội dung, mà
           bà con lại tưởng đó là ảnh của vụ việc.

           Trả rỗng thì giao diện tự vẽ khối nền theo đúng CHỦ ĐỀ của bài
           (an ninh, cảnh giác, thủ tục, văn bản) — nhìn ra ngay loại tin, và
           không bịa ra hình ảnh không có thật.

           Muốn có ảnh thật: đặt đường dẫn vào cột image_url của bảng news.
           ------------------------------------------------------------------ */
        thumbnail: n.image_url || '',
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
