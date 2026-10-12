/**
 * TUYẾN CÓ NGUY CƠ NGẬP NỔI BẬT (P65) — người vận hành muốn "chỗ nào dự báo ngập thì tự
 * thêm điểm, hết ngập thì xoá". Dự báo chỉ có một con số cho cả vùng nên chỉ báo được
 * trên các tuyến hay ngập đã nhập; và theo ADR-004 §5 dự báo KHÔNG BAO GIỜ thành "đang
 * ngập". Nên: tuyến có nguy cơ hiện thành khối riêng ở đầu trang, chấm cam to có vòng
 * nhấp nháy trên bản đồ, hết nguy cơ thì tự mất — không ai phải bấm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

test('trang Điểm đen có khối "nguy cơ ngập" riêng, chỉ gồm tuyến CHƯA được cán bộ xác nhận', async () => {
  const ma = await doc('src/pages/DiemDenGiaoThongPage.tsx');
  assert.match(ma, /const nguyCoChuaXacNhan = ngap\.filter\(\(d\) => !d\.dangNgap && nguyCoDuong\(d\)\)/);
  assert.match(ma, /nguyCoChuaXacNhan\.length > 0 &&/, 'chỉ hiện khi có tuyến nguy cơ — hết nguy cơ tự mất');
  assert.match(ma, /data-khoi="nguy-co-ngap"/);
  /* Khối nguy cơ không được dùng chữ "đang ngập" như một khẳng định */
  const khoi = ma.slice(ma.indexOf('data-khoi="nguy-co-ngap"'), ma.indexOf('data-khoi="nguy-co-ngap"') + 2500);
  assert.doesNotMatch(khoi, /ĐANG NGẬP|Đang có \{/);
  assert.match(khoi, /chưa có cán bộ xác nhận/i);
});

test('bản đồ: tuyến nguy cơ có vòng nhấp nháy, vẽ trên cùng; tắt nhấp nháy khi giảm chuyển động', async () => {
  const ma = await doc('src/pages/DiemDenGiaoThongPage.tsx');
  assert.match(ma, /className="vong-nguy-co"/);
  const css = await doc('src/index.css').catch(() => doc('src/styles/globals.css'));
  assert.match(css, /\.vong-nguy-co\s*\{[^}]*animation/);
  assert.match(css, /prefers-reduced-motion[\s\S]*\.vong-nguy-co[\s\S]*animation:\s*none/);
});

test('dải cảnh báo trang chủ kể tên tuyến có nguy cơ', async () => {
  const ma = await doc('src/components/DuBaoMua/CanhBaoMuaTrangChu.tsx');
  assert.match(ma, /duongNguyCo[\s\S]*\.map\(\(x\) => x\.ten\)/);
});

test('khối nguy cơ nói KHOẢNG GIỜ dễ ngập nhất (khung mưa dồn của dự báo), không có khung thì không bịa', async () => {
  const ma = await doc('src/pages/DiemDenGiaoThongPage.tsx');
  const khoi = ma.slice(ma.indexOf('data-khoi="nguy-co-ngap"'), ma.indexOf('data-khoi="nguy-co-ngap"') + 2500);
  assert.match(khoi, /duBao\?\.dinhMua\s*&&/, 'chỉ ghi giờ khi máy chủ có khung mưa dồn');
  assert.match(khoi, /khoangGio\(duBao\.dinhMua\.tu,\s*duBao\.dinhMua\.den\)/);
});
