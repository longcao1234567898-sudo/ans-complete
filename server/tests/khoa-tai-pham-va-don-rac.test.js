/**
 * KHOÁ TÁI PHẠM 3 LẦN — VÀ MỖI CÚ "TIN RÁC" CHỈ TÁC ĐỘNG MỘT ĐƠN
 *
 * Khoá tái phạm là việc máy tự quyết: ba cú bấm của cán bộ có thể khoá một
 * thiết bị suốt một tháng. Sai ở đây không kêu thành lỗi — nó chỉ lặng lẽ chặn
 * oan người vô can. Nên các mốc an toàn phải được khoá lại bằng test.
 *
 * Trước BUG-018 còn có "dọn theo lô" (một cú bấm đưa mọi đơn cùng máy trong 24
 * giờ vào thùng rác). Đã gỡ theo SEC-DEC-008 M-D; test hành vi ở
 * mot-cu-bam-mot-don.test.js, ở đây chỉ canh mã.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const LIB = '../src/lib/chan-spam.js';
/** Đúng thân hàm xetKhoaTaiPham — tới dấu đóng hàm đầu tiên ở đầu dòng */
const thanTaiPham = (ma) => {
  const dau = ma.indexOf('export async function xetKhoaTaiPham');
  return ma.slice(dau, ma.indexOf('\n}\n', dau));
};
const ROUTE = '../src/routes/admin/submissions.js';

describe('T1 — ngưỡng và thời hạn khoá tái phạm', () => {
  test('ba lần liên tiếp, cửa sổ 30 ngày, khoá 30 ngày', async () => {
    const ma = await doc(LIB);
    assert.match(ma, /NGUONG_TAI_PHAM\s*=\s*3/);
    assert.match(ma, /CUA_SO_TAI_PHAM_NGAY\s*=\s*30/);
    assert.match(ma, /KHOA_TAI_PHAM_GIO\s*=\s*30\s*\*\s*24/);
  });

  test('khoá tái phạm vẫn CÓ HẠN, không vĩnh viễn', async () => {
    const ma = await doc(LIB);
    const khoi = thanTaiPham(ma);
    assert.match(khoi, /expires_at\s*=\s*DATE_ADD\(NOW\(\), INTERVAL \? HOUR\)/,
      'thiếu hạn khoá — mã thiết bị đổi chủ được, khoá vĩnh viễn là chặn oan người sau');
    assert.doesNotMatch(khoi, /expires_at\s*=\s*NULL/);
  });
});

describe('T2 — "liên tiếp" chứ không phải "cộng dồn"', () => {
  /* Đếm cộng dồn thì một người gửi năm mươi tin báo thật, lỡ ba tin bị đánh
     nhầm trong cả tháng, cũng bị khoá — mất hẳn một người báo tin tích cực. */

  test('chỉ lấy đúng NGUONG_TAI_PHAM quyết định gần nhất', async () => {
    const ma = await doc(LIB);
    const khoi = thanTaiPham(ma);
    assert.match(khoi, /ORDER BY[\s\S]*DESC[\s\S]*LIMIT \?/, 'phải sắp theo thời gian và giới hạn số bản ghi');
    assert.match(khoi, /rows\.every\(/, 'phải kiểm CẢ BA đều là tin rác');
  });

  test('mô phỏng: chuỗi đứt thì không khoá', () => {
    const xet = (ds) => ds.length >= 3 && ds.slice(0, 3).every((s) => s === 'spam');

    assert.equal(xet(['spam', 'spam', 'spam']), true, 'ba lần liên tiếp -> khoá');
    assert.equal(xet(['spam', 'received', 'spam', 'spam']), false,
      'xen giữa một đơn được duyệt -> chuỗi đứt, đếm lại từ đầu');
    assert.equal(xet(['spam', 'spam']), false, 'mới hai lần -> chưa khoá');
    assert.equal(xet(['resolved', 'spam', 'spam', 'spam']), false,
      'quyết định gần nhất là đã giải quyết -> không phải tái phạm');
    assert.equal(xet([]), false);
  });

  test('không đếm đơn bị chặn ngầm do máy tự gắn', async () => {
    const ma = await doc(LIB);
    const khoi = thanTaiPham(ma);
    /* Đơn rác chỉ là quyết định khi có dòng lịch sử 'spam' do cán bộ ghi trên
       chính đơn đó (BUG-018). Đơn chặn ngầm không có dòng đó, hoặc có dòng mang
       GHI_CHU_KHONG_TINH_TAI_PHAM (BUG-015) — cả hai đều không được đếm. */
    const sql = khoi.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(sql, /status = 'spam'\s+AND EXISTS \(SELECT 1 FROM status_history h[\s\S]*?h\.new_status = 'spam' AND h\.changed_by IS NOT NULL\)/,
      'phải đòi dòng lịch sử cán bộ ghi — không thì một lần khoá 24 giờ tự đẻ ra chuỗi ba lần, leo thang khoá oan');
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM status_history h[\s\S]*?h\.note = \?\)/,
      'phải loại đơn chặn ngầm bị đánh rác tay (GHI_CHU_KHONG_TINH_TAI_PHAM)');
    assert.doesNotMatch(sql, /deleted_by/,
      'deleted_by không phân biệt cú bấm với đơn bị cuốn theo — một cú bấm thành ba lần (BUG-018)');
  });
});

describe('T3 — mỗi cú "Tin rác" chỉ tác động đúng một đơn (BUG-018)', () => {
  /* Dọn theo lô cuốn các đơn cùng máy vào thùng rác cùng giây, cùng người xoá:
     một cú bấm thành "ba lần liên tiếp", đơn thật tự xoá sau 7 ngày, và thùng
     rác lộ nhóm đơn cùng máy. SEC-DEC-008 M-D gỡ hẳn. */

  test('không còn hàm dọn theo lô, không route nào gọi, phản hồi không còn soDonDaDon', async () => {
    const lib = await doc(LIB);
    const ma = await doc(ROUTE);
    assert.doesNotMatch(lib, /export async function donDonCungThietBi/);
    assert.doesNotMatch(ma, /donDonCungThietBi/, 'route còn gọi dọn theo lô');
    assert.doesNotMatch(ma, /soDonDaDon/, 'phản hồi còn báo số đơn cùng máy bị dọn');
  });

  test('cả hai nút đánh dấu tin rác vẫn khoá và xét tái phạm', async () => {
    const ma = await doc(ROUTE);
    const soLanGoiKhoa = [...ma.matchAll(/khoaThietBi\(pool/g)].length;
    const soLanGoiTaiPham = [...ma.matchAll(/xetKhoaTaiPham\(pool/g)].length;
    assert.equal(soLanGoiKhoa, 2, 'nút ở hàng chờ và đường /:id/mark-spam đều phải khoá');
    assert.equal(soLanGoiTaiPham, 2, 'cả hai nút đều phải xét tái phạm');
  });
});
