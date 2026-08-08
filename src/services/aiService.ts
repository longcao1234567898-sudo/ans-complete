/**
 * Dịch vụ AI.
 * - analyzeContent: phân tích/phân loại nội dung ý kiến.
 * - getChatReply: trợ lý hỏi đáp.
 *
 * Thứ tự ưu tiên của cả hai hàm:
 *     1. Backend /api/ai/*  — API key nằm PHÍA MÁY CHỦ (Render), trình duyệt không thấy
 *     2. Phân tích cục bộ / câu trả lời mẫu — luôn sẵn sàng, không cần key
 *   Backend lỗi thì rơi xuống phương án 2 — bà con luôn có câu trả lời.
 *
 * 🔒 BẢO MẬT — KHÔNG ĐƯỢC PHÁ QUY TẮC NÀY:
 * Frontend TUYỆT ĐỐI không giữ API key. Mọi biến `VITE_*` đều bị Vite nhúng
 * thẳng vào file JS build, ai mở F12 cũng đọc được. Vì vậy ở đây KHÔNG có
 * VITE_GEMINI_API_KEY / VITE_OPENAI_API_KEY, và KHÔNG gọi trực tiếp
 * generativelanguage.googleapis.com hay api.openai.com.
 * Muốn thêm nhà cung cấp AI mới -> thêm ở server/src/lib/ai.js, không thêm ở đây.
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
 * Phân tích nội dung công dân gửi.
 *
 * 🔒 KHÔNG DÙNG AI BÊN NGOÀI. Máy chủ phân loại bằng bộ luật từ khoá nội bộ,
 * nội dung không rời khỏi hệ thống. Máy chủ không truy cập được thì rơi
 * xuống bộ phân loại rút gọn chạy ngay trên trình duyệt.
 *
 * Vì sao bỏ AI ở khâu này: mọi ý kiến người dân gửi đều là dữ liệu nhạy cảm,
 * không riêng gì tố giác. Khiếu nại có tên cán bộ, phản ánh có địa chỉ nhà —
 * gửi sang dịch vụ ngoài đều là rủi ro. Phân loại bằng luật còn giải thích
 * được VÌ SAO xếp vào nhóm đó, điều mà AI không làm được.
 */
export async function analyzeContent(raw: string): Promise<AIAnalysisResult> {
  // Máy chủ phân loại bằng bộ luật nội bộ — KHÔNG kiểm tra AI có bật hay không
  if (hasBackend) {
    try {
      return await apiFetch<AIAnalysisResult>('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ content: raw }),
      });
    } catch (e) {
      console.warn('Máy chủ phân loại lỗi, dùng bộ phân loại trên trình duyệt:', e);
    }
  }
  await delay(300);

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

/**
 * Cờ báo trợ lý có sẵn sàng không — dùng để hiện/ẩn chấm xanh trên đầu
 * khung chat. KHÔNG còn mang tên nhà cung cấp: bà con không cần biết hệ
 * thống dùng dịch vụ của hãng nào, thông tin đó chỉ gây phân tâm.
 * Rỗng = không có máy chủ -> chạy câu trả lời mẫu, không hiện chấm.
 *
 * Lưu ý: prompt hệ thống (vai trò trợ lý, thông tin đơn vị) nay nằm ở
 * server/src/lib/ai.js — trước đây đặt ở đây là thừa vì frontend không còn
 * tự gọi AI nữa.
 */
export const AI_ENGINE_LABEL: string | null = hasBackend ? 'san-sang' : null;

/** Trả lời theo kịch bản mẫu (mock) — dùng khi không có API key hoặc API lỗi */
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
    'Không gọi được trợ lý AI — mở F12 → Console để xem mã lỗi. Kiểm tra GEMINI_API_KEY trên Render (biến của MÁY CHỦ, không phải file .env của frontend). Tạm dùng câu trả lời mẫu.',
    { duration: 7000 }
  );
}

/**
 * Hàm chính widget chat gọi: backend (giấu key) → câu trả lời mẫu.
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
