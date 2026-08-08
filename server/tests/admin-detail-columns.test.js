/**
 * C4(b) — Endpoint chi tiết KHÔNG được trả IP / User-Agent của người tố giác.
 *
 * Bản cũ dùng `SELECT s.*` rồi `{ ...row }` thẳng vào response. Nghĩa là bất kỳ
 * cán bộ `handler` nào mở chi tiết một tin ẨN DANH cũng thấy luôn ip_address và
 * user_agent của người gửi. Đây là đường khai thác THẬT, không cần chờ lộ
 * database — và với tin ẩn danh thì bộ ba IP + UA + thời điểm gửi gần như trỏ
 * đích danh một hộ dân ở địa bàn xã.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const nguon = await readFile(new URL('../src/routes/admin/submissions.js', import.meta.url), 'utf8');

/* Lấy ĐÚNG chuỗi SQL của route GET /:id — bắt đầu từ dấu backtick mở chuỗi,
   không lấy phần comment phía trên (comment có nhắc tên các cột nhạy cảm để
   giải thích vì sao chúng bị loại, lấy nhầm thì test tự báo đỏ oan). */
const truyVanChiTiet = (() => {
  const moc = nguon.indexOf("router.get('/:id'");
  assert.ok(moc > -1, 'Không tìm thấy route GET /:id');
  const batDau = nguon.indexOf('`SELECT', moc);
  const ketThuc = nguon.indexOf('WHERE s.id = ?', batDau);
  assert.ok(batDau > -1 && ketThuc > batDau, 'Không tìm thấy chuỗi SQL của truy vấn chi tiết');
  return nguon.slice(batDau, ketThuc);
})();

/** Bỏ comment để không bắt nhầm phần văn bản giải thích vì sao KHÔNG dùng s.* */
const boComment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('KHÔNG router admin nào dùng SELECT s.*', async () => {
  const { readdir } = await import('node:fs/promises');
  const thuMuc = new URL('../src/routes/admin/', import.meta.url);

  for (const ten of await readdir(thuMuc)) {
    if (!ten.endsWith('.js')) continue;
    const ma = boComment(await readFile(new URL(ten, thuMuc), 'utf8'));
    assert.ok(
      !/SELECT\s+s\.\*/i.test(ma),
      `${ten} dùng SELECT s.* — kéo theo mọi cột mới thêm vào bảng, kể cả cột nhạy cảm chưa ai kịp rà`
    );
  }
});

for (const cot of ['ip_address', 'user_agent', 'sender_phone_hash', 'content_hash']) {
  test(`truy vấn chi tiết KHÔNG chọn cột ${cot}`, () => {
    assert.ok(
      !truyVanChiTiet.includes(cot),
      `Cột ${cot} bị trả về cho mọi cán bộ đã đăng nhập — đủ để lần ra người tố giác ẩn danh`
    );
  });
}

/* Danh sách cột giao diện đang dùng: đối chiếu với interface SubmissionRow +
   SubmissionDetail trong src/services/adminService.ts và
   src/pages/admin/AdminSubmissionDetailPage.tsx. Thiếu một cột là trang chi
   tiết hiển thị "undefined", nên khoá lại luôn. */
const COT_GIAO_DIEN_CAN = [
  's.id', 's.tracking_code', 's.original_content', 's.ai_processed_content',
  's.status', 's.urgency', 's.is_anonymous', 's.is_flagged',
  's.sender_name', 's.sender_phone', 's.sender_email',
  's.created_at', 's.deadline_at', 's.assigned_to',
  's.rejection_reason', 's.resolution_note',
];

for (const cot of COT_GIAO_DIEN_CAN) {
  test(`truy vấn chi tiết VẪN chọn ${cot} (giao diện đang dùng)`, () => {
    assert.ok(truyVanChiTiet.includes(cot), `Thiếu ${cot} -> trang chi tiết hiện undefined`);
  });
}

test('vẫn lấy đủ các cột JOIN mà giao diện cần', () => {
  for (const bidanh of ['category_code', 'category_name', 'sla_days', 'assigned_name', 'resolved_by_name', 'ward_name']) {
    assert.ok(truyVanChiTiet.includes(bidanh), `Thiếu bí danh ${bidanh}`);
  }
});
