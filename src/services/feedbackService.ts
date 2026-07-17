/**
 * Dịch vụ gửi ý kiến (MOCK — lưu localStorage) kèm cơ chế CHỐNG SPAM:
 * - Phải chờ tối thiểu 2 phút giữa 2 lần gửi
 * - Tối đa 5 ý kiến/giờ trên mỗi trình duyệt
 * - Chặn nội dung trùng lặp với ý kiến vừa gửi trong 1 giờ
 * (Khi có backend thật, các kiểm tra này cần làm thêm ở phía server.)
 */
import type { FeedbackDraft, FeedbackSubmission } from '../types/feedback';
import { ANTI_SPAM, STORAGE_KEYS } from '../utils/constants';
import { delay, generateTrackingCode, getPhoneError } from '../utils/helpers';
import { containsProfanity, sanitizeText, scanTextForThreats } from '../utils/security';
import { apiFetch, hasBackend } from './api';
import { prepareImages } from './uploadService';

/** Đọc danh sách ý kiến đã gửi từ localStorage */
export function readSubmissions(): FeedbackSubmission[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.submissions) || '[]') as FeedbackSubmission[];
  } catch {
    return [];
  }
}

/** Đọc mốc thời gian các lần gửi gần đây (phục vụ chống spam) */
function readSubmitTimes(): number[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.submitTimes) || '[]') as number[];
  } catch {
    return [];
  }
}

/** Kiểm tra chống spam — ném Error kèm thông báo thân thiện nếu vi phạm */
function assertNotSpamming(content: string): void {
  const now = Date.now();
  const recentTimes = readSubmitTimes().filter((t) => now - t < 3_600_000);

  // 1) Chưa hết thời gian chờ giữa 2 lần gửi
  const lastTime = recentTimes.length > 0 ? Math.max(...recentTimes) : 0;
  if (lastTime && now - lastTime < ANTI_SPAM.cooldownMs) {
    const waitSec = Math.ceil((ANTI_SPAM.cooldownMs - (now - lastTime)) / 1000);
    throw new Error(
      `Bà con vừa gửi một ý kiến. Vui lòng chờ thêm ${waitSec} giây trước khi gửi ý kiến tiếp theo.`
    );
  }

  // 2) Vượt số lượt gửi trong 1 giờ
  if (recentTimes.length >= ANTI_SPAM.maxPerHour) {
    throw new Error(
      `Mỗi thiết bị chỉ được gửi tối đa ${ANTI_SPAM.maxPerHour} ý kiến trong 1 giờ. Bà con vui lòng quay lại sau.`
    );
  }

  // 3) Nội dung trùng với ý kiến vừa gửi
  const duplicate = readSubmissions().find(
    (s) =>
      s.content.trim() === content.trim() &&
      now - new Date(s.createdAt).getTime() < ANTI_SPAM.duplicateWindowMs
  );
  if (duplicate) {
    throw new Error(
      `Nội dung này trùng với ý kiến bà con đã gửi (mã ${duplicate.trackingCode}). Vui lòng dùng mã đó để theo dõi tiến độ.`
    );
  }
}

/** Ghi nhận mốc thời gian gửi thành công */
function recordSubmitTime(): void {
  const now = Date.now();
  const times = readSubmitTimes().filter((t) => now - t < 3_600_000);
  times.push(now);
  try {
    localStorage.setItem(STORAGE_KEYS.submitTimes, JSON.stringify(times));
  } catch {
    /* bỏ qua */
  }
}

/** Lưu danh sách ý kiến; nếu localStorage đầy (do ảnh) thì lưu bản không ảnh */
function saveSubmissions(list: FeedbackSubmission[], newest: FeedbackSubmission): void {
  try {
    localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(list));
  } catch {
    // Quota đầy: thay bản mới nhất bằng bản không kèm ảnh rồi lưu lại
    const lite = list.map((s) => (s.trackingCode === newest.trackingCode ? { ...s, images: [] } : s));
    try {
      localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(lite));
    } catch {
      /* vẫn đầy — bỏ qua, mã tra cứu vẫn hiển thị cho người dùng */
    }
  }
}

