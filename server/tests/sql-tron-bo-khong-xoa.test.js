/**
 * TỆP SQL NỀN KHÔNG ĐƯỢC XOÁ CSDL ĐANG CÓ DỮ LIỆU — ND-048
 * ============================================================================
 *
 * TRON_BO_DATABASE_V5.sql từng tự `USE hop_thu_an_ninh_so` rồi `DROP TABLE`
 * mười bảng (hồ sơ, cán bộ, nhật ký). Nên `mysql ten_khac < TRON_BO…sql` vẫn
 * xoá sạch CSDL `hop_thu_an_ninh_so` — tên trên dòng lệnh bị bỏ qua. `DROP
 * TABLE` còn đi vòng qua trigger chỉ-ghi-thêm của nhật ký (v27). Thí điểm P48
 * gặp thật: nạp tệp vào CSDL nháp mà CSDL thí điểm bị xoá.
 *
 * Mất hồ sơ tố giác và nhật ký là hậu quả không hoàn tác được, nên tệp phải:
 *   1. không tự chọn CSDL (không `USE`, không `CREATE DATABASE`): chạy đúng
 *      vào CSDL người cài chỉ định, không chỉ định thì lỗi ngay;
 *   2. tự dừng khi CSDL đã có bảng, trước câu tạo bảng đầu tiên;
 *   3. không có `DROP TABLE` nào — kể cả khi ai đó chạy `mysql --force`
 *      (bỏ qua lỗi, nên chốt ở mục 2 không dừng được) thì vẫn không xoá bảng.
 *
 * Test đọc tĩnh; chạy thật trên MySQL 8 ghi ở commit sửa.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../database/TRON_BO_DATABASE_V5.sql', import.meta.url), 'utf8');

/* Bỏ chú thích: lời giải thích được phép nhắc tới USE hay DROP TABLE. */
const lenh = sql
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .map((d) => d.replace(/(^|\s)--(\s.*)?$/, '').replace(/^\s*#.*$/, ''))
  .join('\n');

describe('TRON_BO_DATABASE_V5.sql không xoá CSDL đang có dữ liệu (ND-048)', () => {
  test('không tự chọn CSDL: không có USE, không có CREATE DATABASE', () => {
    assert.doesNotMatch(lenh, /^\s*USE\s+\w+/im, 'còn câu USE — tệp sẽ chạy vào CSDL ghi cứng, bỏ qua tên trên dòng lệnh');
    assert.doesNotMatch(lenh, /CREATE\s+(DATABASE|SCHEMA)\b/i, 'còn CREATE DATABASE — tạo CSDL là việc của người cài, ghi trong README');
  });

  test('không có DROP TABLE nào (chạy --force cũng không xoá được bảng)', () => {
    assert.doesNotMatch(lenh, /DROP\s+TABLE/i);
  });

  test('có chốt dừng khi CSDL đã có bảng, đặt TRƯỚC câu tạo bảng đầu tiên', () => {
    const viTriChot = lenh.search(/CALL\s+chot_csdl_trong\s*\(\s*\)/i);
    const viTriTaoBang = lenh.search(/CREATE\s+TABLE/i);
    assert.ok(viTriChot >= 0, 'không thấy lời gọi chốt chot_csdl_trong()');
    assert.ok(viTriChot < viTriTaoBang, 'chốt phải chạy trước câu CREATE TABLE đầu tiên');

    const thanChot = lenh.match(/CREATE\s+PROCEDURE\s+chot_csdl_trong\s*\(\s*\)([\s\S]*?)END\s*\/\//i);
    assert.ok(thanChot, 'không thấy thân thủ tục chot_csdl_trong');
    assert.match(thanChot[1], /information_schema\.tables/i, 'chốt phải đếm bảng có sẵn');
    assert.match(thanChot[1], /DATABASE\s*\(\s*\)/i, 'chốt phải đếm trong CSDL đang chạy, không trong tên ghi cứng');
    assert.match(thanChot[1], /SIGNAL\s+SQLSTATE\s+'45000'/i, 'chốt phải báo lỗi để công cụ cài dừng lại');
  });

  test('phần kiểm tra cuối tệp không ghi cứng tên CSDL', () => {
    assert.doesNotMatch(lenh, /'hop_thu_an_ninh_so'/, 'đếm cột theo TABLE_SCHEMA ghi cứng thì cài với tên khác sẽ báo sai — dùng DATABASE()');
  });
});
