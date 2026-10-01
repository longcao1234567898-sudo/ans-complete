/**
 * NHẬT KÝ PHẢI GHI ĐƯỢC THẬT TRÊN MYSQL — cột details là JSON
 *
 * staff_activity_logs.details có kiểu JSON (TRON_BO_DATABASE_V5.sql). Ghi chuỗi
 * chữ trần ("Xoá vĩnh viễn tin trong thùng rác") vào đó thì MySQL từ chối cả
 * câu INSERT; các route bọc câu ghi trong try/catch rỗng nên lỗi bị nuốt — thao
 * tác vẫn chạy, nhật ký không có dòng nào. Mất đúng những dấu vết cần nhất:
 * ai xoá vĩnh viễn hồ sơ, ai dọn thùng rác, ai nhập hộ ở trụ sở, ai miễn khoá
 * cho một thiết bị.
 *
 * Khung SQLite đặt ràng buộc json_valid cho cột details để bắt chước MySQL.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, TRUONG, CAN_BO, MAY_A } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

let ctl;
beforeEach(() => {
  if (BO_QUA) return;
  ctl = dungCsdl(pool);
  const them = ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status,
      is_anonymous, deleted_at, deleted_by) VALUES (?,?,?,3,'rejected',0,?,?)`);
  them.run(21, 'HS0021', 'Tin trong thùng rác 1', ctl.luc(60), TRUONG.id);
  them.run(22, 'HS0022', 'Tin trong thùng rác 2', ctl.luc(60), TRUONG.id);
  them.run(23, 'HS0023', 'Tin trong thùng rác 3', ctl.luc(60), TRUONG.id);
});

const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});
const dongNhatKy = (action) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ?').all(action);

function motDongHopLe(action, staffId) {
  const ds = dongNhatKy(action);
  assert.equal(ds.length, 1, `không có dòng nhật ký '${action}'`);
  assert.equal(ds[0].staff_id, staffId, 'phải ghi đích danh người làm');
  if (ds[0].details != null) assert.doesNotThrow(() => JSON.parse(ds[0].details));
  return ds[0];
}

test('khôi phục tin từ thùng rác -> có dòng trash_restore', { skip: BO_QUA }, async () => {
  const r = await goi(CAN_BO, 'POST', '/trash/21/restore');
  assert.equal(r.status, 200, r.text);
  motDongHopLe('trash_restore', CAN_BO.id);
});

test('xoá vĩnh viễn một tin -> có dòng trash_purge', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, 'DELETE', '/trash/22');
  assert.equal(r.status, 200, r.text);
  motDongHopLe('trash_purge', TRUONG.id);
});

test('dọn sạch thùng rác -> có dòng trash_empty, ghi số tin đã xoá', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, 'DELETE', '/trash');
  assert.equal(r.status, 200, r.text);
  const d = motDongHopLe('trash_empty', TRUONG.id);
  assert.match(String(d.details), /3/);
});

test('đánh dấu thiết bị tin cậy -> có dòng trust_device', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, 'POST', '/chat/trusted-devices', { deviceId: MAY_A, ghiChu: 'Máy kiosk trụ sở' });
  assert.equal(r.status, 201, r.text);
  motDongHopLe('trust_device', TRUONG.id);
});

test('cán bộ nhập hộ tại trụ sở -> có dòng kiosk_submit', { skip: BO_QUA }, async () => {
  const r = await goi(CAN_BO, 'POST', '/kiosk/submit', {
    content: 'Đèn đường ở ngõ 5 khu phố 1 bị hỏng đã hai tuần, buổi tối đi lại rất nguy hiểm.',
    category: 'phan_anh', fullName: 'Phạm Văn Phúc', phone: '0916284735',
  });
  assert.ok(r.status === 200 || r.status === 201, r.text);
  motDongHopLe('kiosk_submit', CAN_BO.id);
});

test('quét mã nguồn: mọi câu INSERT nhật ký có cột details đều đưa vào JSON.stringify', async () => {
  const goc = new URL('../src/', import.meta.url);
  const tep = [];
  const duyet = async (thuMuc) => {
    for (const d of await readdir(thuMuc, { withFileTypes: true })) {
      const u = new URL(d.name + (d.isDirectory() ? '/' : ''), thuMuc);
      if (d.isDirectory()) await duyet(u); else if (d.name.endsWith('.js')) tep.push(u);
    }
  };
  await duyet(goc);
  const sai = [];
  for (const u of tep) {
    const nguon = await readFile(u, 'utf8');
    for (const m of nguon.matchAll(/INSERT INTO staff_activity_logs\s*\(([^)]*)\)/g)) {
      if (!/\bdetails\b/.test(m[1])) continue;
      const sau = nguon.slice(m.index, m.index + 700);
      if (!/JSON\.stringify/.test(sau)) sai.push(`${u.pathname.split('/src/')[1]}:${nguon.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(sai, [], 'ghi chuỗi trần vào cột JSON -> MySQL từ chối, nhật ký mất dòng');
});
