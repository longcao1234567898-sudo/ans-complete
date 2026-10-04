/**
 * Dự báo mưa (P51). Người dân gọi /api/diem-den/du-bao-mua; cán bộ gọi qua API
 * cán bộ (máy chủ cán bộ chạy tách không có route công khai). Trình duyệt KHÔNG
 * gọi thẳng Open-Meteo: máy chủ lấy giùm và giữ 30 phút cho mọi người.
 */
import { useQuery } from '@tanstack/react-query';
import { chuanDuBao, type DuBaoMua } from '../utils/duBaoMua';
import { layDuBaoMuaQuanTri } from '../services/adminService';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';

async function layCongKhai(): Promise<DuBaoMua> {
  const res = await fetch(`${API_URL}/api/diem-den/du-bao-mua`);
  if (!res.ok) return { trangThai: 'khong_co_du_lieu' };
  return chuanDuBao(await res.json().catch(() => null));
}

export function useDuBaoMua({ canBo = false }: { canBo?: boolean } = {}) {
  return useQuery({
    queryKey: ['du-bao-mua', canBo ? 'can-bo' : 'cong-khai'],
    queryFn: async () => (canBo ? chuanDuBao(await layDuBaoMuaQuanTri()) : layCongKhai()),
    /* Chạy offline (không có máy chủ) thì không có dự báo — không hỏi */
    enabled: canBo || Boolean(API_URL),
    staleTime: 5 * 60_000,
    /* Trang để mở lâu (máy ở trụ sở, điện thoại để sẵn) vẫn tự cập nhật */
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
}
