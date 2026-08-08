/**
 * Dịch vụ tra cứu tiến độ xử lý.
 * Có backend → hỏi API (dữ liệu MySQL dùng chung); không có → mock + localStorage.
 */
import type { TrackingResult } from '../types/tracking';
import { MOCK_TRACKING, buildSteps } from '../utils/mockData';
import { readSubmissions } from './feedbackService';
import { delay } from '../utils/helpers';
import { apiFetch, hasBackend } from './api';

export async function lookupTracking(rawCode: string): Promise<TrackingResult> {
  const code = rawCode.trim().toUpperCase();

  // Có backend: dữ liệu dùng chung toàn hệ thống (backend trả đúng cấu trúc TrackingResult)
  if (hasBackend) {
    return apiFetch<TrackingResult>(`/api/tracking/${encodeURIComponent(code)}`);
  }

  // Không có backend: dữ liệu demo + ý kiến đã gửi trên máy này
  await delay(900);

  const mock = MOCK_TRACKING.find((t) => t.code === code);
  if (mock) return mock;

  const own = readSubmissions().find((s) => s.trackingCode === code);
  if (own) {
    return {
      code,
      status: 'received',
      category: own.category,
      summary: own.normalizedContent,
      createdAt: own.createdAt,
      steps: buildSteps('received', own.createdAt),
    };
  }

  throw new Error('Không tìm thấy mã tra cứu. Vui lòng kiểm tra lại 6 ký tự trên phiếu tiếp nhận.');
}

/**
 * YÊU CẦU XOÁ DỮ LIỆU CÁ NHÂN — theo Nghị định 13/2023/NĐ-CP
 *
 * Trả về một trong bốn trạng thái:
 *   done    - đã xoá ngay (hồ sơ đã đóng)
 *   pending - đã ghi nhận, chờ đóng hồ sơ mới xoá được
 *   already - đã xoá từ trước
 *   nothing - tin ẩn danh, vốn không có gì để xoá
 */
export interface DeletionResult {
  ok: boolean;
  status: 'done' | 'pending' | 'already' | 'nothing';
  message: string;
  requestedAt?: string;
}

export async function requestDataDeletion(rawCode: string): Promise<DeletionResult> {
  const code = rawCode.trim().toUpperCase();
  if (!hasBackend) {   // hasBackend là BIẾN boolean, không phải hàm
    throw new Error('Chức năng này cần kết nối máy chủ.');
  }
  return apiFetch<DeletionResult>(`/api/tracking/${code}/request-deletion`, {
    method: 'POST',
  });
}
