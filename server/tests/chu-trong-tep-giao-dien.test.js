/**
 * GIAO DIỆN CHỮ TRONG TỆP ĐÍNH KÈM (P52, ADR-005)
 * ============================================================================
 *
 *   · Chữ trích hiện như CHỮ (không chèn HTML) — tệp người ngoài gửi vào không
 *     được biến thành mã chạy trong phiên cán bộ.
 *   · Tô từ khoá không dấu, giống cách máy chủ tìm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const u = BO_QUA ? {} : await import(goc('src/utils/chuTrongTep.ts').href);

test('tô từ khoá: không dấu, không phân biệt hoa thường, đúng vị trí trong chữ gốc', { skip: BO_QUA }, () => {
  const doan = u.tachDanhDau('Đối tượng ở đường Huỳnh Văn Lũy, gần HUỲNH VĂN LŨY 2', 'huynh van luy');
  assert.deepEqual(doan.filter((d) => d.khop).map((d) => d.chu), ['Huỳnh Văn Lũy', 'HUỲNH VĂN LŨY']);
  assert.equal(doan.map((d) => d.chu).join(''), 'Đối tượng ở đường Huỳnh Văn Lũy, gần HUỲNH VĂN LŨY 2', 'ghép lại đúng chữ gốc');
  assert.deepEqual(u.tachDanhDau('đường Đ', 'duong').filter((d) => d.khop).map((d) => d.chu), ['đường']);
  assert.deepEqual(u.tachDanhDau('abc', 'a'), [{ chu: 'abc', khop: false }], 'từ khoá 1 ký tự không tô');
  assert.equal(u.tachDanhDau('😀 biển số 61-B1', 'bien so').filter((d) => d.khop)[0].chu, 'biển số', 'biểu tượng cảm xúc không làm lệch vị trí');
});

test('mô tả cách lấy chữ: OCR ghi rõ độ tin cậy và ngôn ngữ', { skip: BO_QUA }, () => {
  assert.match(u.moTaPhuongPhap({ phuongPhap: 'ocr_anh', soTrang: 1, doTinCay: 87, ngonNgu: 'vie+eng' }), /OCR.*Việt \+ Anh.*87%/);
  assert.match(u.moTaPhuongPhap({ phuongPhap: 'docx', soTrang: null, doTinCay: null, ngonNgu: null }), /đúng từng ký tự/);
  assert.equal(u.laOcr('pdf_chu'), false);
  assert.equal(u.conDangTrich([{ trangThai: 'xong' }, { trangThai: 'cho' }]), true);
});

test('khu chữ trong tệp: không chèn HTML, có nhắc đối chiếu bản gốc khi là OCR', async () => {
  const ma = await readFile(goc('src/components/admin/KhuChuTrongTep.tsx'), 'utf8');
  assert.doesNotMatch(ma, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(ma, /Đối chiếu bản gốc/);
  assert.match(await readFile(goc('src/pages/admin/AdminSubmissionDetailPage.tsx'), 'utf8'), /<KhuChuTrongTep hoSoId=/);
  assert.match(await readFile(goc('src/pages/admin/AdminSubmissionsPage.tsx'), 'utf8'), /s\.khop_tep/);
});
