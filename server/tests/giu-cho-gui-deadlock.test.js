/**
 * BUG-038 — GỬI ĐỒNG THỜI KHÔNG ĐƯỢC LÀM MẤT Ý KIẾN VÌ DEADLOCK Ở BẢNG GIỮ CHỖ
 *
 * Đo tải P68 trên MySQL 8 thật: 300 người gửi cùng lúc thì vài người nhận 500
 * "Gửi thất bại" — ý kiến không được lưu. Gốc: mỗi lượt gửi dọn MỌI chỗ giữ hết
 * hạn (`DELETE … WHERE het_han < ?`, đi qua chỉ mục het_han rồi khoá chính) đúng
 * lúc lượt khác trả chỗ (`DELETE … WHERE khoa = ? AND chu = ?`, khoá chính rồi chỉ
 * mục) — hai thứ tự khoá ngược nhau, InnoDB huỷ một bên (ER_LOCK_DEADLOCK) và
 * giuCho ném lỗi lên route.
 *
 * Pool giả ở đây ném ĐÚNG lỗi MySQL đã ném lúc đo (code + errno), ở đúng câu lệnh.
 * Ràng buộc atomic của giới hạn (luật 6) vẫn phải nguyên: test bo-dem-gui-dong-thoi.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const gc = await import('../src/lib/giu-cho-gui.js');

const loiDeadlock = () => Object.assign(new Error('Deadlock found when trying to get lock; try restarting transaction'),
  { code: 'ER_LOCK_DEADLOCK', errno: 1213 });

/** Pool giả: ghi lại mọi câu lệnh; `hong(sql, lan)` quyết định câu nào ném deadlock */
function poolGia(hong = () => false) {
  const da = [];
  const dem = new Map();
  const pool = {
    da,
    hetHan: false,
    async query(sql, params) {
      const loai = sql.startsWith('DELETE FROM khoa_gui_tam WHERE het_han') ? 'don'
        : sql.startsWith('INSERT') ? 'giu' : sql.startsWith('DELETE FROM khoa_gui_tam WHERE khoa') ? 'tra' : 'khac';
      const lan = (dem.get(loai) || 0) + 1;
      dem.set(loai, lan);
      da.push(loai);
      if (hong(loai, lan, params)) throw loiDeadlock();
      /* Dọn riêng một khoá ĐÃ HẾT HẠN khi gặp trùng: mặc định coi như người kia
         còn hạn (0 dòng bị xoá) — test chỗ hết hạn tự đặt lại */
      if (/WHERE khoa = \? AND het_han </.test(sql)) return [{ affectedRows: pool.hetHan ? 1 : 0 }];
      return [{ affectedRows: 1 }];
    },
  };
  return pool;
}

beforeEach(() => gc.datLaiChoThu?.());

test('câu DỌN chỗ hết hạn bị deadlock: vẫn giữ được chỗ, lượt gửi KHÔNG hỏng', async () => {
  const pool = poolGia((loai) => loai === 'don');
  const kq = await gc.giuCho(pool, ['mang:a', 'sdt:b']);
  assert.equal(kq.ok, true, 'dọn chỗ hết hạn là việc phụ — lỗi của nó không được làm mất ý kiến');
  assert.deepEqual(pool.da.filter((x) => x === 'giu').length, 2, 'vẫn phải giữ đủ hai khoá');
});

test('câu GIỮ chỗ bị deadlock một lần: thử lại và giữ được', async () => {
  const pool = poolGia((loai, lan) => loai === 'giu' && lan === 1);
  const kq = await gc.giuCho(pool, ['mang:a']);
  assert.equal(kq.ok, true);
  assert.equal(pool.da.filter((x) => x === 'giu').length, 2, 'phải thử lại đúng câu INSERT bị huỷ');
});

test('câu GIỮ chỗ deadlock mãi: không thử vô hạn, báo lỗi để route trả lời', async () => {
  const pool = poolGia((loai) => loai === 'giu');
  await assert.rejects(() => gc.giuCho(pool, ['mang:a']), (e) => e.code === 'ER_LOCK_DEADLOCK');
  const soLan = pool.da.filter((x) => x === 'giu').length;
  assert.ok(soLan >= 2 && soLan <= 4, `thử lại có giới hạn (đã thử ${soLan} lần)`);
});

test('câu TRẢ chỗ bị deadlock một lần: thử lại — không để chỗ treo 60 giây chặn người gửi lần sau', async () => {
  const pool = poolGia((loai, lan) => loai === 'tra' && lan === 1);
  const kq = await gc.giuCho(pool, ['mang:a']);
  await kq.nha();
  assert.equal(pool.da.filter((x) => x === 'tra').length, 2, 'phải thử trả chỗ lần nữa');
});

test('trùng khoá (người khác đang giữ) vẫn trả { ok: false } như cũ — giới hạn atomic không đổi', async () => {
  const dup = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY', errno: 1062 });
  const pool = poolGia();
  const goc = pool.query.bind(pool);
  pool.query = async (sql, p) => { if (sql.startsWith('INSERT')) { pool.da.push('giu'); throw dup; } return goc(sql, p); };
  const kq = await gc.giuCho(pool, ['mang:a']);
  assert.equal(kq.ok, false);
  assert.equal(pool.da.filter((x) => x === 'giu').length, 1, 'trùng khoá KHÔNG được thử lại — đó là tín hiệu "đang có người giữ"');
});

test('dọn chỗ hết hạn không chạy ở MỌI lượt gửi giữa đợt dồn (giảm tranh khoá)', async () => {
  const pool = poolGia();
  for (let i = 0; i < 5; i++) await gc.giuCho(pool, [`mang:${i}`]);
  const soLanDon = pool.da.filter((x) => x === 'don').length;
  assert.equal(soLanDon, 1, `5 lượt gửi liền nhau chỉ cần dọn 1 lần, đang dọn ${soLanDon} lần`);
});

test('chỗ giữ ĐÃ HẾT HẠN (máy chủ chết giữa chừng để lại) không chặn người gửi, kể cả khi chưa tới lượt dọn chung', async () => {
  const dup = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY', errno: 1062 });
  const pool = poolGia();
  await gc.giuCho(pool, ['mang:truoc']);            // lượt trước đã dọn chung -> lượt sau chưa tới lượt dọn
  pool.hetHan = true;                               // khoá "mang:a" đang có dòng cũ đã hết hạn
  let lanGiu = 0;
  const goc = pool.query.bind(pool);
  pool.query = async (sql, p) => {
    if (sql.startsWith('INSERT')) { lanGiu += 1; if (lanGiu === 1) { pool.da.push('giu'); throw dup; } }
    return goc(sql, p);
  };
  const kq = await gc.giuCho(pool, ['mang:a']);
  assert.equal(kq.ok, true, 'dòng hết hạn của khoá này phải bị dọn riêng rồi giữ lại');
  assert.equal(pool.da.filter((x) => x === 'don').length, 1, 'không cần dọn chung lần nữa');
});
