/**
 * ND-064 — BĂM MÃ PIN PHÒNG TRAO ĐỔI KHÔNG ĐƯỢC CHIẾM LUỒNG CHÍNH
 *
 * Đo tải P68: mỗi ý kiến gửi lên tốn 83 ms CPU để băm PIN bằng bcryptjs —
 * thư viện JavaScript thuần, chạy NGAY trên luồng chính của Node. Một tiến trình
 * chỉ băm được ~12 PIN/giây, và trong lúc băm thì MỌI yêu cầu khác (người xem
 * tin, tra cứu) cùng chậm theo. crypto.scrypt có sẵn trong Node chạy ở luồng phụ
 * (libuv), luồng chính rảnh để phục vụ người khác; không thêm thư viện nào.
 *
 * PIN đã cấp trước đây được băm bằng bcrypt: vẫn phải mở được phòng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';

const doc = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const nap = () => import('../src/lib/bam-pin.js');

test('băm rồi kiểm: đúng PIN mở được, sai PIN không; cùng PIN hai lần ra hai chuỗi khác (có muối)', async () => {
  const { bamPin, kiemPin } = await nap();
  const a = await bamPin('123456');
  const b = await bamPin('123456');
  assert.notEqual(a, b, 'phải có muối ngẫu nhiên');
  assert.ok(a.length <= 255, 'vừa cột chat_pin_hash VARCHAR(255)');
  assert.equal(await kiemPin('123456', a), true);
  assert.equal(await kiemPin('123457', a), false);
  assert.equal(await kiemPin('', a), false);
});

test('PIN cấp TRƯỚC bản vá (băm bcrypt) vẫn mở được phòng — không ai bị khoá ngoài', async () => {
  const { kiemPin } = await nap();
  const cu = await bcrypt.hash('654321', 10);
  assert.equal(await kiemPin('654321', cu), true);
  assert.equal(await kiemPin('654320', cu), false);
});

test('chuỗi băm lạ / hỏng / tham số quá nặng: trả false, không ném, không tốn CPU vô hạn', async () => {
  const { kiemPin } = await nap();
  const that = await (await nap()).bamPin('111111');
  const [, , r, p, muoi, bam] = that.split('$');
  for (const xau of [null, undefined, '', 'abc', '111111', '$2b$10$ngan',
    `scrypt$1048576$${r}$${p}$${muoi}$${bam}`,          // N cực lớn: kẻ ghi được CSDL làm treo máy
    `scrypt$16384$${r}$${p}$${muoi}`,                    // thiếu phần băm
    `scrypt$16384$${r}$${p}$${muoi}$${bam}x`,            // độ dài sai
    `scrypt$abc$${r}$${p}$${muoi}$${bam}`]) {
    assert.equal(await kiemPin('111111', xau), false, `phải từ chối: ${String(xau).slice(0, 40)}`);
  }
});

test('băm 16 PIN cùng lúc KHÔNG chiếm luồng chính (bcryptjs cũ thì chiếm gần hết)', async () => {
  const { bamPin } = await nap();
  const doELU = async (viec) => {
    const dau = performance.eventLoopUtilization();
    await viec();
    return performance.eventLoopUtilization(dau).utilization;
  };
  /* Ô đối chứng: chứng minh phép đo không mù — bcryptjs làm luồng chính bận */
  const cu = await doELU(() => Promise.all(Array.from({ length: 16 }, () => bcrypt.hash('123456', 10))));
  const moi = await doELU(() => Promise.all(Array.from({ length: 16 }, () => bamPin('123456'))));
  assert.ok(cu > 0.8, `đối chứng hỏng: bcryptjs chỉ chiếm ${cu.toFixed(2)} luồng chính`);
  assert.ok(moi < 0.3, `băm PIN chiếm ${moi.toFixed(2)} luồng chính — phải chạy ở luồng phụ`);
});

test('route gửi ý kiến và route mở phòng dùng bam-pin, không còn băm/so PIN bằng bcrypt', async () => {
  const gui = await doc('src/routes/submissions.js');
  const chat = await doc('src/routes/chat.js');
  assert.match(gui, /await bamPin\(chatPin\)/);
  assert.doesNotMatch(gui, /bcrypt\.hash\(chatPin/);
  assert.match(chat, /await kiemPin\(pin, don\.chat_pin_hash\)/);
  assert.doesNotMatch(chat, /bcrypt\.compare\(pin/);
});
