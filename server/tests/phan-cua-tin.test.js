/**
 * MENU SÁNG ĐÚNG PHẦN CỦA TIN — lỗi người vận hành báo: mở một tin ở hàng Sàng
 * lọc (hay tin Ngoài thẩm quyền) thì menu nhảy sang "Tin đưa vào xử lý", vì
 * trang chi tiết của mọi tin dùng chung /quan-tri/y-kien/:id. Nay menu và nút
 * "Quay lại" theo src/utils/phanTin.ts. Hàm thuần, chạy thật bằng Node (bỏ kiểu
 * TS); Node cũ không đọc được .ts thì bỏ qua. Kiểm trên trình duyệt: thân commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const m = BO_QUA ? {} : await import(goc('src/utils/phanTin.ts').href);

const tin = (them) => ({ status: 'processing', deleted_at: null, to_giac_mat: 0, ngoai_tham_quyen: 0, dang_cho_sang_loc: false, category_code: 'phan_anh', ...them });

test('mỗi loại tin về đúng phần', { skip: BO_QUA }, () => {
  const ca = [
    [tin({ status: 'received', dang_cho_sang_loc: true }), '/quan-tri/sang-loc'],
    [tin({ status: 'received', ngoai_tham_quyen: 1 }), '/quan-tri/ngoai-tham-quyen'],
    [tin({ status: 'resolved', ngoai_tham_quyen: 1 }), '/quan-tri/ngoai-tham-quyen'],   // đã chuyển cơ quan: vẫn ở phần này
    [tin({ to_giac_mat: 1, ngoai_tham_quyen: 1 }), '/quan-tri/to-giac-mat'],            // hai cờ: phần mật (như lib/sang-loc.js)
    [tin({ status: 'received', to_giac_mat: true }), '/quan-tri/to-giac-mat'],
    [tin({ status: 'pending_review' }), '/quan-tri/kiem-duyet'],
    [tin({ category_code: 'to_giac' }), '/quan-tri/to-giac'],
    [tin({}), '/quan-tri/y-kien'],
    [tin({ deleted_at: '2026-10-01', to_giac_mat: 1 }), '/quan-tri/thung-rac'],
  ];
  for (const [t, mong] of ca) assert.equal(m.duongPhanCuaTin(t), mong, JSON.stringify(t));
});

test('state.tu chỉ nhận đường của một phần đã biết', { skip: BO_QUA }, () => {
  for (const d of ['/quan-tri/sang-loc', '/quan-tri/kiem-duyet', '/quan-tri/ngoai-tham-quyen']) assert.ok(m.laDuongPhan(d), d);
  for (const d of ['/quan-tri/nhat-ky', 'https://x.test', 'toString', '__proto__', 1, null]) assert.ok(!m.laDuongPhan(d), String(d));
});

test('trang chi tiết đưa phần của tin cho menu; menu so theo từng đoạn đường dẫn', async () => {
  const ct = await readFile(goc('src/pages/admin/AdminSubmissionDetailPage.tsx'), 'utf8');
  assert.match(ct, /<AdminLayout mucDangChon=\{duongPhan\}>/);
  assert.ok(!ct.includes("navigate('/quan-tri/y-kien')"), 'còn chỗ đưa về cứng "Tin đưa vào xử lý"');
  const layout = await readFile(goc('src/components/admin/AdminLayout.tsx'), 'utf8');
  assert.ok(!/location\.pathname\.startsWith\(to\)/.test(layout), '/quan-tri/to-giac-mat còn làm sáng cả mục /quan-tri/to-giac');
});
