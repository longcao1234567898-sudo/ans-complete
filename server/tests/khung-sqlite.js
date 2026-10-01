/**
 * KHUNG CSDL THẬT TRONG BỘ NHỚ CHO TEST ROUTE — dùng chung, KHÔNG phải tệp test.
 *
 * Vì sao có tệp này: mỗi tệp test route trước đây tự chép một khung node:sqlite
 * riêng (ND-029 đếm được bốn bản chép). Chép thì lệch: thêm cột ở một bản, quên
 * ở bản khác, test xanh trên một lược đồ không còn giống thật. Các tệp test mới
 * của đợt ADR-003 dùng khung này; tệp cũ giữ nguyên để không đụng test đang
 * khoá các bản vá bảo mật.
 *
 * Câu SQL của route chạy NGUYÊN VĂN, chỉ dịch đúng vài cú pháp MySQL không có
 * trên SQLite. Câu nào còn cú pháp lạ thì SQLite ném lỗi, test đỏ — người sửa
 * biết ngay thay vì test xanh nhờ khung giả nuốt lỗi.
 *
 * Node < 22 không có node:sqlite: `BO_QUA` mang lý do để test ghi rõ là bỏ qua.
 */
import express from 'express';

const sqlite = await import('node:sqlite').catch(() => null);
export const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

export const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

