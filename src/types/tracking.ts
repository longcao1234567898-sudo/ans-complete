/**
 * Kiểu dữ liệu cho chức năng tra cứu tiến độ xử lý.
 */
import type { FeedbackCategory } from './feedback';

/** Trạng thái xử lý ý kiến */
export type TrackingStatus = 'received' | 'processing' | 'resolved' | 'rejected';

/** Thông tin hiển thị của một trạng thái */
export interface StatusInfo {
  id: TrackingStatus;
  label: string;
  description: string;
  colorClass: string;
}

/** Một mốc trên timeline xử lý */
export interface TrackingStep {
  status: TrackingStatus;
  label: string;
  /** ISO string; rỗng nếu bước chưa diễn ra */
  timestamp: string;
  note?: string;
  done: boolean;
}

/** Kết quả tra cứu theo mã 6 ký tự */
export interface TrackingResult {
  code: string;
  status: TrackingStatus;
  category: FeedbackCategory;
  summary: string;
  createdAt: string;
  steps: TrackingStep[];
  /** Lý do từ chối (chỉ có khi status = rejected) */
  rejectionReason?: string;
}
