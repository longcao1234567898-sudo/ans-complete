/**
 * Kiểu dữ liệu cho luồng gửi ý kiến của công dân.
 */

/** 4 nhóm phân loại ý kiến theo quy định tiếp nhận */
export type FeedbackCategory = 'to_giac' | 'khieu_nai' | 'phan_anh' | 'de_xuat';

/** Thông tin hiển thị của một nhóm phân loại */
export interface CategoryInfo {
  id: FeedbackCategory;
  label: string;
  description: string;
  /** Lớp Tailwind dùng cho badge/chip */
  colorClass: string;
}

/** Kết quả AI phân tích nội dung (mock) */
export interface AIAnalysisResult {
  /** Nội dung đã được AI chuẩn hoá, diễn đạt lại rõ ràng */
  normalizedContent: string;
  /** Nhóm xử lý AI gợi ý */
  suggestedCategory: FeedbackCategory;
  /** Độ tin cậy 0..1 */
  confidence: number;
  /** Từ khoá AI nhận diện được */
  keywords: string[];
}

/** Thông tin liên hệ (tất cả đều không bắt buộc) */
export interface ContactInfo {
  fullName: string;
  phone: string;
  email: string;
  /** V2: địa bàn xảy ra vụ việc (phục vụ bản đồ điểm nóng) */
  wardId?: number | null;
  /** V2: mã xác minh chống bot (Cloudflare Turnstile) */
  captchaToken?: string;
  /** V3: "vé" nhận được sau khi xác thực OTP email (hiệu lực 15 phút) */
  otpToken?: string;
}

/** Bản nháp ý kiến trong quá trình đi qua 5 bước của form */
export interface FeedbackDraft {
  content: string;
  analysis: AIAnalysisResult | null;
  category: FeedbackCategory | null;
  contact: ContactInfo;
  /** Ảnh minh chứng (data URL đã nén, tối đa MAX_FEEDBACK_IMAGES tấm) */
  images: string[];
}

/** Ý kiến đã gửi thành công (được cấp mã tra cứu) */
export interface FeedbackSubmission {
  trackingCode: string;
  content: string;
  normalizedContent: string;
  category: FeedbackCategory;
  contact: Partial<ContactInfo>;
  /** Ảnh minh chứng đính kèm (data URL) */
  images?: string[];
  createdAt: string; // ISO string
}
