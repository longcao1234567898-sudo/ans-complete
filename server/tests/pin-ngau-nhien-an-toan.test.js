/**
 * BUG-039 — MÃ PIN PHÒNG TRAO ĐỔI PHẢI SINH BẰNG BỘ SINH SỐ AN TOÀN
 *
 * PIN là lớp thứ hai (cùng mã tra cứu) để vào phòng trao đổi với cán bộ về một
 * hồ sơ — có thể là tố giác. `Math.random()` không phải bộ sinh số dùng cho bí
 * mật: trạng thái của nó suy ra được từ các kết quả trước. Mã tra cứu ngay bên
 * cạnh đã dùng `crypto.randomInt`; PIN phải cùng chuẩn.
 *
 * Cách thử: khoá cứng `Math.random` thành một giá trị biết trước — đúng hoàn cảnh
 * kẻ xấu đã đoán ra trạng thái. PIN sinh từ `Math.random` sẽ ra đúng số đoán
 * được; PIN sinh từ bộ sinh an toàn thì không bị ảnh hưởng.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');

beforeEach(() => { if (!BO_QUA) dungCsdl(pool); });

const gui = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });

test('Math.random bị đoán trước: PIN cấp cho người dân KHÔNG theo nó', { skip: BO_QUA }, async () => {
  const goc = Math.random;
  const DOAN = 0.123456;
  const pinDoanDuoc = String(Math.floor(100000 + DOAN * 900000));
  Math.random = () => DOAN;
  const pins = [];
  try {
    for (let i = 0; i < 4; i++) {
      const r = await gui(donCoTen(i));
      assert.equal(r.status, 201, `tin thứ ${i + 1}: ${r.status} ${r.text.slice(0, 200)}`);
      pins.push(r.body.chatPin);
    }
  } finally {
    Math.random = goc;
  }
  for (const p of pins) assert.match(String(p), /^[1-9]\d{5}$/, `PIN phải đủ 6 chữ số: ${p}`);
  assert.ok(pins.some((p) => p !== pinDoanDuoc), `cả ${pins.length} PIN đều là ${pinDoanDuoc} — sinh từ Math.random`);
  assert.ok(new Set(pins).size > 1, `PIN lặp lại: ${pins.join(', ')}`);
});

test('chỗ sinh PIN dùng crypto.randomInt, đủ dải 100000–999999', async () => {
  const nguon = await readFile(new URL('../src/routes/submissions.js', import.meta.url), 'utf8');
  const dong = nguon.split('\n').find((d) => /const chatPin\s*=/.test(d));
  assert.ok(dong, 'không tìm thấy chỗ sinh chatPin');
  assert.match(dong, /crypto\.randomInt\(100000,\s*1_?000_?000\)/);
  assert.doesNotMatch(dong, /Math\.random/);
});

/* Biến thể: không bí mật nào khác trong máy chủ sinh bằng Math.random. Allow-list
   (luật 5): chỉ những chỗ KHÔNG phải bí mật mới được dùng, ghi rõ vì sao. */
const DUOC_DUNG_MATH_RANDOM = new Map([
  ['lib/giu-cho-gui.js', 'độ trễ lệch khi thử lại lúc kẹt khoá CSDL — không phải bí mật'],
]);

async function dsTep(thuMuc, goc = thuMuc) {
  const kq = [];
  for (const m of await readdir(thuMuc, { withFileTypes: true })) {
    const p = new URL(m.name + (m.isDirectory() ? '/' : ''), thuMuc);
    if (m.isDirectory()) kq.push(...await dsTep(p, goc));
    else if (m.name.endsWith('.js')) kq.push(p.href.slice(goc.href.length));
  }
  return kq;
}

test('biến thể: Math.random trong server/src chỉ ở chỗ đã duyệt, không dùng cho bí mật', async () => {
  const goc = new URL('../src/', import.meta.url);
  const gap = [];
  for (const tep of await dsTep(goc)) {
    const n = ((await readFile(new URL(tep, goc), 'utf8')).match(/Math\.random\s*\(/g) || []).length;
    if (n && !DUOC_DUNG_MATH_RANDOM.has(tep)) gap.push(`${tep} (${n} chỗ)`);
  }
  assert.deepEqual(gap, [], `Math.random ngoài danh sách được phép: ${gap.join('; ')}`);
});
