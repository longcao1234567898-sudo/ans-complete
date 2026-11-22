/**
 * KIỂM THỬ GIỌNG ĐỌC CÓ NHỊP ĐIỆU (tiengNoi.ts)
 *
 * Bảo đảm bộ chia nhịp đọc hướng dẫn tiếng Việt:
 *   - Chọn giọng Neural/Natural Việt tốt nhất trước khi lùi về Google / Linh / An
 *   - Tách rõ tiêu đề (nhất là dạng có "—") và nghỉ hơi trước khi vào nội dung
 *   - Nhấn chậm rõ ở câu lưu ý, hạ giọng nhẹ ở câu kết, nâng tươi ở câu "!"
 *   - Giữ cao độ trong [0.95, 1.05] để KHÔNG làm méo 6 thanh điệu tiếng Việt
 *   - Chế độ audio (/api/tts) giữ mọi mẩu <= 190 ký tự và <= 5 mẩu mỗi bước
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const mod = BO_QUA ? {} : await import(goc('src/utils/tiengNoi.ts').href);
const { taoKichBanNhip, xepHangGiong } = mod;

test('xepHangGiong ưu tiên giọng Neural/Natural tiếng Việt rồi mới tới Google, Linh, An', { skip: BO_QUA }, () => {
  const dsGiong = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Microsoft An - Vietnamese (Vietnam)', lang: 'vi-VN' },
    { name: 'Linh', lang: 'vi-VN' },
    { name: 'Google tiếng Việt', lang: 'vi-VN' },
    { name: 'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', lang: 'vi-VN' },
  ];

  const v1 = xepHangGiong(dsGiong, 'vi');
  assert.equal(v1?.name, 'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)');

  const v2 = xepHangGiong(dsGiong.slice(0, 4), 'vi');
  assert.equal(v2?.name, 'Google tiếng Việt');

  const v3 = xepHangGiong(dsGiong.slice(0, 3), 'vi');
  assert.equal(v3?.name, 'Linh');

  const v4 = xepHangGiong(dsGiong.slice(0, 2), 'vi');
  assert.equal(v4?.name, 'Microsoft An - Vietnamese (Vietnam)');

  /* Máy chỉ có giọng Anh -> trả undefined chứ không chọn nhầm giọng Anh khi đọc tiếng Việt */
  assert.equal(xepHangGiong([dsGiong[0]], 'vi'), undefined);

  /* Tìm giọng tiếng Anh -> chọn Google US English chứ không lấy HoaiMy */
  assert.equal(xepHangGiong(dsGiong, 'en')?.name, 'Google US English');
});

test('taoKichBanNhip tách tiêu đề có gạch ngang và nghỉ hơi trước khi đọc nội dung', { skip: BO_QUA }, () => {
  const nhip = taoKichBanNhip(
    {
      tieuDe: 'Bước 3 — Chọn loại việc',
      noiDung: 'Bấm vào một trong bốn thẻ này. Máy đã gợi ý sẵn thẻ phù hợp, đúng rồi thì bà con chỉ việc bấm đi tiếp.',
    },
    'vi',
    'speech'
  );

  assert.equal(nhip[0].vaiTro, 'tieuDe');
  assert.equal(nhip[0].vanBan, 'Bước 3');
  assert.ok(nhip[0].caoDo > 1.0);

  assert.equal(nhip[1].vaiTro, 'tieuDePhu');
  assert.equal(nhip[1].vanBan, 'Chọn loại việc');
  assert.ok(nhip[1].nghiSauMs >= 300, 'phải nghỉ hơi rõ sau tiêu đề trước khi vào câu hướng dẫn');
  assert.equal(nhip.at(-1)?.nghiSauMs, 0);
});

