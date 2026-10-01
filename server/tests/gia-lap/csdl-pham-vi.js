/**
 * CSDL node:sqlite trong bộ nhớ cho các bài canh PHẠM VI XEM hồ sơ (ADR-003 §4;
 * trước đây là cấp độ bảo mật của BUG-009). Không phải tệp test (không đuôi
 * `.test.js`).
 *
 * Câu SQL của route chạy NGUYÊN VĂN, chỉ dịch đúng mấy cú pháp MySQL mà các
 * route đụng tới dùng. Câu nào còn cú pháp lạ thì SQLite ném lỗi, route trả
 * 500, test đỏ — người sửa biết ngay chứ không âm thầm xanh.
 *
 * Hai điểm giả lập, ngoài SQLite:
 *   · information_schema.columns — trả theo cột CÓ THẬT trong bảng sqlite, để
 *     bài "CSDL chưa chạy v26" dựng bảng thiếu cột là đủ.
 *   · CALL update_submission_status — thủ tục MySQL; ở đây chỉ đổi trạng thái.
 */
import express from 'express';

const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

function sangSqlite(sql) {
  const dv = (d) => `${d.toLowerCase()}s`;
  let s = sql.replace(/DATE_(ADD|SUB)\(NOW\(\),\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|YEAR)\)/gi,
    (_m, huong, n, d) => `datetime(NOW(), '${huong.toUpperCase() === 'ADD' ? '+' : '-'}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/DATE_ADD\(\?,\s*INTERVAL\s+(\d+)\s+DAY\)/gi, (_m, n) => `datetime(?, '+${n} days')`);
  s = s.replace(/NOW\(\)\s*([-+])\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|MINUTE)/gi,
    (_m, dau, n, d) => `datetime(NOW(), '${dau}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/DATEDIFF\(DATE_ADD\(s\.deleted_at,\s*INTERVAL\s+\?\s+DAY\),\s*NOW\(\)\)/gi,
    'CAST(julianday(s.deleted_at) + ? - julianday(NOW()) AS INT)');
  return s;
}

/** Nhân viên: id cố định để bảng mong đợi đọc được */
export const ADMIN = { id: 1, username: 'truong', role: 'admin',   full_name: 'Trưởng' };
export const MGR   = { id: 2, username: 'pho2',   role: 'manager', full_name: 'Phó A' };
export const MGR2  = { id: 3, username: 'pho3',   role: 'manager', full_name: 'Phó B' };
export const H     = { id: 4, username: 'cb4',    role: 'handler', full_name: 'Cán bộ C' };
export const H2    = { id: 5, username: 'cb5',    role: 'handler', full_name: 'Cán bộ D' };
export const MOI_CAN_BO = [ADMIN, MGR, MGR2, H, H2];

/**
 * Dựng CSDL. `coCot = false` -> bảng submissions KHÔNG có hai cột cờ
 * to_giac_mat, ngoai_tham_quyen (CSDL chưa chạy nang_cap_v26.sql). Hai cột cho
 * phép NULL để bài canh fail-safe dựng được hồ sơ cờ NULL.
 */
