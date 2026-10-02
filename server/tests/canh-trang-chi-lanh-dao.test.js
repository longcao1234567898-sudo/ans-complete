/**
 * TRANG CHỈ LÃNH ĐẠO KHÔNG DỰNG CHO CÁN BỘ GÕ THẲNG ĐƯỜNG DẪN — ND-046
 * ============================================================================
 *
 * Thí điểm P48: cán bộ gõ thẳng /quan-tri/nhat-ky thấy đủ khung trang (bộ lọc,
 * nút "Xuất Excel") rồi mới báo "Bạn không có quyền". Máy chủ chặn đúng (403),
 * dữ liệu không lộ — nhưng mỗi trang tự bọc AdminLayout, nên trang dựng và gọi
 * API trước khi ai kiểm vai trò. Cùng gốc: menu hiện "Báo cáo" và "Bản đồ điểm
 * nóng" cho cán bộ trong khi máy chủ chỉ cho lãnh đạo (/api/admin/reports dùng
 * authorize(...LANH_DAO)) — bấm vào là 403.
 *
 * Sửa: một danh sách trang chỉ lãnh đạo ở src/utils/quyenTrang.ts, khớp quyền
 * máy chủ; menu và lớp canh đường dẫn (CanTrang, bọc mọi route /quan-tri ở
 * App.tsx) cùng đọc nó. Không phải lớp bảo vệ (luật 2) — chặn thật vẫn ở máy chủ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const q = BO_QUA ? {} : await import(goc('src/utils/quyenTrang.ts').href);

test('trang chỉ lãnh đạo khớp các router máy chủ chỉ cho lãnh đạo', { skip: BO_QUA }, async () => {
  /* Router dùng router.use(authorize(...LANH_DAO)) -> trang giao diện của nó */
  const TRANG_CUA_ROUTER = { logs: ['/quan-tri/nhat-ky'], reports: ['/quan-tri/bao-cao', '/quan-tri/ban-do'] };
  for (const [router, cacTrang] of Object.entries(TRANG_CUA_ROUTER)) {
    const ma = await readFile(goc(`server/src/routes/admin/${router}.js`), 'utf8');
    assert.match(ma, /router\.use\(authorize\(\.\.\.LANH_DAO\)\)/, `routes/admin/${router}.js không còn chỉ cho lãnh đạo — sửa lại danh sách ở quyenTrang.ts`);
    for (const t of cacTrang) assert.ok(q.TRANG_CHI_LANH_DAO.includes(t), `${t} phải nằm trong TRANG_CHI_LANH_DAO`);
  }
  for (const t of ['/quan-tri/to-giac-mat', '/quan-tri/ngoai-tham-quyen']) {
    assert.ok(q.TRANG_CHI_LANH_DAO.includes(t), `${t}: cán bộ không thấy tin mang cờ (ADR-003)`);
  }
});

test('duocVaoTrang: theo từng đoạn đường dẫn, lãnh đạo vào hết', { skip: BO_QUA }, () => {
  const ca = [
    ['/quan-tri/nhat-ky', 'handler', false],
    ['/quan-tri/nhat-ky/', 'handler', false],
    ['/quan-tri/bao-cao', 'handler', false],
    ['/quan-tri/ban-do', 'handler', false],
    ['/quan-tri/to-giac-mat', 'handler', false],
    ['/quan-tri/to-giac', 'handler', true],          // không bị nhầm với to-giac-mat
    ['/quan-tri/y-kien/3', 'handler', true],         // chi tiết: máy chủ tự trả 404 nếu không được xem
    ['/quan-tri', 'handler', true],
    ['/quan-tri/nhat-ky', 'manager', true],
    ['/quan-tri/ban-do', 'admin', true],
    ['/quan-tri/nhat-ky', '', false],
  ];
  for (const [duong, vaiTro, mong] of ca) assert.equal(q.duocVaoTrang(duong, vaiTro), mong, `${duong} · ${vaiTro}`);
});

test('mọi route /quan-tri ở App.tsx bọc CanTrang', async () => {
  const app = await readFile(goc('src/App.tsx'), 'utf8');
  const dong = app.split('\n').filter((d) => /<Route\s+path="\/quan-tri/.test(d));
  assert.ok(dong.length >= 15, 'không tìm thấy các route /quan-tri');
  for (const d of dong) assert.match(d, /element=\{can\(/, `route chưa bọc CanTrang: ${d.trim()}`);
});

test('menu lọc theo cùng nguồn, không giữ danh sách vai trò riêng', async () => {
  const ma = await readFile(goc('src/components/admin/AdminLayout.tsx'), 'utf8');
  assert.match(ma, /duocVaoTrang\(m\.to,\s*staff\.role\)/);
  assert.doesNotMatch(ma, /vaiTro:\s*\[\.\.\.LANH_DAO\]/, 'menu còn ghi vai trò riêng từng mục');
});
