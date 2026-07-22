/**
 * Dịch vụ AI.
 * - analyzeContent: phân tích/phân loại nội dung ý kiến (MOCK).
 * - getChatReply: trợ lý hỏi đáp, tự chọn "bộ não" theo thứ tự ưu tiên:
 *     1. ChatGPT (OpenAI)  — nếu có VITE_OPENAI_API_KEY trong file .env (trả phí)
 *     2. Google Gemini      — nếu có VITE_GEMINI_API_KEY trong file .env (CÓ GÓI MIỄN PHÍ)
 *     3. Câu trả lời mẫu    — luôn sẵn sàng, không cần key
 *   Nếu gọi API lỗi, hệ thống âm thầm rơi xuống lựa chọn kế tiếp — bà con luôn có câu trả lời.
 *
 * ⚠️ LƯU Ý BẢO MẬT: API key đặt ở frontend sẽ lộ cho người xem mã nguồn trang web.
 * Cách này CHỈ dùng để demo/chạy thử trên máy cá nhân. Khi triển khai thật,
 * cần dựng backend trung gian để giữ key.
 */
import type { AIAnalysisResult, FeedbackCategory } from '../types/feedback';
import type { ChatMessage } from '../types/chat';
import { UNIT } from '../utils/constants';
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
/* Trợ lý hỏi đáp: ChatGPT → Gemini → câu trả lời mẫu                   */
/* ------------------------------------------------------------------ */

/** Đọc API key từ file .env (biến bắt đầu bằng VITE_ mới dùng được ở frontend) */
const OPENAI_API_KEY = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();

/** Model sử dụng — đổi tại đây nếu Google/OpenAI cập nhật tên model mới */
const OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-2.5-flash';

/** Nhãn "bộ não" đang hoạt động — hiển thị trên header widget chat */
export const AI_ENGINE_LABEL: string | null =
  hasBackend || OPENAI_API_KEY ? (OPENAI_API_KEY ? 'ChatGPT' : 'Gemini') : GEMINI_API_KEY ? 'Gemini' : null;

/** Vai trò của trợ lý — cá thể hoá theo đơn vị trong constants.ts */
const SYSTEM_PROMPT = `Bạn là trợ lý AI của ${UNIT.name}, hỗ trợ người dân ${UNIT.communeName} về:
- Thủ tục hành chính: căn cước, cư trú (tạm trú/tạm vắng), lý lịch tư pháp, dịch vụ công trực tuyến...
- An ninh trật tự: cách gửi tố giác, tin báo, phản ánh; cảnh giác lừa đảo.
- Pháp luật Việt Nam liên quan đến đời sống hằng ngày.

Quy tắc trả lời:
- Ngắn gọn, thân thiện, dễ hiểu với người dân; xưng "tôi", gọi người hỏi là "bà con".
- Dùng Markdown (in đậm, gạch đầu dòng) cho dễ đọc.
- Tình huống khẩn cấp: hướng dẫn gọi ngay ${UNIT.emergency} hoặc hotline ${UNIT.name}: ${UNIT.hotline}.
- Không tư vấn vượt thẩm quyền; vụ việc phức tạp thì khuyên bà con đến trực tiếp trụ sở (${UNIT.address}).
- Chỉ trả lời bằng tiếng Việt.`;

