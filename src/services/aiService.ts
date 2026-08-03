/**
 * Dịch vụ AI.
 * - analyzeContent: phân tích/phân loại nội dung ý kiến (MOCK).
 * - getChatReply: trợ lý hỏi đáp, chỉ có hai đường:
 *     1. Backend /api/ai/chat  — key Gemini nằm phía máy chủ, trình duyệt không thấy
 *     2. Câu trả lời mẫu       — luôn sẵn sàng, không cần key
 *
 * ⚠️ VÌ SAO KHÔNG CÒN GỌI THẲNG OpenAI/Gemini TỪ TRÌNH DUYỆT:
 * Vite INLINE mọi biến VITE_* vào file JavaScript tĩnh. Key đặt ở frontend nằm
 * nguyên văn trong bundle -> mở DevTools là lấy được, ai cũng tiêu quota của
 * đơn vị. Đường an toàn (backend giữ key) đã có sẵn từ trước, nên đường nguy
 * hiểm bị gỡ hẳn thay vì để làm "phương án dự phòng".
 */
import type { AIAnalysisResult, FeedbackCategory } from '../types/feedback';
import type { ChatMessage } from '../types/chat';
import { CATEGORY_KEYWORDS, KEYWORD_DISPLAY, CHAT_RULES, CHAT_FALLBACK } from '../utils/mockData';
import toast from 'react-hot-toast';
import { delay, stripDiacritics, capitalize } from '../utils/helpers';
import { apiFetch, hasBackend, backendHasAI } from './api';

/** Tiền tố diễn đạt lại nội dung theo nhóm phân loại */
const CATEGORY_PREFIX: Record<FeedbackCategory, string> = {
  to_giac: 'Tố giác/tin báo về vụ việc',
  khieu_nai: 'Khiếu nại/tố cáo về nội dung',
  phan_anh: 'Phản ánh về tình hình',
  de_xuat: 'Đề xuất/thắc mắc về nội dung',
};

/**
 * Phân tích nội dung công dân gửi:
 * - Khớp từ khoá (đã bỏ dấu) để hiểu được cả văn bản viết thiếu dấu/sai chính tả
 * - Gợi ý nhóm xử lý + độ tin cậy + từ khoá nhận diện được
 */
export async function analyzeContent(raw: string): Promise<AIAnalysisResult> {
  // Ưu tiên AI thật qua backend (key nằm phía server)
  if (hasBackend && (await backendHasAI())) {
    try {
      return await apiFetch<AIAnalysisResult>('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ content: raw }),
      });
    } catch (e) {
      console.warn('Backend analyze lỗi, dùng phân tích cục bộ:', e);
    }
  }
  // Giả lập thời gian AI "suy nghĩ"
  await delay(1400 + Math.random() * 800);

  const plain = stripDiacritics(raw.toLowerCase());
  const scores: Record<FeedbackCategory, number> = { to_giac: 0, khieu_nai: 0, phan_anh: 0, de_xuat: 0 };
  const matched: string[] = [];

  (Object.keys(CATEGORY_KEYWORDS) as FeedbackCategory[]).forEach((cat) => {
    CATEGORY_KEYWORDS[cat].forEach((kw) => {
      if (plain.includes(kw)) {
        scores[cat] += 1;
        matched.push(KEYWORD_DISPLAY[kw] ?? kw);
      }
    });
  });

  // Chọn nhóm có điểm cao nhất; mặc định là "Phản ánh, kiến nghị"
  let best: FeedbackCategory = 'phan_anh';
  let bestScore = 0;
  (Object.keys(scores) as FeedbackCategory[]).forEach((cat) => {
    if (scores[cat] > bestScore) {
      best = cat;
      bestScore = scores[cat];
    }
  });

  const confidence = bestScore === 0 ? 0.62 : Math.min(0.6 + bestScore * 0.12, 0.97);

  // "Chuẩn hoá": làm sạch khoảng trắng, viết hoa đầu câu, thêm dấu câu kết thúc
  const cleaned = capitalize(raw.trim().replace(/\s+/g, ' '));
  const ending = /[.!?]$/.test(cleaned) ? '' : '.';
  const normalizedContent = `${CATEGORY_PREFIX[best]}: “${cleaned}${ending}”`;

  return {
    normalizedContent,
    suggestedCategory: best,
    confidence,
    keywords: [...new Set(matched)].slice(0, 5),
  };
}

/* ------------------------------------------------------------------ */
/* Trợ lý hỏi đáp: backend (giấu key) → câu trả lời mẫu                 */
/* ------------------------------------------------------------------ */

/** Nhãn "bộ não" đang hoạt động — hiển thị trên header widget chat */
export const AI_ENGINE_LABEL: string | null = hasBackend ? 'Gemini' : null;

/** Trả lời theo kịch bản mẫu (mock) — dùng khi không có backend hoặc backend lỗi */
async function getChatReplyFromMock(userMessage: string): Promise<string> {
  await delay(800 + Math.random() * 700);
  const plain = stripDiacritics(userMessage.toLowerCase());
  for (const rule of CHAT_RULES) {
    if (rule.keywords.some((kw) => plain.includes(kw))) return rule.reply;
  }
  return CHAT_FALLBACK;
}

/** Chỉ hiện cảnh báo lỗi API 1 lần mỗi phiên để không làm phiền người dùng */
let hasWarnedAIFailure = false;

function warnAIFailureOnce() {
  if (hasWarnedAIFailure) return;
  hasWarnedAIFailure = true;
  toast.error(
    'Không gọi được trợ lý AI — mở F12 → Console để xem mã lỗi chi tiết. Tạm dùng câu trả lời mẫu.',
    { duration: 7000 }
  );
}

/**
 * Hàm chính widget chat gọi: backend (giữ key phía máy chủ) → câu trả lời mẫu.
 * Không có nhánh gọi thẳng nhà cung cấp: xem khối giải thích ở đầu file.
 */
export async function getChatReply(userMessage: string, history: ChatMessage[] = []): Promise<string> {
  if (hasBackend && (await backendHasAI())) {
    try {
      const { reply } = await apiFetch<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: userMessage, history }),
      });
      return reply;
    } catch (e) {
      console.warn('Backend chat lỗi, chuyển về câu trả lời mẫu:', e);
      warnAIFailureOnce();
    }
  }
  return getChatReplyFromMock(userMessage);
}
