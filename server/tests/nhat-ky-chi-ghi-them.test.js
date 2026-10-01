/**
 * VIỆC 9 (ADR-003) — NHẬT KÝ CHỈ GHI THÊM
 *
 * ADR-003 cho mọi lãnh đạo xem danh tính, đổi lại nhật ký không ai sửa xoá được.
 * database/nang_cap_v27.sql đặt hai trigger chặn UPDATE / DELETE và đổi khoá
 * ngoại staff_id từ ON DELETE CASCADE sang RESTRICT (MySQL không chạy trigger
 * cho thao tác dây chuyền của khoá ngoại — xoá cán bộ từng xoá luôn nhật ký).
 *
 * Không có MySQL ở đây, nên canh ba điều:
 *   1. Tệp nâng cấp có đúng các câu đó.
 *   2. Không mã nào trong máy chủ sửa hay xoá nhật ký — có thì trigger làm vỡ
 *      tính năng đó, và cũng là dấu hiệu ai đó đang tìm đường xoá dấu vết.
 *   3. Gắn trigger tương đương lên SQLite rồi chạy các luồng có ghi nhật ký:
 *      ứng dụng vẫn chạy, còn câu sửa/xoá thì bị chặn.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, TRUONG, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const TEP = new URL('../../database/nang_cap_v27.sql', import.meta.url);
const sql = await readFile(TEP, 'utf8').catch(() => '');
const khongChuThich = sql.replace(/--.*$/gm, '');

test('v27: trigger chặn UPDATE và DELETE trên staff_activity_logs', () => {
  for (const loai of ['UPDATE', 'DELETE']) {
    const re = new RegExp(`CREATE TRIGGER\\s+\\w+\\s+BEFORE\\s+${loai}\\s+ON\\s+staff_activity_logs\\s+FOR EACH ROW\\s+SIGNAL SQLSTATE '45000'`, 'i');
    assert.match(khongChuThich, re, `thiếu trigger chặn ${loai}`);
  }
});

test('v27: gỡ khoá ngoại CASCADE, đặt khoá ngoại ON DELETE RESTRICT', () => {
  assert.match(khongChuThich, /DROP FOREIGN KEY/i);
  assert.match(khongChuThich, /DELETE_RULE <> 'RESTRICT'/, 'chỉ gỡ khoá ngoại chưa phải RESTRICT');
  assert.match(khongChuThich, /FOREIGN KEY \(staff_id\) REFERENCES staff\(id\) ON DELETE RESTRICT/i);
  assert.doesNotMatch(khongChuThich, /ON DELETE CASCADE/i);
});

test('quét: không mã nào trong máy chủ sửa, xoá hay làm rỗng nhật ký', async () => {
  const sai = [];
  const duyet = async (thuMuc) => {
    for (const d of await readdir(thuMuc, { withFileTypes: true })) {
      const u = new URL(d.name + (d.isDirectory() ? '/' : ''), thuMuc);
      if (d.isDirectory()) { await duyet(u); continue; }
      if (!d.name.endsWith('.js')) continue;
      const nguon = await readFile(u, 'utf8');
      if (/(UPDATE|DELETE\s+FROM|TRUNCATE(\s+TABLE)?)\s+staff_activity_logs/i.test(nguon)) sai.push(u.pathname.split('/src/')[1]);
    }
  };
  await duyet(new URL('../src/', import.meta.url));
  assert.deepEqual(sai, []);
});

/* ---- Chạy thật với trigger tương đương trên SQLite --------------------- */

const { pool } = BO_QUA ? {} : await import('../src/db.js');
const { signAccessToken } = BO_QUA ? {} : await import('../src/lib/token.js');
const { default: adminRouter } = BO_QUA ? {} : await import('../src/routes/admin/index.js');
const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});

function dungCoTrigger() {
  const ctl = dungCsdl(pool);
  for (const loai of ['UPDATE', 'DELETE']) {
    ctl.db.exec(`CREATE TRIGGER chan_${loai} BEFORE ${loai} ON staff_activity_logs
                 BEGIN SELECT RAISE(ABORT, 'Nhat ky chi ghi them'); END`);
  }
  ctl.db.exec(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous,
                 sender_name, deleted_at) VALUES
               (10, 'HS0010', 'Phản ánh đèn đường', 3, 'processing', 0, NULL, NULL),
               (30, 'HS0030', 'Trong thùng rác', 3, 'rejected', 0, NULL, '2026-01-01 00:00:00')`);
  return ctl;
}

test('trigger chặn được câu sửa, xoá nhật ký', { skip: BO_QUA }, async () => {
  const ctl = dungCoTrigger();
  ctl.db.exec(`INSERT INTO staff_activity_logs (staff_id, action) VALUES (${TRUONG.id}, 'reveal_identity')`);
  await assert.rejects(pool.query('UPDATE staff_activity_logs SET action = ?', ['login']));
  await assert.rejects(pool.query('DELETE FROM staff_activity_logs'));
  assert.equal(ctl.db.prepare('SELECT action FROM staff_activity_logs').get().action, 'reveal_identity');
});

test('ứng dụng vẫn chạy bình thường khi nhật ký chỉ ghi thêm', { skip: BO_QUA }, async () => {
  const ctl = dungCoTrigger();
  const cacViec = [
    [CAN_BO, 'GET', '/submissions/10'],
    [CAN_BO, 'GET', '/submissions/10'],
    [CAN_BO, 'PATCH', '/submissions/10/status', { status: 'resolved' }],
    [TRUONG, 'GET', '/logs'],
    [TRUONG, 'GET', '/logs/thong-ke'],
    [TRUONG, 'GET', '/logs/xuat'],
    [TRUONG, 'DELETE', '/trash/30'],
  ];
  for (const [staff, method, duong, body] of cacViec) {
    const r = await goi(staff, method, duong, body);
    assert.ok(r.status < 300, `${method} ${duong}: ${r.status} ${r.text.slice(0, 200)}`);
  }
  const hanhDong = ctl.db.prepare('SELECT action FROM staff_activity_logs ORDER BY id').all().map((d) => d.action);
  assert.deepEqual(hanhDong, ['view_submission', 'update_status', 'view_logs', 'export_logs', 'trash_purge']);
});
