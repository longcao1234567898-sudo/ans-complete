/**
 * TRANG CÔNG KHAI KHÔNG HỎI PHIÊN CÁN BỘ VÔ CỚ; BỎ MÃ XÁC THỰC CHẾT — ND-047
 * ============================================================================
 *
 * Thí điểm P48 thấy mỗi lần người dân mở bất kỳ trang nào, trình duyệt gọi
 * POST /api/auth/refresh và nhận 401: AdminAuthProvider bọc cả web và khôi phục
 * phiên ngay khi nạp, kể cả trên máy chưa từng có cán bộ đăng nhập. Gấp đôi số
 * yêu cầu, log máy chủ đầy 401, và mai sau giám sát 401 sẽ báo động giả.
 *
 * (Loạt 401 trên trang cán bộ có gốc khác — trang dựng trước khi phiên khôi
 * phục — đã hết nhờ lớp canh CanTrang, ND-046.)
 *
 * Sửa: chỉ hỏi máy chủ khi đang ở khu cán bộ (/quan-tri, /dang-nhap) hoặc khi
 * trình duyệt có DẤU "từng có phiên cán bộ" (ghi lúc đăng nhập / làm mới thành
 * công, xoá lúc đăng xuất / làm mới bị từ chối). Dấu KHÔNG cấp quyền gì — chỉ
 * quyết có hỏi hay không; trả lời vẫn do cookie httpOnly ở máy chủ.
 *
 * Cùng đợt: bỏ src/services/authService.ts và src/hooks/useAuth.tsx — bản
 * dịch vụ xác thực thứ hai, không nơi nào nạp (AuthProvider không gắn vào cây).
 * Mã chết về xác thực là chỗ người sau sửa nhầm.
 *
 * Kiểm hành vi trên trình duyệt thật: ghi ở thân commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const tonTai = (p) => access(goc(p)).then(() => true, () => false);

test('bỏ bản dịch vụ xác thực thứ hai (mã chết)', async () => {
  assert.equal(await tonTai('src/services/authService.ts'), false, 'còn src/services/authService.ts');
  assert.equal(await tonTai('src/hooks/useAuth.tsx'), false, 'còn src/hooks/useAuth.tsx');
});

test('chỉ khôi phục phiên ở khu cán bộ hoặc khi có dấu phiên', async () => {
  const ma = await readFile(goc('src/hooks/useAdminAuth.tsx'), 'utf8');
  assert.match(ma, /coDauPhien\(\)/, 'chưa dựa vào dấu phiên');
  assert.match(ma, /quan-tri\|dang-nhap/, 'chưa nhận ra khu cán bộ');
  /* restoreSession chỉ được gọi bên trong nhánh điều kiện, không gọi trơn lúc mount */
  assert.doesNotMatch(ma, /useEffect\(\(\)\s*=>\s*\{\s*let huy = false;\s*restoreSession\(\)/, 'còn khôi phục phiên vô điều kiện lúc nạp');

  /* Lỗi đã gặp khi viết bản sửa: cờ "đã hỏi" là state nằm trong phụ thuộc của
     effect -> effect tự huỷ lượt hỏi đang chạy, trang cán bộ treo mãi ở "Đang
     kiểm tra phiên". Cờ phải là ref; phụ thuộc chỉ có khuCanBo. */
  assert.match(ma, /const daHoi = useRef\(false\)/, 'cờ "đã hỏi" phải là useRef');
  assert.match(ma, /\}, \[khuCanBo\]\);/, 'effect khôi phục phiên chỉ phụ thuộc khuCanBo');
});

test('dấu phiên ghi khi có phiên, xoá khi đăng xuất hay làm mới bị từ chối', async () => {
  const ma = await readFile(goc('src/services/adminService.ts'), 'utf8');
  for (const ham of ['saveSession', 'clearSession']) {
    const than = ma.match(new RegExp(`function ${ham}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert.ok(than, `không thấy ${ham}`);
    assert.match(than[1], ham === 'saveSession' ? /ghiDauPhien\(\)/ : /xoaDauPhien\(\)/, `${ham} chưa cập nhật dấu phiên`);
  }
  const lamMoi = ma.match(/async function tryRefresh\(\)[\s\S]*?\n\}/)[0];
  assert.match(lamMoi, /if \(!res\.ok\) \{[^}]*xoaDauPhien\(\)/, 'làm mới bị từ chối mà không xoá dấu');
});
