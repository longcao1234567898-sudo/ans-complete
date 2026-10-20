/**
 * VÒNG HƯỚNG DẪN NGƯỜI MỚI (P76) — những lỗi đã đo trên trình duyệt thật
 *
 *   · Bước cuối: máy ĐỌC lời bước "Tra cứu" nhưng thẻ lại GHI "Hoàn tất hướng
 *     dẫn" — tai nghe một đằng, mắt đọc một nẻo; lời bước cuối không bao giờ hiện.
 *   · Điện thoại nhỏ (360×640): thẻ che 19–36% đúng ô đang chỉ ở 4 bước, vì phần
 *     tử được cuộn ra GIỮA màn hình, hai bên đều không đủ chỗ cho thẻ.
 *   · Không có đường quay lại bước trước: lỡ bấm Tiếp tục là mất lời bước đó.
 *   · Dải 5 bước của biểu mẫu luôn đọc giọng Việt và ghi chữ Việt dù đã đổi tiếng Anh.
 *   · Lời hướng dẫn: "GPS" người lớn tuổi không hiểu; bản điện thoại và bản tiếng
 *     Anh của ô ẩn danh thiếu câu "chỉ có ở nhóm tố giác" — bà con chọn nhóm khác
 *     đi tìm ô ẩn danh mà không thấy.
 *
 * Phần đo vị trí thẻ chạy trên trình duyệt thật (ghi ở TIEN-DO P76); test này
 * giữ cho mã và lời không trượt lại.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

async function loi() {
  const s = await doc('src/i18n/chu.ts');
  const tach = s.indexOf("'hd.b1t': 'Welcome");
  const lay = (phan) => Object.fromEntries([...phan.matchAll(/'(hd\.[a-z0-9]+)':\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2]]));
  return { vi: lay(s.slice(0, tach)), en: lay(s.slice(tach)) };
}

test('bước cuối hiện ĐÚNG lời của bước đó — không ghi đè bằng "Hoàn tất"', async () => {
  const ma = await doc('src/components/common/HuongDanBanDau.tsx');
  assert.doesNotMatch(ma, /laCuoi\s*\?\s*dich\('hd\.done'\)/, 'tiêu đề bước cuối bị thay bằng hd.done');
  assert.doesNotMatch(ma, /laCuoi\s*\n?\s*\?\s*dich\('hd\.doneMsg'\)/, 'lời bước cuối bị thay bằng hd.doneMsg');
});

test('thẻ không che ô đang chỉ: cuộn phần tử lên gần đỉnh, đặt thẻ ở phía còn nhiều chỗ hơn', async () => {
  const ma = await doc('src/components/common/HuongDanBanDau.tsx');
  assert.doesNotMatch(ma, /scrollIntoView\(\{\s*block:\s*'center'/, 'cuộn ra giữa màn hình làm hai bên đều thiếu chỗ cho thẻ');
  assert.doesNotMatch(ma, /oSang\.top\s*>\s*window\.innerHeight\s*\*\s*0\.45/, 'quy tắc cũ chỉ nhìn mép trên của ô sáng');
  assert.match(ma, /khoangTren/);
  assert.match(ma, /khoangDuoi/);
});

test('có nút Quay lại và phím mũi tên ← →; Esc KHÔNG bỏ qua hẳn', async () => {
  const ma = await doc('src/components/common/HuongDanBanDau.tsx');
  assert.match(ma, /dich\('common\.back'\)/);
  assert.match(ma, /'ArrowRight'/);
  assert.match(ma, /'ArrowLeft'/);
  assert.doesNotMatch(ma, /'Escape'\)\s*dong\(\)/, 'lỡ bấm Esc là mất hẳn hướng dẫn — người lớn tuổi không biết mở lại');
});

test('dải 5 bước của biểu mẫu đọc và ghi theo ngôn ngữ đang chọn', async () => {
  const ma = await doc('src/components/FeedbackForm/HuongDanBuoc.tsx');
  assert.match(ma, /docTiengViet\(.*,\s*ngonNgu\);/, 'phải truyền ngonNgu khi đọc');
  assert.doesNotMatch(ma, /'Dừng'|'Nghe'|'Dừng đọc hướng dẫn'/, 'còn chữ Việt gán cứng');
});

test('lời hướng dẫn: không dùng chữ "GPS"; ô ẩn danh nói rõ chỉ có ở nhóm tố giác (cả 4 bản)', async () => {
  const { vi, en } = await loi();
  for (const k of ['hd.b4n', 'hd.b14n']) {
    assert.doesNotMatch(vi[k], /GPS/, `${k} (vi)`);
    assert.doesNotMatch(en[k], /GPS/, `${k} (en)`);
  }
  for (const k of ['hd.b9n', 'hd.b15n']) {
    assert.match(vi[k], /tố giác/, `${k} (vi) phải nói chỉ có ở nhóm tố giác`);
    assert.match(en[k], /crime/i, `${k} (en) phải nói chỉ có ở nhóm tố giác`);
  }
});

test('bước 1 không bảo bấm vào menu — lớp phủ chặn bấm, bà con bấm mà không có gì xảy ra', async () => {
  const { vi, en } = await loi();
  assert.doesNotMatch(vi['hd.b1n'], /Bấm vào mục Gửi ý kiến/);
  assert.match(vi['hd.b1n'], /Tiếp tục/);
  assert.match(en['hd.b1n'], /Continue/);
});
