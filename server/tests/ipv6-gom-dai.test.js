/**
 * P87 — IPv6: GIỚI HẠN THEO MẠNG PHẢI ĐẾM THEO DẢI /64, KHÔNG THEO TỪNG ĐỊA CHỈ
 *
 * Nhà mạng cấp cho MỖI thuê bao IPv6 cả một dải /64 (2^64 địa chỉ) và điện thoại
 * tự đổi địa chỉ trong dải đó (địa chỉ tạm thời). Đếm theo địa chỉ đầy đủ thì một
 * máy đổi địa chỉ mỗi lần là thoát mọi giới hạn: chống spam gửi ý kiến, dò mã tra
 * cứu, dò PIN rải nhiều hồ sơ, đăng nhập cán bộ, gửi mã xác minh tốn tiền.
 *
 * IPv4 KHÔNG đổi gì — mọi khoá đếm cũ giữ nguyên giá trị.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const helpers = await import('../src/lib/helpers.js');

test('gom địa chỉ IPv6 về dải /64; IPv4 giữ nguyên', () => {
  const { gomDaiIp } = helpers;
  assert.equal(typeof gomDaiIp, 'function', 'thiếu hàm gom dải');
  const a = gomDaiIp('2001:db8:1:2:aaaa:bbbb:cccc:1');
  assert.equal(a, gomDaiIp('2001:db8:1:2::9'), 'cùng /64 phải cùng khoá');
  assert.equal(a, gomDaiIp('2001:0DB8:0001:0002:0:0:0:ffff'), 'viết đầy đủ / chữ hoa vẫn cùng khoá');
  assert.notEqual(a, gomDaiIp('2001:db8:1:3::1'), 'khác /64 phải khác khoá');
  assert.equal(gomDaiIp('113.161.5.7'), '113.161.5.7', 'IPv4 không được đổi — khoá cũ vẫn khớp');
  assert.equal(gomDaiIp('::1'), gomDaiIp('::2'));
  /* Địa chỉ IPv6 CHỨA một IPv4 (NAT64 64:ff9b::/96, dạng ::ffff: viết không chuẩn):
     khoá là IPv4 bên trong — gom về /64 thì MỌI khách IPv4 chung một lượt */
  assert.equal(gomDaiIp('64:ff9b::113.161.5.7'), '113.161.5.7', 'NAT64 phải lấy IPv4 bên trong');
  assert.notEqual(gomDaiIp('64:ff9b::1.2.3.4'), gomDaiIp('64:ff9b::8.8.8.8'), 'hai khách IPv4 qua NAT64 phải khác khoá');
  assert.equal(gomDaiIp('64:ff9b::7199:507'), '113.153.5.7', 'NAT64 viết dạng hex');
  assert.equal(gomDaiIp('0:0:0:0:0:ffff:1.2.3.4'), '1.2.3.4', '::ffff: viết đầy đủ');
  assert.equal(gomDaiIp('fe80::1%eth0'), gomDaiIp('fe80::2'), 'bỏ chỉ số vùng');
  assert.equal(gomDaiIp(''), '');
});

test('khoaIp(req) đọc req.ip (qua trust proxy) rồi gom dải — không đọc header', () => {
  const { khoaIp } = helpers;
  assert.equal(khoaIp({ ip: '2001:db8:1:2::abcd', headers: { 'x-forwarded-for': '9.9.9.9' } }), helpers.gomDaiIp('2001:db8:1:2::1'));
  assert.equal(khoaIp({ ip: '::ffff:10.0.0.7' }), '10.0.0.7');
});

/* Mọi bộ giới hạn theo mạng phải khoá bằng khoaIp. Allow-list (luật 5): chỉ bộ nào
   KHÔNG đếm theo mạng mới được khoá khác, ghi rõ vì sao. */
const KHONG_THEO_MANG = new Map([['routes/admin/trich-chu.js', 'đếm theo cán bộ (req.staff.id)']]);

