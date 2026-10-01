/**
 * Danh mục nhật ký: hành động đã bỏ KHÔNG hiện ở bộ lọc / thống kê, nhưng dòng
 * cũ trong CSDL vẫn đọc được nhãn (nhật ký chỉ ghi thêm — không xoá được dòng cũ).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NHOM_NHAT_KY, MOI_HANH_DONG, tenHanhDong, hanhDongCuaNhom } from '../src/lib/danh-muc-nhat-ky.js';

const DA_BO = ['set_security_level', 'assign_denied'];

test('không còn nhóm "hành động đã bỏ" trong danh mục (bộ lọc, thống kê đọc từ đây)', () => {
  assert.equal(NHOM_NHAT_KY.find((n) => n.ma === 'cu'), undefined);
  assert.equal(hanhDongCuaNhom('cu'), null, 'lọc theo nhóm cũ phải bị từ chối như nhóm lạ');
  for (const ma of DA_BO) assert.ok(!MOI_HANH_DONG.includes(ma), `${ma} vẫn nằm trong danh sách lọc hành động`);
});

test('dòng cũ trong CSDL vẫn có nhãn tiếng Việt, xếp vào nhóm Khác', () => {
  for (const ma of DA_BO) {
    const t = tenHanhDong(ma);
    assert.equal(t.nhom, 'khac');
    assert.notEqual(t.ten, ma, `${ma} hiện ra dạng mã khó hiểu`);
    assert.match(t.ten, /đã bỏ/);
  }
});

test('mã lạ không lấy nhầm nhãn qua prototype', () => {
  assert.equal(tenHanhDong('toString').ten, 'toString');
  assert.equal(tenHanhDong('__proto__').nhom, 'khac');
});
