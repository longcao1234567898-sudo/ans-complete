/**
 * NHẬT KÝ HỆ THỐNG — ai làm gì, lúc nào, từ IP nào (ADR-003 việc 9).
 * Đặc biệt quan trọng: theo dõi các lượt XEM DANH TÍNH người tố giác
 * để chống cán bộ lạm dụng quyền.
 *
 * Chỉ lãnh đạo mở được. Không còn ai đứng trên lãnh đạo, nên lãnh đạo kiểm lẫn
 * nhau qua chính nhật ký này: MỖI LẦN MỞ và MỖI LẦN XUẤT nhật ký cũng được ghi,
 * ghi TRƯỚC khi trả dữ liệu — ghi không được thì không trả (ghiNhatKyTruoc).
 * Nhật ký chỉ ghi thêm, không sửa xoá được (database/nang_cap_v27.sql).
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { LANH_DAO } from '../../lib/vai-tro.js';
import { ghiNhatKyTruoc } from '../../lib/helpers.js';
import {
  NHOM_NHAT_KY, MOI_HANH_DONG, tenHanhDong, hanhDongCuaNhom,
} from '../../lib/danh-muc-nhat-ky.js';

const router = Router();
router.use(requireAuth);
router.use(authorize(...LANH_DAO)); // chỉ lãnh đạo được xem nhật ký

/** Khoảng ngày dài nhất cho thống kê và xuất file — đủ một quý */
const NGAY_TOI_DA = 92;
/** Số dòng tối đa một tệp xuất */
const DONG_XUAT_TOI_DA = 10_000;

