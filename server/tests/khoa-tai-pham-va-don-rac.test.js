/**
 * KHOÁ TÁI PHẠM 3 LẦN VÀ DỌN ĐƠN CÙNG THIẾT BỊ TRONG 24 GIỜ
 *
 * Hai cơ chế này đều là VIỆC LÀM THEO LÔ do máy tự quyết: một cú bấm của cán
 * bộ có thể khoá một thiết bị suốt một tháng và quét cả loạt hồ sơ vào thùng
 * rác. Sai ở đây không kêu thành lỗi — nó chỉ lặng lẽ chặn oan người vô can.
 * Nên các mốc an toàn phải được khoá lại bằng test.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const LIB = '../src/lib/chan-spam.js';
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
    const khoi = ma.slice(ma.indexOf('export async function xetKhoaTaiPham'), ma.indexOf('export async function donDonCungThietBi'));
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
    const khoi = ma.slice(ma.indexOf('export async function xetKhoaTaiPham'), ma.indexOf('export async function donDonCungThietBi'));
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
    const khoi = ma.slice(ma.indexOf('export async function xetKhoaTaiPham'), ma.indexOf('export async function donDonCungThietBi'));
    assert.match(khoi, /status = 'spam' AND deleted_by IS NOT NULL/,
      'phải đòi có deleted_by — không thì một lần khoá 24 giờ tự đẻ ra chuỗi ba lần, leo thang khoá oan');
  });
});

describe('T3 — dọn 24 giờ: vào thùng rác, không xoá hẳn', () => {
  test('dùng deleted_at chứ không DELETE FROM', async () => {
    const ma = await doc(LIB);
    /* Cắt ĐÚNG thân hàm. Cắt tới cuối tệp thì lọt sang goKhoa phía sau —
       hàm đó có DELETE FROM blacklists (xoá bản ghi khoá, hoàn toàn hợp lệ)
       nên test báo hỏng oan. */
    const dau = ma.indexOf('export async function donDonCungThietBi');
    const khoi = ma.slice(dau, ma.indexOf('export async function', dau + 10));
    assert.match(khoi, /UPDATE submissions/);
    assert.match(khoi, /deleted_at = NOW\(\)/);
    assert.doesNotMatch(khoi, /DELETE\s+FROM/i,
      'quét theo lô chắc chắn có lúc quét nhầm — xoá hẳn thì mất luôn tin báo thật');
  });

  test('cửa sổ đúng 24 giờ', async () => {
    const ma = await doc(LIB);
    assert.match(ma, /CUA_SO_DON_DEP_GIO\s*=\s*24/);
    /* Cắt ĐÚNG thân hàm. Cắt tới cuối tệp thì lọt sang goKhoa phía sau —
       hàm đó có DELETE FROM blacklists (xoá bản ghi khoá, hoàn toàn hợp lệ)
       nên test báo hỏng oan. */
    const dau = ma.indexOf('export async function donDonCungThietBi');
    const khoi = ma.slice(dau, ma.indexOf('export async function', dau + 10));
    assert.match(khoi, /INTERVAL \? HOUR/);
  });
});

describe('T4 — dọn 24 giờ KHÔNG đụng đơn cán bộ đã xử lý', () => {
  /* Đơn đang xử lý, đã giải quyết, hoặc đã phân công là đơn đã có người ĐỌC
     VÀ QUYẾT ĐỊNH. Máy quét đè lên quyết định của người là sai — có thể xoá
     mất một vụ việc đang điều tra dở. */

  test('chỉ quét đơn còn nguyên trong hàng chờ', async () => {
    const ma = await doc(LIB);
    /* Cắt ĐÚNG thân hàm. Cắt tới cuối tệp thì lọt sang goKhoa phía sau —
       hàm đó có DELETE FROM blacklists (xoá bản ghi khoá, hoàn toàn hợp lệ)
       nên test báo hỏng oan. */
    const dau = ma.indexOf('export async function donDonCungThietBi');
    const khoi = ma.slice(dau, ma.indexOf('export async function', dau + 10));
    assert.match(khoi, /status IN \('pending_review','received'\)/,
      'phải giới hạn ở đơn chưa ai đụng tới');
    assert.doesNotMatch(khoi, /'processing'/, 'không được đụng đơn đang xử lý');
    assert.doesNotMatch(khoi, /'resolved'/, 'không được đụng đơn đã giải quyết');
    assert.match(khoi, /assigned_to IS NULL/, 'đơn đã phân công là đã có người phụ trách');
    assert.match(khoi, /deleted_at IS NULL/, 'không quét lại đơn đã ở thùng rác');
  });

  test('không quét chính đơn vừa bị đánh dấu', async () => {
    const ma = await doc(LIB);
    /* Cắt ĐÚNG thân hàm. Cắt tới cuối tệp thì lọt sang goKhoa phía sau —
       hàm đó có DELETE FROM blacklists (xoá bản ghi khoá, hoàn toàn hợp lệ)
       nên test báo hỏng oan. */
    const dau = ma.indexOf('export async function donDonCungThietBi');
    const khoi = ma.slice(dau, ma.indexOf('export async function', dau + 10));
    assert.match(khoi, /id <> \?/);
  });

  test('mô phỏng: lọc đúng nhóm đơn được quét', () => {
    const quetDuoc = (d) =>
      d.deviceId === 'X' && d.id !== 99 && d.deletedAt === null &&
      ['pending_review', 'received'].includes(d.status) && d.assignedTo === null;

    const base = { deviceId: 'X', id: 1, deletedAt: null, status: 'received', assignedTo: null };
    assert.equal(quetDuoc(base), true);
    assert.equal(quetDuoc({ ...base, status: 'processing' }), false, 'đang xử lý -> giữ lại');
    assert.equal(quetDuoc({ ...base, status: 'resolved' }), false, 'đã giải quyết -> giữ lại');
    assert.equal(quetDuoc({ ...base, assignedTo: 7 }), false, 'đã phân công -> giữ lại');
    assert.equal(quetDuoc({ ...base, id: 99 }), false, 'chính đơn vừa đánh dấu -> bỏ qua');
    assert.equal(quetDuoc({ ...base, deviceId: 'Y' }), false, 'thiết bị khác -> không đụng');
  });
});

describe('T5 — nói rõ với cán bộ đã dọn bao nhiêu', () => {
  /* Quét theo lô mà im lặng là kiểu giấu việc: cán bộ bấm một nút, năm hồ sơ
     biến mất khỏi hàng chờ, không ai hiểu vì sao. Đúng loại lỗi đã gây ra vụ
     64 việc quá hạn bị giấu. */

  test('route trả về soDonDaDon và nhắc khôi phục được', async () => {
    const ma = await doc(ROUTE);
    assert.match(ma, /soDonDaDon/);
    assert.match(ma, /Thùng rác/);
  });

  test('cả hai nút đánh dấu tin rác đều dọn và khoá', async () => {
    const ma = await doc(ROUTE);
    const soLanGoiDon = [...ma.matchAll(/donDonCungThietBi\(pool/g)].length;
    const soLanGoiTaiPham = [...ma.matchAll(/xetKhoaTaiPham\(pool/g)].length;
    assert.equal(soLanGoiDon, 2, 'nút ở hàng chờ và đường /:id/spam đều phải dọn');
    assert.equal(soLanGoiTaiPham, 2, 'cả hai nút đều phải xét tái phạm');
  });
});
