/**
 * VIỆC 7 (ADR-003) — GỬI THẤT BẠI THÌ BÁO RÕ VÀ CHỈ ĐƯỜNG GỌI 113
 *
 * Mất mạng hay máy chủ sập, trình duyệt ném "Failed to fetch" (Chrome),
 * "NetworkError when attempting to fetch resource." (Firefox), "Load failed"
 * (Safari). Giao diện cũ hiện nguyên dòng đó: bà con không hiểu, có người tưởng
 * đã gửi được, có người bỏ cuộc mà không biết việc gấp còn đường gọi 113.
 *
 * Luật: máy chủ CÓ trả lời kèm lý do (thiếu họ tên, gửi quá nhanh, sự cố mã
 * hoá...) thì giữ nguyên lời đó — bà con cần đúng lý do để sửa. Mọi thất bại
 * khác đều ra một câu cố định có 113.
 *
 * Hàm thuần nằm ở src/utils/loiGui.ts, chạy thật bằng Node (bỏ kiểu TS). Node
 * cũ không đọc được .ts thì bỏ qua, như các bài cần node:sqlite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const m = BO_QUA ? {} : await import(goc('src/utils/loiGui.ts').href);

const THAT_BAI_KY_THUAT = [
  ['Chrome mất mạng', new TypeError('Failed to fetch')],
  ['Firefox mất mạng', new TypeError('NetworkError when attempting to fetch resource.')],
  ['Safari mất mạng', new TypeError('Load failed')],
  ['máy chủ 502 trả trang HTML, không có lời', Object.assign(new Error('Lỗi máy chủ (502)'), { status: 502, tuMayChu: false })],
  ['máy chủ 500 không có lời', Object.assign(new Error('Lỗi máy chủ (500)'), { status: 500 })],
  ['huỷ giữa chừng', Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })],
  ['tải ảnh lên kho ảnh lỗi', new Error('Tải ảnh lên thất bại')],
  ['giá trị lạ', 'oops'],
  ['undefined', undefined],
];

for (const [ten, loi] of THAT_BAI_KY_THUAT) {
  test(`${ten} -> "Gửi thất bại ... 113", không lộ lời kỹ thuật`, { skip: BO_QUA }, () => {
    const kq = m.loiGuiDeHieu(loi);
    assert.ok(kq instanceof Error);
    assert.equal(kq.message, m.LOI_GUI_THAT_BAI);
    assert.match(kq.message, /^Gửi thất bại/);
    assert.match(kq.message, /113/);
    assert.doesNotMatch(kq.message, /fetch|network|load failed|abort|\(5\d\d\)/i);
  });
}

test('máy chủ trả lời kèm lý do (4xx, hoặc 5xx đã có 113) -> giữ nguyên lời máy chủ', { skip: BO_QUA }, () => {
  for (const [status, loiMayChu] of [
    [400, 'Vui lòng nhập họ và tên.'],
    [429, 'Bà con vừa gửi một ý kiến. Vui lòng chờ thêm 30 giây.'],
    [503, 'Hệ thống tạm thời không tiếp nhận ý kiến có thông tin liên hệ do sự cố kỹ thuật về bảo mật. '
      + 'Nếu việc gấp, bà con có thể gửi TỐ GIÁC ẨN DANH hoặc gọi ngay 113 nếu vấn đề khẩn cấp.'],
  ]) {
    const goc = Object.assign(new Error(loiMayChu), { status, tuMayChu: true });
    assert.equal(m.loiGuiDeHieu(goc).message, loiMayChu);
  }
});

test('máy chủ báo lỗi 5xx mà không nhắc 113 -> vẫn ra câu chuẩn có 113', { skip: BO_QUA }, () => {
  const loi = Object.assign(new Error('Lỗi máy chủ. Vui lòng thử lại sau.'), { status: 500, tuMayChu: true });
  assert.equal(m.loiGuiDeHieu(loi).message, m.LOI_GUI_THAT_BAI);
  const co113 = Object.assign(new Error('Tạm dừng tiếp nhận, việc gấp gọi 113.'), { status: 503, tuMayChu: true });
  assert.equal(m.loiGuiDeHieu(co113).message, co113.message);
});

/* Phía máy chủ: hai lời 5xx của route gửi ý kiến tự nó đã chỉ đường 113, để
   giao diện cũ hoặc ứng dụng khác gọi API cũng không mất lời nhắc. */
const { datBienMoiTruongHopLe } = await import('./helpers-test.js');
datBienMoiTruongHopLe();
const { BO_QUA: KHONG_SQLITE, dungCsdl, goi, donCoTen } = await import('./khung-sqlite.js');
const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const gui = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });

test('máy chủ: lỗi bất ngờ khi lưu đơn -> 500 có 113, không lộ chi tiết lỗi', { skip: KHONG_SQLITE }, async () => {
  dungCsdl(pool);
  const query = pool.query;
  pool.query = async (sql, p) => {
    if (/INSERT INTO submissions/i.test(String(sql))) throw new Error('ER_LOCK_DEADLOCK giả lập');
    return query(sql, p);
  };
  const r = await gui(donCoTen(0));
  assert.equal(r.status, 500);
  assert.match(r.body.error, /113/);
  assert.doesNotMatch(r.text, /DEADLOCK/);
});

test('máy chủ: lời 503 khi khoá mã hoá hỏng có chỉ đường 113', async () => {
  const nguon = await readFile(new URL('../src/routes/submissions.js', import.meta.url), 'utf8');
  const doan = nguon.slice(nguon.indexOf("code: 'ENCRYPTION_UNAVAILABLE'") - 600, nguon.indexOf("code: 'ENCRYPTION_UNAVAILABLE'"));
  assert.match(doan, /113/);
});

test('nối dây: apiFetch đánh dấu lỗi có lời của máy chủ; submitFeedback đổi lỗi qua loiGuiDeHieu', async () => {
  const api = await readFile(goc('src/services/api.ts'), 'utf8');
  assert.match(api, /tuMayChu:\s*Boolean\(data\?\.error\)/, 'apiFetch phải gắn cờ tuMayChu theo việc máy chủ có trả lời "error" không');
  const dv = await readFile(goc('src/services/feedbackService.ts'), 'utf8');
  const nhanhMayChu = dv.slice(dv.indexOf('if (hasBackend)'), dv.indexOf('CHẾ ĐỘ DEMO'));
  assert.match(nhanhMayChu, /catch \(e\)\s*\{[\s\S]*throw loiGuiDeHieu\(e\)/, 'nhánh gửi lên máy chủ phải đổi mọi lỗi qua loiGuiDeHieu');
  const trang = await readFile(goc('src/pages/SendFeedbackPage.tsx'), 'utf8');
  assert.doesNotMatch(trang, /Có lỗi xảy ra, vui lòng thử lại\./, 'lời dự phòng của trang gửi phải là câu có 113');
});
