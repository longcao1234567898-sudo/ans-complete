/**
 * ND-050 — HƯỚNG DẪN LẦN ĐẦU CHỈ TỰ HIỆN Ở TRANG CHỦ
 *
 * Lỗi thật (thấy khi thử P50): người dân lần đầu bấm liên kết /diem-den (bài báo
 * ngập chia sẻ qua Zalo) bị kéo về trang chủ kèm hộp hướng dẫn 12 bước, không
 * thấy trang mình cần — đúng lúc mưa lớn. Liên kết tra cứu có mã cũng vậy.
 * Đảo lại thành allow-list: chỉ "/" được tự hiện, mọi đường dẫn khác thì không.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const BO_QUA = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
const u = BO_QUA ? {} : await import(goc('src/utils/huongDan.ts').href).catch(() => ({}));

test('chỉ trang chủ được tự hiện hướng dẫn', { skip: BO_QUA }, () => {
  assert.equal(typeof u.duocTuHienHuongDan, 'function', 'chưa có duocTuHienHuongDan trong src/utils/huongDan.ts');
  assert.equal(u.duocTuHienHuongDan('/'), true);
  for (const d of ['/diem-den', '/tra-cuu', '/tra-cuu/ABC123', '/gui-y-kien', '/gui-y-kien/buoc-2',
    '/quan-tri', '/quan-tri/diem-den', '/dang-nhap', '/gioi-thieu', '/tin-tuc/12', '//', '/?x=1', '']) {
    assert.equal(u.duocTuHienHuongDan(d), false, `${JSON.stringify(d)} không được tự hiện hướng dẫn`);
  }
});

test('HuongDanBanDau dùng duocTuHienHuongDan, kiểm lúc định hiện và khi đổi trang', async () => {
  const ma = await readFile(goc('src/components/common/HuongDanBanDau.tsx'), 'utf8');
  assert.match(ma, /import \{ duocTuHienHuongDan \} from '\.\.\/\.\.\/utils\/huongDan'/);
  /* Kiểm đúng lúc định hiện (người dân bấm sang trang khác trong 1,2 giây đầu) */
  assert.match(ma, /setTimeout\(\(\) => \{[\s\S]{0,800}?if \(!duocTuHienHuongDan\(window\.location\.pathname\)\) return;/);
  /* Người vào từ liên kết sâu rồi về trang chủ vẫn được hướng dẫn — hiệu ứng chạy lại theo đường dẫn */
  assert.match(ma, /\}, \[location\.pathname, hien\]\);/);
});
