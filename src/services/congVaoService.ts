/**
 * Đổi mã Turnstile lấy VÉ "không phải người máy" (server/src/lib/cong-vao.js).
 *
 * Dùng chung cho hai chỗ lấy vé: ô xác minh ở bước chọn nhóm của trang gửi ý
 * kiến (P90) và màn hình xác minh trước khi đăng nhập cán bộ. Máy chủ mới là nơi
 * kiểm vé — ở đây chỉ lấy rồi cất (luật 2).
 */
import { apiFetch, hasBackend } from './api';
import { captchaEnabled } from '../components/common/Turnstile';
import { luuVe } from '../utils/veVaoCua';

/** Có máy chủ VÀ có khoá Turnstile thì mới cần vé; thiếu một trong hai thì không chặn gì */
export const canVeVaoCua = hasBackend && captchaEnabled;

export async function layVeMoi(captchaToken: string): Promise<void> {
  const kq = await apiFetch<{ ve: string; hetHanGio: number }>('/api/cong-vao/xac-minh', {
    method: 'POST',
    body: JSON.stringify({ captchaToken }),
  });
  luuVe(kq.ve, kq.hetHanGio);
}