const DANG_NGAY = /^\d{4}-\d{2}-\d{2}$/;
function docNgay(chuoi) {
  if (!DANG_NGAY.test(String(chuoi))) return null;
  const d = new Date(`${chuoi}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== chuoi ? null : d;
}
const ngaySau = (d) => new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
const ngayTruoc = (soNgay) => new Date(Date.now() - soNgay * 86_400_000).toISOString().slice(0, 10);

/**
 * Đọc bộ lọc từ query. Mọi giá trị đi qua allow-list (luật 5): nhóm và mã
 * hành động phải có trong danh mục, ngày đúng dạng, cán bộ là số nguyên.
 * @returns {{ loi?: string, where: string[], params: any[], boLoc: object, tu?: Date, den?: Date }}
 */
function docBoLoc(q, { batBuocKhoang = false } = {}) {
  const where = [];
  const params = [];
  const boLoc = {};

  if (q.nhom) {
    const ds = hanhDongCuaNhom(String(q.nhom));
    if (!ds) return { loi: 'Nhóm nhật ký không hợp lệ.' };
    where.push(`l.action IN (${ds.map(() => '?').join(',')})`);
    params.push(...ds);
    boLoc.nhom = String(q.nhom);
  }
  if (q.action) {
    if (!MOI_HANH_DONG.includes(String(q.action))) return { loi: 'Loại hoạt động không hợp lệ.' };
    where.push('l.action = ?');
    params.push(String(q.action));
    boLoc.action = String(q.action);
  }
  if (q.staffId) {
    const id = Number(q.staffId);
    if (!Number.isInteger(id) || id <= 0) return { loi: 'Cán bộ không hợp lệ.' };
    where.push('l.staff_id = ?');
    params.push(id);
    boLoc.staffId = id;
  }

  const coTu = q.tu != null && q.tu !== '';
  const coDen = q.den != null && q.den !== '';
  let tu = coTu ? docNgay(q.tu) : null;
  let den = coDen ? docNgay(q.den) : null;
  if ((coTu && !tu) || (coDen && !den)) return { loi: 'Ngày phải theo dạng YYYY-MM-DD.' };
  if (batBuocKhoang) {
    den = den || docNgay(ngayTruoc(0));
    tu = tu || new Date(den.getTime() - 29 * 86_400_000);
  }
  if (tu && den && den < tu) return { loi: 'Ngày kết thúc phải sau ngày bắt đầu.' };
  if (batBuocKhoang && (den - tu) / 86_400_000 + 1 > NGAY_TOI_DA) {
    return { loi: `Chỉ xem được tối đa ${NGAY_TOI_DA} ngày một lần.` };
  }
  /* So bằng chuỗi ngày, mốc cuối là ĐẦU ngày hôm sau — trọn ngày cuối */
  if (tu) { where.push('l.created_at >= ?'); params.push(tu.toISOString().slice(0, 10)); boLoc.tu = tu.toISOString().slice(0, 10); }
  if (den) { where.push('l.created_at < ?'); params.push(ngaySau(den)); boLoc.den = den.toISOString().slice(0, 10); }

  return { where, params, boLoc, tu, den };
}

const nhan = (r) => {
  const hd = tenHanhDong(r.action);
  return { ...r, ten_hanh_dong: hd.ten, nhom: hd.nhom, ten_nhom: hd.tenNhom, nhay_cam: hd.nhayCam };
};

/** GET /api/admin/logs/danh-muc — nhóm và nhãn hành động cho giao diện */
router.get('/danh-muc', (_req, res) => {
  res.json(NHOM_NHAT_KY.map((n) => ({
    ma: n.ma, ten: n.ten, nhayCam: Boolean(n.nhayCam),
    hanhDong: Object.entries(n.hanhDong).map(([ma, ten]) => ({ ma, ten })),
  })));
});

/** GET /api/admin/logs?nhom=&action=&staffId=&tu=&den=&page=&limit= */
router.get('/', async (req, res) => {
  const loc = docBoLoc(req.query);
  if (loc.loi) return res.status(400).json({ error: loc.loi });
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 30));
  const offset = (page - 1) * limit;
  const whereSql = loc.where.length ? 'WHERE ' + loc.where.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.staff_id, l.action, l.target_type, l.target_id, l.details,
              l.ip_address, l.created_at,
              st.full_name AS staff_name, st.role AS staff_role,
              s.tracking_code
       FROM staff_activity_logs l
       LEFT JOIN staff st ON l.staff_id = st.id
       LEFT JOIN submissions s ON l.target_type = 'submission' AND l.target_id = s.id
       ${whereSql}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ? OFFSET ?`,
      [...loc.params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM staff_activity_logs l ${whereSql}`, loc.params
    );

    // Đếm riêng số lượt xem danh tính (chỉ số cần theo dõi sát)
    const [[reveal]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM staff_activity_logs
       WHERE action = 'reveal_identity' AND created_at > NOW() - INTERVAL 30 DAY`
    );

    /* Ghi lượt mở TRƯỚC khi trả. Gộp 10 phút: lật trang, đổi bộ lọc không
       đẻ thêm dòng; lần mở đầu tiên luôn có. */
    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'view_logs', loaiDoiTuong: 'log', chiTiet: { boLoc: loc.boLoc }, gopPhut: 10,
    });

    res.json({
      data: rows.map(nhan),
      page, limit, total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
      revealCount30d: Number(reveal.cnt),
    });
  } catch (err) {
    console.error('Lỗi nhật ký:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * GET /api/admin/logs/thong-ke?tu=&den= — THỐNG KÊ THEO NGÀY
 * Mỗi ngày: tổng số hoạt động, số theo từng nhóm, số hoạt động nhạy cảm.
 * Kèm tổng theo cán bộ trong khoảng — ai hoạt động bất thường nhiều.
 * Mặc định 30 ngày gần nhất, tối đa NGAY_TOI_DA ngày.
 */
router.get('/thong-ke', async (req, res) => {
  const loc = docBoLoc({ tu: req.query.tu, den: req.query.den }, { batBuocKhoang: true });
  if (loc.loi) return res.status(400).json({ error: loc.loi });
  const whereSql = 'WHERE ' + loc.where.join(' AND ');
  try {
    const [theoNgay] = await pool.query(
      `SELECT DATE(l.created_at) AS ngay, l.action, COUNT(*) AS so
         FROM staff_activity_logs l ${whereSql}
        GROUP BY DATE(l.created_at), l.action`,
      loc.params
    );
    const [theoNguoi] = await pool.query(
      `SELECT l.staff_id, st.full_name AS staff_name, st.role AS staff_role, l.action, COUNT(*) AS so
         FROM staff_activity_logs l LEFT JOIN staff st ON st.id = l.staff_id ${whereSql}
        GROUP BY l.staff_id, st.full_name, st.role, l.action`,
      loc.params
    );

    /* Gom theo ngày ở đây, không ở SQL: nhóm là khái niệm của danh mục, không
       có trong CSDL. Điền đủ mọi ngày trong khoảng, ngày trống là 0 — biểu đồ
       có lỗ thì người xem không biết là "không ai làm gì" hay "mất dữ liệu". */
    const ngay = new Map();
    for (let d = loc.tu; d <= loc.den; d = new Date(d.getTime() + 86_400_000)) {
      ngay.set(d.toISOString().slice(0, 10), { ngay: d.toISOString().slice(0, 10), tong: 0, nhayCam: 0, theoNhom: {} });
    }
    for (const r of theoNgay) {
      const khoa = String(r.ngay instanceof Date ? r.ngay.toISOString() : r.ngay).slice(0, 10);
      const o = ngay.get(khoa);
      if (!o) continue;
      const hd = tenHanhDong(r.action);
      const so = Number(r.so);
      o.tong += so;
      if (hd.nhayCam) o.nhayCam += so;
      o.theoNhom[hd.nhom] = (o.theoNhom[hd.nhom] || 0) + so;
    }

    const nguoi = new Map();
    for (const r of theoNguoi) {
      const k = r.staff_id ?? 0;
      const o = nguoi.get(k) || { staffId: r.staff_id, ten: r.staff_name || 'Không rõ (đăng nhập sai tên)',
        vaiTro: r.staff_role || null, tong: 0, nhayCam: 0 };
      o.tong += Number(r.so);
      if (tenHanhDong(r.action).nhayCam) o.nhayCam += Number(r.so);
      nguoi.set(k, o);
    }

    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'view_logs', loaiDoiTuong: 'log', chiTiet: { thongKe: loc.boLoc }, gopPhut: 10,
    });

    res.json({
      tu: loc.boLoc.tu, den: loc.boLoc.den,
      theoNgay: [...ngay.values()],
      theoCanBo: [...nguoi.values()].sort((a, b) => b.tong - a.tong),
    });
  } catch (err) {
    console.error('Lỗi thống kê nhật ký:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * GET /api/admin/logs/xuat?tu=&den=&nhom=&action=&staffId= — XUẤT EXCEL
 * Trả các dòng đã gắn nhãn tiếng Việt; giao diện dựng tệp .xlsx như trang báo
 * cáo. Mỗi lần xuất ghi một dòng export_logs (không gộp) TRƯỚC khi trả.
 */
router.get('/xuat', async (req, res) => {
  const loc = docBoLoc(req.query, { batBuocKhoang: true });
  if (loc.loi) return res.status(400).json({ error: loc.loi });
  const whereSql = 'WHERE ' + loc.where.join(' AND ');
  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.ip_address, l.created_at,
              st.full_name AS staff_name, st.role AS staff_role, s.tracking_code
         FROM staff_activity_logs l
         LEFT JOIN staff st ON l.staff_id = st.id
         LEFT JOIN submissions s ON l.target_type = 'submission' AND l.target_id = s.id
        ${whereSql}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ?`,
      [...loc.params, DONG_XUAT_TOI_DA + 1]
    );
    const catBot = rows.length > DONG_XUAT_TOI_DA;
    const dsXuat = rows.slice(0, DONG_XUAT_TOI_DA);

    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'export_logs', loaiDoiTuong: 'log', chiTiet: { boLoc: loc.boLoc, soDong: dsXuat.length },
    });

    res.json({
      tu: loc.boLoc.tu, den: loc.boLoc.den, catBot, toiDa: DONG_XUAT_TOI_DA,
      data: dsXuat.map(nhan),
    });
  } catch (err) {
    console.error('Lỗi xuất nhật ký:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/* GET /api/admin/logs/canh-bao — CẢNH BÁO TẤN CÔNG ĐĂNG NHẬP
   Liệt kê các địa chỉ IP có từ 5 lần đăng nhập thất bại trở lên trong 24 giờ.
   Ghi nhật ký mà không ai xem thì vô nghĩa — endpoint này để quản trị viên
   phát hiện sớm khi hệ thống đang bị dò mật khẩu. */
router.get('/canh-bao', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ip_address AS dia_chi_ip,
              COUNT(*) AS so_lan_that_bai,
              COUNT(DISTINCT attempted_username) AS so_tai_khoan_bi_thu,
              MIN(created_at) AS lan_dau,
              MAX(created_at) AS lan_cuoi
       FROM staff_activity_logs
       WHERE action = 'login_failed'
         AND created_at > NOW() - INTERVAL 24 HOUR
       GROUP BY ip_address
       HAVING COUNT(*) >= 5
       ORDER BY so_lan_that_bai DESC
       LIMIT 20`
    );

    /* Tài khoản đang bị khoá tạm — dấu hiệu tấn công đã chạm ngưỡng */
    let dangKhoa = [];
    try {
      const [r2] = await pool.query(
        `SELECT username, full_name, locked_until
         FROM staff WHERE locked_until IS NOT NULL AND locked_until > NOW()`
      );
      dangKhoa = r2;
    } catch { /* chưa nâng cấp v9 */ }

    res.json({
      ip_dang_ngo: rows,
      tai_khoan_dang_khoa: dangKhoa,
      co_canh_bao: rows.length > 0 || dangKhoa.length > 0,
    });
  } catch (err) {
    console.error('Lỗi lấy cảnh báo đăng nhập:', err.message);
    res.json({ ip_dang_ngo: [], tai_khoan_dang_khoa: [], co_canh_bao: false });
  }
});

export default router;