test('mọi rateLimit({...}) trong máy chủ khoá bằng khoaIp', async () => {
  const goc = new URL('../src/', import.meta.url);
  const tep = [];
  const duyet = async (d, tien) => {
    for (const e of await readdir(new URL(d, goc), { withFileTypes: true })) {
      if (e.isDirectory()) await duyet(`${d}${e.name}/`, `${tien}${e.name}/`);
      else if (e.name.endsWith('.js')) tep.push(`${tien}${e.name}`);
    }
  };
  await duyet('', '');
  const sai = [];
  for (const t of tep) {
    const s = await readFile(new URL(t, goc), 'utf8');
    for (const m of s.matchAll(/rateLimit\(\{[\s\S]*?\}\)/g)) {
      if (KHONG_THEO_MANG.has(t)) continue;
      if (!/keyGenerator:\s*\(?\w*\)?\s*=>\s*khoaIp\(|keyGenerator:\s*khoaGioiHan|keyGenerator:\s*khoaIp\b/.test(m[0])) sai.push(t);
    }
  }
  assert.deepEqual([...new Set(sai)], [], 'bộ giới hạn còn khoá theo địa chỉ đầy đủ (req.ip mặc định / layIpThat)');
});

test('chạy thật: 6 địa chỉ khác nhau CÙNG một /64 dùng chung lượt mở phòng (5/15 phút)', async () => {
  const { default: chatRouter } = await import('../src/routes/chat.js');
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  const sv = app.listen(0);
  try {
    const ma = [];
    for (let k = 1; k <= 6; k++) {
      const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/chat/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `2001:db8:77:1:${k.toString(16)}::${k}` },
        body: JSON.stringify({ code: 'ZZZZZZ', pin: 'x' }),
      });
      ma.push(r.status);
    }
    assert.equal(ma[5], 429, `địa chỉ thứ 6 trong cùng /64 vẫn được thử: ${ma.join(',')}`);
  } finally { sv.close(); }
});

test('chạy thật: gửi ý kiến từ hai địa chỉ cùng một /64 tính là CÙNG một mạng (cùng khoá chống spam)', async (t) => {
  const { BO_QUA, dungCsdl, donCoTen } = await import('./khung-sqlite.js');
  if (BO_QUA) return t.skip(BO_QUA);
  const { pool } = await import('../src/db.js');
  dungCsdl(pool);
  const { default: submissionsRouter } = await import('../src/routes/submissions.js');
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/submissions', submissionsRouter);
  const sv = app.listen(0);
  const gui = (ip, i) => fetch(`http://127.0.0.1:${sv.address().port}/api/submissions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(donCoTen(i)),
  }).then((r) => r.status);
  try {
    for (const [ip, i] of [['2001:db8:aa:1::1', 0], ['2001:db8:aa:1:ffff::2', 1], ['2001:db8:aa:2::1', 2]]) {
      assert.equal(await gui(ip, i), 201, ip);
    }
    /* Khoá chống spam (thời gian chờ, 5 tin/giờ, 2 tin ẩn danh/ngày) đều so cột
       ip_address đã băm — cùng /64 phải ra CÙNG một bản băm */
    const [rows] = await pool.query('SELECT ip_address FROM submissions ORDER BY id');
    const [a, b, c] = rows.slice(-3).map((r) => r.ip_address);
    assert.equal(a, b, 'đổi địa chỉ trong cùng /64 mà ra mạng khác — thoát mọi giới hạn');
    assert.notEqual(a, c, 'dải /64 khác phải là mạng khác');
  } finally { sv.close(); }
});

test('hướng dẫn triển khai có mục bật IPv6: Nginx [::]:80, bản ghi AAAA, cảnh báo ADMIN_ALLOWED_IPS', async () => {
  const s = await readFile(new URL('../../docs/HUONG-DAN-TRIEN-KHAI.md', import.meta.url), 'utf8');
  const muc = s.slice(s.indexOf('### B9b.'), s.indexOf('### B10.'));
  assert.ok(muc.length > 100, 'thiếu mục B9b');
  assert.match(muc, /listen \[::\]:80;/);
  assert.match(muc, /AAAA/);
  assert.match(muc, /ADMIN_ALLOWED_IPS/);
  assert.match(muc, /\/64/);
});

test('cảnh báo dò mật khẩu gom theo /64: đổi địa chỉ trong cùng dải vẫn bị báo', async () => {
  const ghi = [];
  const { pool } = await import('../src/db.js');
  const goc = pool.query;
  pool.query = async (sql, p = []) => {
    if (/INSERT INTO staff_activity_logs/.test(sql) && /login_failed/.test(sql)) ghi.push(p[1]);
    if (/FROM staff WHERE username/.test(sql)) return [[]];
    return [[], []];
  };
  try {
    const { default: auth } = await import('../src/routes/auth.js');
    const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/auth', auth);
    const sv = app.listen(0);
    try {
      for (let k = 1; k <= 3; k++) {
        await fetch(`http://127.0.0.1:${sv.address().port}/api/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `2001:db8:99:1::${k}` },
          body: JSON.stringify({ username: 'admin', password: `sai-mat-khau-${k}` }),
        });
      }
    } finally { sv.close(); }
  } finally { pool.query = goc; }
  assert.equal(ghi.length, 3, `phải ghi 3 lần đăng nhập sai: ${JSON.stringify(ghi)}`);
  assert.equal(new Set(ghi).size, 1, `màn hình cảnh báo gom theo ip_address — ba địa chỉ cùng /64 phải ghi cùng một khoá: ${ghi.join(', ')}`);
});