/** Dịch các cú pháp MySQL mà route dùng sang SQLite. Chỉ những gì cần. */
export function sangSqlite(sql) {
  const dv = (d) => `${d.toLowerCase()}s`;
  let s = sql.replace(/DATE_(ADD|SUB)\(NOW\(\),\s*INTERVAL\s+(\?|\d+)\s+(SECOND|MINUTE|HOUR|DAY|YEAR)\)/gi,
    (_m, huong, n, d) => `datetime(NOW(), '${huong.toUpperCase() === 'ADD' ? '+' : '-'}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/NOW\(\)\s*([-+])\s*INTERVAL\s+(\?|\d+)\s+(SECOND|MINUTE|HOUR|DAY)/gi,
    (_m, dau, n, d) => `datetime(NOW(), '${dau}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/DATE_ADD\(\?,\s*INTERVAL\s+(\d+)\s+DAY\)/gi, (_m, n) => `datetime(?, '+${n} days')`);
  s = s.replace(/DATEDIFF\(DATE_ADD\(s\.deleted_at,\s*INTERVAL\s+\?\s+DAY\),\s*NOW\(\)\)/gi,
    'CAST(julianday(s.deleted_at) + ? - julianday(NOW()) AS INT)');
  s = s.replace(/DATEDIFF\(NOW\(\),\s*([\w.]+)\)/gi, 'CAST(julianday(NOW()) - julianday($1) AS INT)');
  s = s.replace(/TIMESTAMPDIFF\(SECOND,\s*([\w.]+),\s*NOW\(\)\)/gi,
    'CAST((julianday(NOW()) - julianday($1)) * 86400 AS INT)');
  s = s.replace(/FIELD\(([\w.]+),\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/gi,
    "(CASE $1 WHEN '$2' THEN 1 WHEN '$3' THEN 2 WHEN '$4' THEN 3 ELSE 4 END)");
  s = s.replace(/\bDATE\(([\w.]+)\)/gi, 'date($1)');
  s = s.replace(/ON DUPLICATE KEY UPDATE\s+([\s\S]+)$/i,
    (_m, ds) => `ON CONFLICT DO UPDATE SET ${ds.replace(/VALUES\((\w+)\)/gi, 'excluded.$1')}`);
  return s;
}

/* mysql2 bung tham số mảng thành danh sách cho `IN (?)` — làm y như vậy */
function bungMang(sql, p) {
  const ra = [];
  let k = 0;
  const cau = sql.replace(/\?/g, () => {
    const v = p[k++];
    if (Array.isArray(v)) { ra.push(...v); return v.map(() => '?').join(','); }
    ra.push(v); return '?';
  });
  return [cau, ra];
}

/** Lược đồ tối thiểu, bám theo TRON_BO_DATABASE_V5.sql + các tệp nâng cấp tới bản mới nhất */
const LUOC_DO = [
  `CREATE TABLE categories (id INT PRIMARY KEY, code TEXT, name TEXT, sla_days INT)`,
  `CREATE TABLE staff (id INT PRIMARY KEY, username TEXT, full_name TEXT, role TEXT, is_active INT DEFAULT 1)`,
  `CREATE TABLE wards (id INT PRIMARY KEY, name TEXT, display_order INT DEFAULT 0)`,
  `CREATE TABLE report_messages (id INTEGER PRIMARY KEY, submission_id INT, sender_type TEXT, staff_id INT,
     message TEXT, read_by_staff INT DEFAULT 0, created_at TEXT DEFAULT (NOW()))`,
  `CREATE TABLE submissions (
     id INTEGER PRIMARY KEY, tracking_code TEXT, original_content TEXT, ai_processed_content TEXT,
     category_id INT, ai_suggested_category_id INT, status TEXT, urgency TEXT DEFAULT 'normal',
     is_anonymous INT DEFAULT 0, is_flagged INT DEFAULT 0, flag_reason TEXT, is_verified_otp INT,
     sender_name TEXT, sender_phone TEXT, sender_phone_hash TEXT, sender_email TEXT,
     ip_address TEXT, user_agent TEXT, content_hash TEXT,
     created_at TEXT DEFAULT (NOW()), updated_at TEXT DEFAULT (NOW()), deadline_at TEXT, resolved_at TEXT,
     assigned_to INT, resolved_by INT, reviewed_by INT, reviewed_at TEXT,
     rejection_reason TEXT, resolution_note TEXT, ward_id INT, chat_pin_hash TEXT,
     incident_lat REAL, incident_lng REAL,
     identity_erased INT DEFAULT 0, identity_erased_at TEXT, deleted_at TEXT, deleted_by INT,
     incident_group_id INT, device_id TEXT, is_spam INT DEFAULT 0,
     to_giac_mat INT NOT NULL DEFAULT 0, ngoai_tham_quyen INT NOT NULL DEFAULT 0,
     chua_xac_minh_luc TEXT, sang_loc_boi INT, sang_loc_luc TEXT, giu_cho_lanh_dao INT NOT NULL DEFAULT 0)`,
  `CREATE TABLE ghi_chu_noi_bo (id INTEGER PRIMARY KEY, submission_id INT NOT NULL, staff_id INT NOT NULL,
     noi_dung TEXT NOT NULL, created_at TEXT DEFAULT (NOW()))`,
  `CREATE TABLE submission_images (submission_id INT, image_url TEXT, cloudinary_id TEXT, storage TEXT,
     mime_type TEXT, is_verified INT, moderation_status TEXT)`,
  `CREATE TABLE status_history (submission_id INT, old_status TEXT, new_status TEXT, note TEXT,
     changed_at TEXT DEFAULT (NOW()), changed_by INT)`,
  /* details là cột JSON trên MySQL: ghi chuỗi chữ trần vào thì MySQL từ chối cả
     câu INSERT. SQLite nhận mọi chuỗi, nên phải tự đặt ràng buộc — thiếu nó thì
     test xanh trong khi nhật ký thật không ghi được dòng nào. */
  `CREATE TABLE staff_activity_logs (id INTEGER PRIMARY KEY, staff_id INT, action TEXT, target_type TEXT,
     target_id TEXT, details TEXT CHECK (details IS NULL OR json_valid(details)), ip_address TEXT,
     attempted_username TEXT, created_at TEXT DEFAULT (NOW()))`,
  `CREATE TABLE incident_groups (id INTEGER PRIMARY KEY, ward_id INT, category_id INT, first_submission_id INT,
     submission_count INT, first_reported_at TEXT, last_reported_at TEXT, acknowledged INT DEFAULT 0,
     acknowledged_by INT, acknowledged_at TEXT)`,
  `CREATE TABLE blacklists (id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT,
     loai_don TEXT NOT NULL DEFAULT 'khong_ro', reason TEXT, created_by INT,
     created_at TEXT DEFAULT (NOW()), expires_at TEXT, UNIQUE (identifier, kind, loai_don))`,
  `CREATE TABLE data_deletion_requests (
     id INTEGER PRIMARY KEY, submission_id INT, tracking_code TEXT, status TEXT DEFAULT 'pending',
     requested_at TEXT DEFAULT (NOW()), handled_at TEXT, handled_by INT, reason TEXT, requester_ip TEXT)`,
  `CREATE TABLE khoa_gui_tam (khoa TEXT PRIMARY KEY, chu TEXT NOT NULL, het_han TEXT NOT NULL)`,
  `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15), (2, 'khieu_nai', 'Khiếu nại', 30),
     (3, 'phan_anh', 'Phản ánh', 15), (4, 'de_xuat', 'Đề xuất', 15)`,
  `INSERT INTO wards (id, name) VALUES (1, 'Khu phố 1'), (2, 'Khu phố 2')`,
  `INSERT INTO staff (id, username, full_name, role) VALUES
     (1, 'truong', 'Trưởng Công an', 'admin'), (2, 'pho', 'Phó trưởng', 'manager'),
     (4, 'cb4', 'Cán bộ Bốn', 'handler'), (5, 'cb5', 'Cán bộ Năm', 'handler')`,
];

export const TRUONG = { id: 1, username: 'truong', role: 'admin', full_name: 'Trưởng Công an' };
export const PHO = { id: 2, username: 'pho', role: 'manager', full_name: 'Phó trưởng' };
export const CAN_BO = { id: 4, username: 'cb4', role: 'handler', full_name: 'Cán bộ Bốn' };
export const CAN_BO_5 = { id: 5, username: 'cb5', role: 'handler', full_name: 'Cán bộ Năm' };

/**
 * Dựng CSDL mới và gắn vào `pool.query`. Trả về đối tượng điều khiển:
 *   db         — DatabaseSync, để test đọc thẳng bảng
 *   troiQua(p) — đẩy đồng hồ ảo của NOW() đi p phút
 *   them(...)  — thêm câu tạo bảng/cột riêng của một test
 * Đồng hồ ảo lùi một ngày so với giờ thật: route tính thời gian chờ bằng
 * Date.now() thật trừ created_at (giờ ảo) — mốc ở tương lai là 429 oan.
 */
export function dungCsdl(pool, { themCau = [] } = {}) {
  const db = new sqlite.DatabaseSync(':memory:');
  const ctl = {
    db,
    dongHo: Math.floor((Date.now() - 24 * 3600_000) / 60_000) * 60_000,
    troiQua(phut) { ctl.dongHo += phut * 60_000; },
    luc(phutTruoc) { return norm(new Date(ctl.dongHo - phutTruoc * 60_000)); },
  };
  db.function('NOW', () => norm(new Date(ctl.dongHo)));
  db.function('LEFT', (s, n) => (s == null ? null : String(s).slice(0, n)));
  db.function('COALESCE2', (a, b) => (a == null ? b : a));
  for (const q of [...LUOC_DO, ...themCau]) db.exec(q);

  pool.query = async (sql, p = []) => {
    /* Thủ tục MySQL update_submission_status(id, trạng thái, ghi chú, lý do từ
       chối, người đổi): đổi trạng thái, ghi lịch sử VÀ ghi một dòng nhật ký
       update_status — đúng như bản trong TRON_BO_DATABASE_V5.sql. Thiếu dòng
       nhật ký ở đây thì test tưởng route phải tự ghi, và MySQL thật ra hai dòng. */
    if (/^\s*CALL\s+update_submission_status/i.test(String(sql))) {
      const [id, moi, ghiChu, lyDo, nguoi] = p.map(norm);
      const cu = db.prepare('SELECT status FROM submissions WHERE id = ?').get(id)?.status ?? null;
      db.prepare('UPDATE submissions SET status = ?, rejection_reason = COALESCE(?, rejection_reason) WHERE id = ?')
        .run(moi, lyDo, id);
      db.prepare('INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by) VALUES (?,?,?,?,?)')
        .run(id, cu, moi, moi === 'rejected' ? (lyDo ?? ghiChu) : ghiChu, nguoi);
      db.prepare(`INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details)
                  VALUES (?, 'update_status', 'submission', ?, json_object('old_status', ?, 'new_status', ?))`)
        .run(nguoi, id, cu, moi);
      return [{ affectedRows: 1 }, []];
    }
    const [cau, thamSo] = bungMang(sangSqlite(String(sql)), p);
    let st;
    try {
      st = db.prepare(cau);
    } catch (e) {
      /* Giữ mã lỗi kiểu MySQL cho lỗi thiếu bảng, để code phân nhánh theo mã chạy được */
      if (/no such table/i.test(e.message)) Object.assign(e, { code: 'ER_NO_SUCH_TABLE' });
      throw e;
    }
    if (/^\s*(\/\*[\s\S]*?\*\/\s*)*(SELECT|WITH)/i.test(String(sql))) {
      return [st.all(...thamSo.map(norm)).map((r) => ({ ...r })), []];
    }
    try {
      const r = st.run(...thamSo.map(norm));
      return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, []];
    } catch (e) {
      if (/UNIQUE constraint failed/i.test(e.message)) Object.assign(e, { code: 'ER_DUP_ENTRY' });
      throw e;
    }
  };
  return ctl;
}

/** Gọi một router thật qua HTTP thật. `staff` null = người dân. */
export async function goi({ duongGoc, router, staff, signAccessToken, method, duong, body }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(duongGoc, router);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${duongGoc}${duong}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(staff ? { Authorization: `Bearer ${signAccessToken(staff)}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* để trống */ }
    return { status: res.status, body: json, text };
  } finally {
    server.close();
  }
}

/** Mã thiết bị hợp lệ (UUID v4) cho tin có danh tính */
export const MAY_A = '3f9c2a71-5b4e-4d8a-9c1f-7e2b6a0d4c95';
export const MAY_B = 'b81d0e46-2c7a-4f93-8e05-19a4c6f2d7b3';

/** Một đơn có danh tính hợp lệ; `i` đổi nội dung và số điện thoại để khỏi trùng */
export function donCoTen(i = 0, them = {}) {
  const NOI_DUNG = [
    'Đèn đường ở ngõ 5 khu phố 1 bị hỏng đã hai tuần, buổi tối đi lại rất nguy hiểm cho người già và trẻ nhỏ.',
    'Quán karaoke đầu hẻm 12 mở nhạc lớn tới hai giờ sáng nhiều đêm liền, cả xóm không ngủ được, đã nhắc nhưng không nghe.',
    'Bãi đất trống sau chợ bị đổ rác thải xây dựng trái phép, xe tải đổ vào ban đêm, mùi hôi ảnh hưởng các hộ xung quanh.',
    'Đường vào trường tiểu học có ổ gà lớn ngay khúc cua, trời mưa đọng nước, nhiều học sinh đi xe đạp bị ngã tuần qua.',
    'Nhóm thanh niên tụ tập đua xe máy trên đường ven kênh vào tối thứ bảy, nẹt pô ầm ĩ, người đi đường phải tránh vào lề.',
    'Cột điện trước nhà số 18 bị nghiêng sau trận mưa lớn hôm qua, dây điện võng thấp sát mái tôn các nhà bên cạnh.',
    'Vỉa hè trước dãy ki ốt chợ bị lấn chiếm làm chỗ để hàng, người đi bộ phải xuống lòng đường, rất dễ va chạm xe.',
    'Cống thoát nước đầu ngõ 7 bị tắc lâu ngày, mỗi lần mưa nước tràn vào nhà dân, đã báo tổ dân phố nhưng chưa xử lý.',
  ];
  return {
    isAnonymous: false, category: 'phan_anh', deviceId: MAY_A,
    fullName: 'Phạm Văn Phúc', phone: `09162847${String(10 + i).slice(-2)}`,
    content: NOI_DUNG[i % NOI_DUNG.length], ...them,
  };
}