test('taoKichBanNhip nhấn chậm ở ý quan trọng, hạ giọng cuối câu và giữ nguyên thanh điệu [0.95..1.05]', { skip: BO_QUA }, () => {
  const nhipAnDanh = taoKichBanNhip(
    {
      tieuDe: 'Ô gửi ẩn danh',
      noiDung: 'Muốn giữ kín tên tuổi thì bà con bấm vào ô này. Không cần cho tên, không cần số điện thoại. Chỉ có ở nhóm tố giác tội phạm.',
    },
    'vi',
    'speech'
  );

  const nhipCuoi = nhipAnDanh.at(-1);
  assert.equal(nhipCuoi?.vaiTro, 'nhanManh');
  assert.ok(nhipCuoi.tocDo <= 0.92, 'câu lưu ý quan trọng phải đọc chậm rõ');
  assert.ok(nhipCuoi.caoDo < 1.0, 'câu lưu ý nằm ở cuối phải hạ giọng vững');
  assert.equal(nhipCuoi.nghiSauMs, 0);

  const nhipHaGiong = taoKichBanNhip(
    {
      tieuDe: 'Bước 4 — Cho công an cách liên hệ',
      noiDung: 'Bà con điền họ tên và số điện thoại để cán bộ gọi lại báo kết quả. Email không bắt buộc.',
    },
    'vi',
    'speech'
  );
  const ketThuong = taoKichBanNhip(
    {
      tieuDe: 'Chào mừng',
      noiDung: 'Câu mở đầu. Đây là câu kết thúc bình thường.',
    },
    'vi',
    'speech'
  );
  assert.equal(ketThuong.at(-1)?.vaiTro, 'haGiong');
  assert.ok(ketThuong.at(-1).caoDo < 1.0, 'câu kết bình thường phải hạ nhẹ cao độ');

  const chucMung = taoKichBanNhip(
    {
      tieuDe: 'Mục Tra cứu và Tin tức',
      noiDung: 'Mục Tra cứu để xem ý kiến đã gửi xử lý tới đâu. Bà con đã nắm được cách dùng rồi!',
    },
    'vi',
    'speech'
  );
  assert.equal(chucMung.at(-1)?.vaiTro, 'chucMung');
  assert.ok(chucMung.at(-1).caoDo > 1.0, 'câu kết có dấu ! giữ sắc thái tươi vui khích lệ');

  for (const nhom of [nhipAnDanh, nhipHaGiong, ketThuong, chucMung]) {
    for (const n of nhom) {
      assert.ok(n.caoDo >= 0.95 && n.caoDo <= 1.05, `caoDo=${n.caoDo} vượt biên độ bảo toàn thanh điệu tiếng Việt`);
    }
  }
});

test('taoKichBanNhip tự tách "Bước X trên 5." ở dải 5 bước HuongDanBuoc', { skip: BO_QUA }, () => {
  const nhip = taoKichBanNhip(
    {
      noiDung: 'Bước 1 trên 5. Bà con kể xem muốn báo chuyện gì. Có thể bấm nút micro để nói thay vì gõ.',
    },
    'vi',
    'speech'
  );

  assert.equal(nhip[0].vaiTro, 'tieuDe');
  assert.equal(nhip[0].vanBan, 'Bước 1 trên 5.');
  assert.ok(nhip[0].nghiSauMs >= 300);
});

test('chế độ audio trên toàn bộ 16 bước hướng dẫn tiếng Việt đều <= 190 ký tự và <= 5 mẩu mỗi bước', { skip: BO_QUA }, async () => {
  const chu = await readFile(goc('src/i18n/chu.ts'), 'utf8');
  const tach = chu.indexOf("'hd.b1t': 'Welcome");
  const phanVi = chu.slice(0, tach);
  const bang = Object.fromEntries(
    [...phanVi.matchAll(/'(hd\.[a-z0-9]+)':\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2]])
  );

  for (let i = 1; i <= 16; i += 1) {
    const t = bang[`hd.b${i}t`];
    const n = bang[`hd.b${i}n`];
    assert.ok(t && n, `thiếu chuỗi hd.b${i}`);
    const cac = taoKichBanNhip({ tieuDe: t, noiDung: n }, 'vi', 'audio');
    assert.ok(cac.length >= 2 && cac.length <= 5, `hd.b${i} có ${cac.length} mẩu audio`);
    assert.equal(cac.at(-1)?.nghiSauMs, 0);
    for (const m of cac) {
      assert.ok(m.vanBan.length <= 190, `hd.b${i} vượt 190 ký tự: ${m.vanBan.length}`);
      assert.ok(m.caoDo >= 0.95 && m.caoDo <= 1.05);
    }
  }
});