/** Gửi ý kiến: kiểm tra chống spam, sinh mã tra cứu 6 ký tự, lưu lại */
export async function submitFeedback(draft: FeedbackDraft): Promise<FeedbackSubmission> {
  await delay(1100);

  // Tuyến phòng thủ thứ 2: làm sạch + quét lại toàn bộ văn bản ngay trước khi lưu
  const content = sanitizeText(draft.content);
  const fullName = sanitizeText(draft.contact.fullName, 100);

  const isAnon = draft.contact.isAnonymous === true;

  if (!content.trim()) throw new Error('Nội dung ý kiến không được để trống.');
  if (!draft.category) throw new Error('Vui lòng chọn nhóm xử lý.');

  // ẨN DANH: KHÔNG yêu cầu họ tên / số điện thoại (bảo vệ người tố giác)
  if (!isAnon) {
    if (!fullName.trim()) throw new Error('Vui lòng nhập họ và tên.');
    if (!draft.contact.phone.trim()) throw new Error('Vui lòng nhập số điện thoại.');
  } else if (content.trim().length < 50) {
    throw new Error('Gửi ẩn danh cần mô tả chi tiết ít nhất 50 ký tự (thời gian, địa điểm, đối tượng) vì cán bộ không thể liên hệ lại để hỏi thêm.');
  }

  const contentScan = scanTextForThreats(content);
  if (!contentScan.safe) {
    throw new Error(
      `Nội dung chứa yếu tố không an toàn (${contentScan.reasons.join(', ')}). Vui lòng mô tả bằng lời văn thông thường.`
    );
  }
  if (!isAnon) {
    const nameScan = scanTextForThreats(fullName);
    if (!nameScan.safe) throw new Error('Họ tên chứa ký tự không hợp lệ.');
  }

  // Chặn ngôn từ thô tục/xúc phạm
  if (containsProfanity(content) || (!isAnon && containsProfanity(fullName))) {
    throw new Error('Nội dung chứa ngôn từ không phù hợp. Vui lòng diễn đạt lịch sự để ý kiến được tiếp nhận.');
  }

  // Kiểm tra số điện thoại nghiêm ngặt (bỏ qua khi ẩn danh — không có SĐT)
  if (!isAnon) {
    const phoneError = getPhoneError(draft.contact.phone);
    if (phoneError) throw new Error(`Số điện thoại: ${phoneError.toLowerCase()}.`);
  }

  // ============ CHẾ ĐỘ DATABASE: gửi lên backend, backend lưu vào MySQL ============
  // Backend kiểm tra CHỐNG SPAM + TỪ CẤM + SĐT lần nữa phía máy chủ (không tin trình duyệt)
  if (hasBackend) {
    return apiFetch<FeedbackSubmission>('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({
        content,
        normalizedContent: draft.analysis?.normalizedContent ?? content,
        category: draft.category,
        fullName,
        phone: draft.contact.phone.trim(),
        email: draft.contact.email.trim() || undefined,
        images: await prepareImages(draft.images),
        wardId: draft.contact.wardId ?? null,
        captchaToken: draft.contact.captchaToken ?? '',
        otpToken: draft.contact.otpToken ?? '',
        isAnonymous: draft.contact.isAnonymous === true,
        urgency: draft.urgency || 'normal',
      }),
    });
  }
  // ============ CHẾ ĐỘ DEMO: lưu localStorage như cũ ============

  // Chống spam trước khi cấp mã
  assertNotSpamming(content);

  const submission: FeedbackSubmission = {
    trackingCode: generateTrackingCode(),
    content,
    normalizedContent: draft.analysis?.normalizedContent ?? content,
    category: draft.category,
    contact: {
      fullName,
      phone: draft.contact.phone.trim(),
      ...(draft.contact.email.trim() ? { email: draft.contact.email.trim() } : {}),
    },
    images: draft.images,
    createdAt: new Date().toISOString(),
  };

  const list = readSubmissions();
  list.unshift(submission);
  saveSubmissions(list, submission);
  recordSubmitTime();

  return submission;
}


/** V2: Danh sách địa bàn (phường/xã) để chọn ở form */
export interface WardOption { id: number; name: string }
export async function fetchWards(): Promise<WardOption[]> {
  if (!hasBackend) return [];
  try {
    return await apiFetch<WardOption[]>('/api/submissions/wards');
  } catch {
    return [];
  }
}


/* ============================================================
   XÁC THỰC OTP QUA EMAIL — bắt buộc trước khi gửi ý kiến
   ============================================================ */

export interface OtpSendResult {
  ok: boolean;
  message: string;
  expiresInMinutes: number;
  /** Chỉ có khi hệ thống CHƯA cấu hình email (chế độ demo) */
  devCode?: string;
  demoMode?: boolean;
}

/** Gửi mã 6 số về email của bà con */
export async function sendOtp(email: string): Promise<OtpSendResult> {
  return apiFetch<OtpSendResult>('/api/otp/send', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export interface OtpVerifyResult {
  ok: boolean;
  otpToken: string;
  message: string;
}

/** Kiểm tra mã — đúng thì nhận "vé" để gửi ý kiến (hiệu lực 15 phút) */
export async function verifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  return apiFetch<OtpVerifyResult>('/api/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}


/* ============================================================
   MÃ XÁC THỰC ẨN DANH — không có email nên mã hiện trên màn hình
   ============================================================ */

export interface AnonCodeResult {
  ok: boolean;
  code: string;            // mã 6 số hiện trong ô vàng
  expiresInMinutes: number;
  message: string;
}

/** Xin mã xác thực cho người gửi ẩn danh */
export async function requestAnonCode(): Promise<AnonCodeResult> {
  return apiFetch<AnonCodeResult>('/api/otp/anon-code', { method: 'POST', body: JSON.stringify({}) });
}

/** Xác nhận mã ẩn danh — đúng thì nhận "vé" gửi tin báo (15 phút) */
export async function verifyAnonCode(code: string): Promise<OtpVerifyResult> {
  return apiFetch<OtpVerifyResult>('/api/otp/anon-verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
