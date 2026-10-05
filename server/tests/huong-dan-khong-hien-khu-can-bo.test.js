/**
 * Hướng dẫn cho người dân KHÔNG tự hiện ở khu cán bộ — lỗi thật: máy mới vào
 * lần đầu, lớp hướng dẫn phủ lên trang cán bộ rồi kéo về trang chủ.
 * Từ ND-050 điều kiện là allow-list "chỉ trang chủ" (src/utils/huongDan.ts) —
 * bài này giữ nguyên ý cũ: khu cán bộ không bao giờ tự hiện.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const u = BO_QUA ? {} : await import(new URL('../../src/utils/huongDan.ts', import.meta.url).href);

test('hướng dẫn cho người dân không tự hiện ở khu cán bộ', { skip: BO_QUA }, () => {
  for (const d of ['/quan-tri', '/quan-tri/diem-den', '/quan-tri/ho-so/12', '/dang-nhap']) {
    assert.equal(u.duocTuHienHuongDan(d), false, d);
  }
});