/** Gọi OpenAI Chat Completions API (kèm ngữ cảnh hội thoại gần nhất) */
async function getChatReplyFromOpenAI(userMessage: string, history: ChatMessage[]): Promise<string> {
  const recentHistory = history.slice(-8).map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: m.content,
  }));

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...recentHistory, { role: 'user', content: userMessage }],
      max_tokens: 600,
      temperature: 0.4,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API trả về mã lỗi ${res.status}`);

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI API trả về nội dung rỗng');
  return text;
}

/** Danh sách model thử lần lượt (Google có thể đổi tên model theo thời gian) */
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

/** Ghi nhớ model đã gọi thành công để các lần sau không phải thử lại */
let workingGeminiModel: string | null = null;

/**
 * Gọi Google Gemini API — endpoint GỐC (generativelanguage.googleapis.com).
 * Key dạng AIza... (cũ) hay AQ.... (Auth key chuẩn mới từ 6/2026) đều dùng được:
 * endpoint gốc không quan tâm định dạng key, chỉ các wrapper/endpoint kiểu OpenAI
 * mới từ chối key AQ. — vì vậy KHÔNG kiểm tra định dạng key ở phía code.
 * Key được gửi qua header x-goog-api-key (sạch hơn việc gắn vào URL).
 */
async function getChatReplyFromGemini(userMessage: string, history: ChatMessage[]): Promise<string> {
  // Gemini dùng role "model" cho tin nhắn của trợ lý
  const contents = [
    ...history.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    // 800 token là QUÁ ÍT: Gemini 2.5 Flash mặc định bật "thinking",
    // phần suy nghĩ ăn gần hết -> câu trả lời cụt sau vài dòng.
    // Nâng lên 4096 và giới hạn phần nghĩ để chừa chỗ viết.
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: 256 },
    },
  });

  const modelsToTry = workingGeminiModel ? [workingGeminiModel] : GEMINI_MODELS;
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY as string,
        },
        body,
      });

      if (!res.ok) {
        // In chi tiết lỗi ra Console (F12) để dễ "bắt bệnh": 400 = request sai,
        // 401/403 = key/quyền, 404 = tên model không tồn tại, 429 = hết quota
        const errText = await res.text().catch(() => '');
        console.warn(`[Gemini] model "${model}" lỗi HTTP ${res.status}:`, errText);
        lastError = new Error(`Gemini trả về mã lỗi ${res.status}`);
        continue; // thử model kế tiếp
      }

      const data = await res.json();
      const parts: Array<{ text?: string }> | undefined = data?.candidates?.[0]?.content?.parts;
      const text = parts?.map((p) => p.text ?? '').join('').trim();
      if (!text) {
        lastError = new Error('Gemini trả về nội dung rỗng');
        continue;
      }

      workingGeminiModel = model; // ghi nhớ model chạy được
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  workingGeminiModel = null;
  throw lastError ?? new Error('Gemini không phản hồi');
}

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

function warnAIFailureOnce(engine: string) {
  if (hasWarnedAIFailure) return;
  hasWarnedAIFailure = true;
  toast.error(
    `Không gọi được ${engine} — mở F12 → Console để xem mã lỗi chi tiết. Kiểm tra API key trong .env rồi khởi động lại. Tạm dùng câu trả lời mẫu.`,
    { duration: 7000 }
  );
}

/**
 * Hàm chính widget chat gọi: thử lần lượt ChatGPT → Gemini → câu trả lời mẫu.
 */
export async function getChatReply(userMessage: string, history: ChatMessage[] = []): Promise<string> {
  // Ưu tiên backend (giấu key). Lỗi thì rơi xuống các phương án cũ.
  if (hasBackend && (await backendHasAI())) {
    try {
      const { reply } = await apiFetch<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: userMessage, history }),
      });
      return reply;
    } catch (e) {
      console.warn('Backend chat lỗi, thử phương án khác:', e);
    }
  }
  if (OPENAI_API_KEY) {
    try {
      return await getChatReplyFromOpenAI(userMessage, history);
    } catch (error) {
      console.warn('Gọi ChatGPT thất bại, thử phương án kế tiếp:', error);
      if (!GEMINI_API_KEY) warnAIFailureOnce('ChatGPT');
    }
  }
  if (GEMINI_API_KEY) {
    try {
      return await getChatReplyFromGemini(userMessage, history);
    } catch (error) {
      console.warn('Gọi Gemini thất bại, chuyển về câu trả lời mẫu:', error);
      warnAIFailureOnce('Gemini');
    }
  }
  return getChatReplyFromMock(userMessage);
}
