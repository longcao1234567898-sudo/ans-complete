/**
 * NHÃN "CHỜ SÀNG LỌC" Ở HUY HIỆU TRẠNG THÁI PHÍA CÁN BỘ — ND-045
 * ============================================================================
 *
 * Commit adff87d đổi "Chờ tiếp nhận" thành "Chờ sàng lọc" ở Tổng quan, Báo
 * cáo, bộ lọc, nhưng sót huy hiệu: tin trong hàng Sàng lọc vẫn mang nhãn "Đã
 * tiếp nhận" (src/components/admin/statusMeta.ts). Cán bộ thấy hai tên cho
 * cùng một trạng thái.
 *
 * Không đổi đồng loạt nhãn của 'received': tin tố giác mật và tin ngoài thẩm
 * quyền cũng mang 'received' mà KHÔNG nằm trong hàng sàng lọc; mốc "tiếp nhận"
 * trong lịch sử xử lý cũng không phải "chờ sàng lọc". Nên có hàm
 * nhanTrangThai(tin) theo đúng điều kiện máy chủ (lib/sang-loc.js
 * DANG_CHO_SANG_LOC): ưu tiên cờ dang_cho_sang_loc máy chủ trả; không có thì
 * tự tính khi đủ cờ; thiếu dữ liệu thì giữ nhãn chung — gắn sai còn tệ hơn.
 *
 * Nhãn phía người dân (src/utils/constants.ts) giữ "Đã tiếp nhận": người gửi
 * không cần biết tin đang ở bước sàng lọc.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const m = BO_QUA ? {} : await import(goc('src/components/admin/statusMeta.ts').href);

test('nhanTrangThai: chỉ tin đúng là đang ở hàng sàng lọc mới là "Chờ sàng lọc"', { skip: BO_QUA }, () => {
  const ca = [
    [{ status: 'received', dang_cho_sang_loc: true }, 'Chờ sàng lọc'],
    [{ status: 'received', dang_cho_sang_loc: false, to_giac_mat: 1 }, 'Đã tiếp nhận'],
    [{ status: 'received', is_anonymous: false, to_giac_mat: 0, ngoai_tham_quyen: 0 }, 'Chờ sàng lọc'],
    [{ status: 'received', is_anonymous: 0, to_giac_mat: 1, ngoai_tham_quyen: 0 }, 'Đã tiếp nhận'],
    [{ status: 'received', is_anonymous: 0, to_giac_mat: 0, ngoai_tham_quyen: 1 }, 'Đã tiếp nhận'],
    [{ status: 'received', is_anonymous: true, to_giac_mat: 0, ngoai_tham_quyen: 0 }, 'Đã tiếp nhận'],
    [{ status: 'received', is_anonymous: 0, to_giac_mat: 0, ngoai_tham_quyen: 0, deleted_at: '2026-10-01' }, 'Đã tiếp nhận'],
    [{ status: 'received' }, 'Đã tiếp nhận'],                       // thiếu cờ (Tổng quan) -> nhãn chung
    [{ status: 'processing', dang_cho_sang_loc: false }, 'Đang xử lý'],
    [{ status: 'la_lung' }, 'la_lung'],
  ];
  for (const [tin, mong] of ca) assert.equal(m.nhanTrangThai(tin), mong, JSON.stringify(tin));
});

test('mốc lịch sử "received" vẫn là "Đã tiếp nhận"', { skip: BO_QUA }, () => {
  assert.equal(m.STATUS_META.received.label, 'Đã tiếp nhận');
});

test('huy hiệu ở danh sách, trang chi tiết, khu tin trùng và tệp Excel dùng nhanTrangThai', async () => {
  for (const [tep, mau] of [
    ['src/pages/admin/AdminSubmissionsPage.tsx', /nhanTrangThai\(s\)/],
    ['src/pages/admin/AdminSubmissionsPage.tsx', /'Trạng thái':\s*nhanTrangThai\(d\)/],
    ['src/pages/admin/AdminSubmissionDetailPage.tsx', /nhanTrangThai\(data\)/],
    ['src/components/admin/KhuTinTrung.tsx', /nhanTrangThai\(m\)/],
  ]) {
    const ma = await readFile(goc(tep), 'utf8');
    assert.match(ma, mau, `${tep} chưa dùng nhanTrangThai cho huy hiệu`);
  }
});