export function dungCsdl(sqlite, pool, { coCot = true } = {}) {
  const db = new sqlite.DatabaseSync(':memory:');
  const bayGio = () => norm(new Date());
  db.function('NOW', bayGio);
  db.function('LEFT', (s, n) => (s == null ? null : String(s).slice(0, n)));
  db.function('FIELD', { varargs: true }, (v, ...ds) => ds.indexOf(v) + 1);
  db.function('DATEDIFF', (a, b) => (a == null || b == null ? null
    : Math.floor(Date.parse(String(a).slice(0, 10)) / 864e5) - Math.floor(Date.parse(String(b).slice(0, 10)) / 864e5)));

  for (const q of [
    `CREATE TABLE categories (id INT PRIMARY KEY, code TEXT, name TEXT, sla_days INT)`,
    `CREATE TABLE staff (id INT PRIMARY KEY, username TEXT, full_name TEXT, role TEXT, is_active INT DEFAULT 1)`,
    `CREATE TABLE wards (id INT PRIMARY KEY, name TEXT)`,
    `CREATE TABLE report_messages (id INTEGER PRIMARY KEY, submission_id INT, sender_type TEXT, staff_id INT,
       message TEXT, created_at TEXT DEFAULT (NOW()), read_by_staff INT DEFAULT 0, read_by_reporter INT DEFAULT 0)`,
    `CREATE TABLE submissions (
       id INTEGER PRIMARY KEY, tracking_code TEXT, original_content TEXT, ai_processed_content TEXT,
       category_id INT, status TEXT, urgency TEXT,
       ${coCot ? 'to_giac_mat INT DEFAULT 0, ngoai_tham_quyen INT DEFAULT 0,' : ''}
       is_anonymous INT, is_flagged INT DEFAULT 0, flag_reason TEXT,
       sender_name TEXT, sender_phone TEXT, sender_phone_hash TEXT, sender_email TEXT,
       ip_address TEXT, user_agent TEXT,
       created_at TEXT DEFAULT (NOW()), updated_at TEXT DEFAULT (NOW()), deadline_at TEXT, resolved_at TEXT,
       assigned_to INT, resolved_by INT, reviewed_by INT, reviewed_at TEXT,
       rejection_reason TEXT, resolution_note TEXT, ward_id INT,
       incident_lat REAL, incident_lng REAL,
       identity_erased INT DEFAULT 0, identity_erased_at TEXT, deleted_at TEXT, deleted_by INT,
       incident_group_id INT, device_id TEXT, is_spam INT DEFAULT 0)`,
    `CREATE TABLE submission_images (submission_id INT, image_url TEXT, mime_type TEXT, moderation_status TEXT)`,
    `CREATE TABLE status_history (submission_id INT, old_status TEXT, new_status TEXT, note TEXT,
       changed_at TEXT DEFAULT (NOW()), changed_by INT)`,
    `CREATE TABLE staff_activity_logs (id INTEGER PRIMARY KEY, staff_id INT, action TEXT, target_type TEXT,
       target_id TEXT, details TEXT, ip_address TEXT, created_at TEXT DEFAULT (NOW()))`,
    `CREATE TABLE incident_groups (id INTEGER PRIMARY KEY, ward_id INT, category_id INT, first_submission_id INT,
       submission_count INT, first_reported_at TEXT, last_reported_at TEXT, acknowledged INT DEFAULT 0,
       acknowledged_by INT)`,
    `CREATE TABLE blacklists (id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT,
       loai_don TEXT NOT NULL DEFAULT 'khong_ro', reason TEXT, created_by INT,
       created_at TEXT DEFAULT (NOW()), expires_at TEXT)`,
    `CREATE TABLE unlock_appeals (id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT, content TEXT,
       status TEXT DEFAULT 'cho_xu_ly', created_at TEXT DEFAULT (NOW()), handled_at TEXT, handled_by INT,
       handler_note TEXT)`,
    `CREATE TABLE data_deletion_requests (id INTEGER PRIMARY KEY, submission_id INT, status TEXT DEFAULT 'pending',
       handled_at TEXT, handled_by INT)`,
    /* View thống kê: chỉ đếm, không mang nội dung — đủ để route chạy */
    `CREATE VIEW vw_dashboard_stats AS SELECT COUNT(*) AS total FROM submissions`,
    `CREATE VIEW vw_category_stats AS SELECT category_id, COUNT(*) AS so FROM submissions GROUP BY category_id`,
    `CREATE VIEW vw_sla_stats AS SELECT 0 AS overdue_count, 0 AS near_due_count, 0 AS unassigned_count,
       0 AS pending_review_count`,
    `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15)`,
    `INSERT INTO wards VALUES (1, 'Thôn Đông')`,
  ]) db.exec(q);

  const themCanBo = db.prepare('INSERT INTO staff (id, username, full_name, role) VALUES (?,?,?,?)');
  for (const s of MOI_CAN_BO) themCanBo.run(s.id, s.username, s.full_name, s.role);

  pool.query = async (sql, p = []) => {
    const cauGoc = String(sql);
    if (/information_schema\.columns/i.test(cauGoc)) {
      const cot = /column_name\s*=\s*'(\w+)'/i.exec(cauGoc)?.[1];
      const coThat = db.prepare('SELECT name FROM pragma_table_info(\'submissions\')').all()
        .some((r) => r.name === cot);
      return [coThat ? [{ 1: 1 }] : [], []];
    }
    const goiThuTuc = /^\s*CALL\s+update_submission_status/i.test(cauGoc);
    if (goiThuTuc) {
      const r = db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(norm(p[1]), norm(p[0]));
      return [{ affectedRows: Number(r.changes) }, []];
    }
    const st = db.prepare(sangSqlite(cauGoc));
    if (/^\s*(\/\*[\s\S]*?\*\/\s*)*SELECT/i.test(cauGoc)) {
      return [st.all(...p.map(norm)).map((r) => ({ ...r })), []];
    }
    const r = st.run(...p.map(norm));
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, []];
  };
  return db;
}

/** Gọi route thật qua HTTP */
export async function goi(router, signAccessToken, staff, method, duong, body) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', router);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin${duong}`, {
      method,
      headers: { 'Content-Type': 'application/json',
                 ...(staff ? { Authorization: `Bearer ${signAccessToken(staff)}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* để trống */ }
    return { status: res.status, body: json, text };
  } finally {
    server.close();
  }
}
