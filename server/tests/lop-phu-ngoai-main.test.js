/**
 * LỚP PHỦ NGOÀI <main> — lỗi thật: trên điện thoại, chân trang đè lên đáy khung
 * thêm điểm đen, bấm Thêm / Thôi không ăn (xem src/components/common/LopPhu.tsx).
 * Không có bộ test giao diện chạy trình duyệt trong npm test, nên ở đây quét mã
 * nguồn (cùng cách trang-du-phong.test.js). Kiểm trên trình duyệt thật đã làm
 * bằng Playwright khi sửa — xem thân commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const SRC = new URL('../../src/', import.meta.url);
const doc = (duong) => readFile(new URL(duong, SRC), 'utf8');

async function moiTsx(thuMuc = '') {
  const kq = [];
  for (const m of await readdir(new URL(thuMuc, SRC), { withFileTypes: true })) {
    const duong = `${thuMuc}${m.name}`;
    if (m.isDirectory()) kq.push(...await moiTsx(`${duong}/`));
    else if (m.name.endsWith('.tsx')) kq.push(duong);
  }
  return kq;
}

/* Hai tệp này dựng NGOÀI <main> (Header, nền trang) nên không bị chân trang đè */
const NGOAI_MAIN = new Set(['components/Layout/Sidebar.tsx', 'components/common/PageBackground.tsx']);

test('lớp phủ fixed nổi trên trang phải đưa ra document.body (chân trang không đè lên nút)', async () => {
  const sai = [];
  for (const tep of await moiTsx()) {
    if (NGOAI_MAIN.has(tep) || tep === 'components/common/LopPhu.tsx') continue;
    const ma = await doc(tep);
    /* fixed inset-0 kèm z dương: lớp phủ nổi lên trên nội dung */
    if (!/fixed inset-0 z-(\[\d+\]|\d+)/.test(ma)) continue;
    if (!/from '\.{1,2}\/(\.\.\/)?(components\/)?(common\/)?LopPhu'|createPortal/.test(ma)) sai.push(tep);
  }
  assert.deepEqual(sai, [], 'lớp phủ còn nằm trong <main>: chân trang (relative z-10) vẽ đè lên đáy khung');
});
