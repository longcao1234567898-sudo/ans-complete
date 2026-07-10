/**
 * Gọi Gemini TỪ PHÍA MÁY CHỦ — API key không bao giờ lộ xuống trình duyệt.
 * Node 18+ có sẵn fetch, không cần thư viện thêm.
 */
import { UNIT } from './unit.js';

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = 'gemini-2.5-flash';
const BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const aiAvailable = () => Boolean(GEMINI_API_KEY);

const SYSTEM_PROMPT = `Bạn là trợ lý AI của ${UNIT.name}, hỗ trợ người dân ${UNIT.communeName} về:
- Thủ tục hành chính: căn cước, cư trú (tạm trú/tạm vắng), lý lịch tư pháp, dịch vụ công trực tuyến...
- An ninh trật tự: cách gửi tố giác, tin báo, phản ánh; cảnh giác lừa đảo.
- Pháp luật Việt Nam liên quan đến đời sống hằng ngày.

Quy tắc trả lời:
- Ngắn gọn, thân thiện, dễ hiểu; xưng "tôi", gọi người hỏi là "bà con". Dùng Markdown.
- Khẩn cấp: hướng dẫn gọi ngay ${UNIT.emergency} hoặc hotline ${UNIT.name}: ${UNIT.hotline}.
- Vụ việc phức tạp: khuyên đến trực tiếp trụ sở (${UNIT.address}). Chỉ trả lời bằng tiếng Việt.`;

async function callGemini(body) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini lỗi HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini trả về nội dung rỗng');
  return text;
}

/** Trợ lý chat — kèm ngữ cảnh 8 tin nhắn gần nhất */
export async function geminiChat(message, history = []) {
  const contents = [
    ...history.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content ?? '').slice(0, 2000) }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];
  return callGemini({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
  });
}

const VALID_CATEGORIES = new Set(['to_giac', 'khieu_nai', 'phan_anh', 'de_xuat']);

/** AI phân tích + phân loại ý kiến — yêu cầu Gemini trả JSON thuần */
export async function geminiAnalyze(content) {
  const prompt = `Bạn là hệ thống phân loại ý kiến công dân của ${UNIT.name}.
Nội dung công dân gửi (có thể thiếu dấu, sai chính tả): """${content}"""

Nhiệm vụ:
1. Diễn đạt lại nội dung rõ ràng, đúng chính tả tiếng Việt, thêm tiền tố phù hợp
   (VD: 'Tố giác/tin báo về vụ việc: "..."').
2. Phân vào đúng 1 nhóm: to_giac | khieu_nai | phan_anh | de_xuat.
3. Trích tối đa 5 từ khoá quan trọng.

CHỈ trả về JSON thuần, không markdown, không giải thích, đúng cấu trúc:
{"normalizedContent":"...","suggestedCategory":"phan_anh","confidence":0.85,"keywords":["...","..."]}`;

  const raw = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
  });

  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!VALID_CATEGORIES.has(parsed.suggestedCategory)) parsed.suggestedCategory = 'phan_anh';
  parsed.confidence = Math.min(0.97, Math.max(0.5, Number(parsed.confidence) || 0.7));
  parsed.keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5).map(String) : [];
  parsed.normalizedContent = String(parsed.normalizedContent || content).slice(0, 2500);
  return parsed;
}

/** Kiểm duyệt ảnh nhạy cảm */
export async function geminiModerateImage(dataUrl) {
  const [header, base64] = String(dataUrl).split(',');
  const mimeType = header?.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const text = await callGemini({
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          {
            text:
              'Bạn là bộ lọc kiểm duyệt của cổng tiếp nhận ý kiến công dân. ' +
              'Ảnh trên có chứa nội dung khiêu dâm, khoả thân hoặc nhạy cảm tình dục không? ' +
              'Chỉ trả lời đúng MỘT từ: SENSITIVE hoặc SAFE.',
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 10, temperature: 0 },
  });
  return /SENSITIVE/i.test(text);
}
