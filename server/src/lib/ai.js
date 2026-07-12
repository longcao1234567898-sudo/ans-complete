/**
 * Gọi Gemini TỪ PHÍA MÁY CHỦ — API key không bao giờ lộ xuống trình duyệt.
 * Node 18+ có sẵn fetch, không cần thư viện thêm.
 */
import { UNIT } from './unit.js';

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
// Đổi model bằng biến môi trường GEMINI_MODEL trên Render (không cần sửa code):
//   gemini-2.5-pro    — thông minh nhất (MẶC ĐỊNH)
//   gemini-2.5-flash  — nhanh hơn, hạn mức free cao hơn
// PHÂN TÍCH ý kiến -> Pro (ít lượt gọi, cần CHÍNH XÁC để phân loại tố giác đúng)
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-pro').trim();

// CHATBOX -> Flash (nhiều lượt gọi, cần NHANH, hạn mức free cao hơn nhiều)
const GEMINI_CHAT_MODEL = (process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash').trim();

// Khi Pro hết quota (lỗi 429) -> tự động dùng model này thay thế
const FALLBACK_MODEL = 'gemini-2.5-flash';

const isPro = (m) => String(m).includes('pro');

/**
 * ⚠️ BẪY: Gemini 2.5 PRO KHÔNG CHO TẮT "thinking".
 *    - Flash: thinkingBudget = 0  -> tắt được
 *    - Pro:   thinkingBudget tối thiểu 128 -> đặt 0 sẽ LỖI API
 * Hàm này tự chọn giá trị hợp lệ cho từng model.
 *
 * @param {number} proBudget - ngân sách suy nghĩ cho Pro (128 = ít nhất, nhanh nhất)
 */
function thinking(model, proBudget = 128) {
  return { thinkingConfig: { thinkingBudget: isPro(model) ? proBudget : 0 } };
}
const urlOf = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const aiAvailable = () => Boolean(GEMINI_API_KEY);

const SYSTEM_PROMPT = `Bạn là trợ lý AI của ${UNIT.name}, hỗ trợ người dân ${UNIT.communeName} về:
- Thủ tục hành chính: căn cước, cư trú (tạm trú/tạm vắng), lý lịch tư pháp, dịch vụ công trực tuyến...
- An ninh trật tự: cách gửi tố giác, tin báo, phản ánh; cảnh giác lừa đảo.
- Pháp luật Việt Nam liên quan đến đời sống hằng ngày.

Quy tắc trả lời:
- Ngắn gọn, thân thiện, dễ hiểu; xưng "tôi", gọi người hỏi là "bà con". Dùng Markdown.
- Khẩn cấp: hướng dẫn gọi ngay ${UNIT.emergency} hoặc hotline ${UNIT.name}: ${UNIT.hotline}.
- Vụ việc phức tạp: khuyên đến trực tiếp trụ sở (${UNIT.address}). Chỉ trả lời bằng tiếng Việt.`;

/** Gọi Gemini 1 lần với model chỉ định */
async function callOnce(model, body) {
  const res = await fetch(urlOf(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Gemini lỗi HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts;
  const text = parts?.map((p) => p.text ?? '').join('').trim();

  // Gemini bị cắt giữa chừng vì hết token -> báo rõ, đừng để JSON.parse chết
  if (cand?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini bị cắt giữa chừng (hết token). Cần tăng maxOutputTokens.');
  }
  if (!text) throw new Error('Gemini trả về nội dung rỗng');
  return text;
}

/**
 * Gọi Gemini — TỰ ĐỘNG DỰ PHÒNG khi hết hạn mức.
 *
 * Gemini 2.5 PRO bản free có hạn mức rất thấp (~5 lượt/phút).
 * Hết quota -> lỗi 429 -> AI chết hoàn toàn.
 * Hàm này bắt lỗi 429 và tự chuyển sang Flash (hạn mức cao hơn nhiều),
 * chỉnh lại thinkingBudget cho hợp lệ. Người dùng KHÔNG bị gián đoạn.
 */
async function callGemini(model, body) {
  try {
    return await callOnce(model, body);
  } catch (err) {
    const outOfQuota = err.status === 429;
    if (!outOfQuota || model === FALLBACK_MODEL) throw err;

    console.warn(`⚠️  ${model} hết hạn mức (429) — tự chuyển sang ${FALLBACK_MODEL}`);

    // Flash TẮT được thinking (Pro thì không) -> phải chỉnh lại cho hợp lệ
    const fallbackBody = {
      ...body,
      generationConfig: {
        ...body.generationConfig,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    return await callOnce(FALLBACK_MODEL, fallbackBody);
  }
}

/** Rút JSON ra khỏi văn bản, kể cả khi Gemini bọc trong ```json ... ``` */
function extractJson(raw) {
  let t = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
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
  return callGemini(GEMINI_CHAT_MODEL, {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.4,
      ...thinking(GEMINI_CHAT_MODEL, 256),
    },
  });
}

const VALID_CATEGORIES = new Set(['to_giac', 'khieu_nai', 'phan_anh', 'de_xuat']);

/** AI phân tích + phân loại ý kiến — yêu cầu Gemini trả JSON thuần */
export async function geminiAnalyze(content) {
  const prompt = `Bạn là cán bộ tiếp dân của ${UNIT.name}, chuyên phân loại ý kiến công dân.

=== ĐỊNH NGHĨA 4 NHÓM (đọc kỹ, đây là căn cứ pháp lý) ===

1. "to_giac" — TỐ GIÁC, TIN BÁO VỀ TỘI PHẠM
   Báo về HÀNH VI CÓ DẤU HIỆU TỘI PHẠM: trộm cắp, cướp giật, ma tuý, đánh bạc,
   cho vay nặng lãi, lừa đảo chiếm đoạt tài sản, cố ý gây thương tích, buôn lậu,
   mại dâm, tàng trữ vũ khí, tổ chức đưa người vượt biên...
   DẤU HIỆU: có kẻ vi phạm cụ thể, có hành vi phạm pháp, cần điều tra xử lý hình sự.

2. "khieu_nai" — KHIẾU NẠI, TỐ CÁO
   Không đồng ý với QUYẾT ĐỊNH / HÀNH VI của CƠ QUAN NHÀ NƯỚC hoặc CÁN BỘ.
   VD: cán bộ nhũng nhiễu, đòi tiền "bôi trơn", xử lý sai, thái độ cửa quyền,
   quyết định hành chính không đúng, giải quyết hồ sơ chậm trễ có dấu hiệu tiêu cực.
   DẤU HIỆU: đối tượng bị phản ánh là CÁN BỘ / CƠ QUAN.

3. "phan_anh" — PHẢN ÁNH, KIẾN NGHỊ VỀ AN NINH TRẬT TỰ
   Tình hình ANTT, đời sống chưa đến mức tội phạm nhưng gây bất an:
   tụ tập gây rối, đua xe, karaoke ồn ào, hàng quán lấn chiếm, đèn đường hỏng,
   ngập nước, xe container chạy ẩu, thanh niên tụ tập đêm khuya...
   DẤU HIỆU: hiện tượng chung, chưa xác định rõ tội phạm.

4. "de_xuat" — ĐỀ XUẤT, HỎI ĐÁP, THỦ TỤC
   Hỏi thủ tục hành chính (CCCD, VNeID, tạm trú, hộ khẩu, lý lịch tư pháp),
   góp ý xây dựng, đề xuất giải pháp, hỏi giờ làm việc...
   DẤU HIỆU: KHÔNG tố cáo ai, chỉ hỏi hoặc góp ý.

=== QUY TẮC PHÂN LOẠI ===
- Có dấu hiệu TỘI PHẠM -> to_giac (dù người dân diễn đạt nhẹ nhàng)
- Phản ánh CÁN BỘ / CƠ QUAN sai phạm -> khieu_nai
- Bất an về ANTT nhưng chưa rõ tội phạm -> phan_anh
- Chỉ hỏi/góp ý -> de_xuat
- Nếu phân vân giữa to_giac và phan_anh: nghiêng về to_giac (an toàn hơn cho dân)

=== VÍ DỤ ===
"toi thay may thang nghien chich hut sau nha van hoa ap 3"
-> to_giac (ma tuý), confidence 0.9

"can bo tiep dan bat toi di lai 3 lan van chua xong ho so, con goi y bo phong bi"
-> khieu_nai (cán bộ nhũng nhiễu), confidence 0.95

"quan nhau gan cho ho mo nhac to den 2h sang khong ai ngu duoc"
-> phan_anh (ANTT), confidence 0.88

"cho hoi lam cccd gan chip can giay to gi"
-> de_xuat (thủ tục), confidence 0.95

=== NHIỆM VỤ ===
Nội dung công dân gửi (có thể thiếu dấu, sai chính tả, dùng từ địa phương):
"""${content}"""

1. normalizedContent: Viết lại thành văn bản HÀNH CHÍNH chuẩn — đủ dấu, đúng chính tả,
   giữ NGUYÊN sự việc và chi tiết (địa điểm, thời gian, đối tượng), KHÔNG bịa thêm,
   KHÔNG bỏ sót. Mở đầu bằng tiền tố phù hợp:
   - to_giac   -> "Tố giác/tin báo về vụ việc: ..."
   - khieu_nai -> "Khiếu nại/tố cáo về: ..."
   - phan_anh  -> "Phản ánh, kiến nghị về: ..."
   - de_xuat   -> "Đề xuất/thắc mắc: ..."

2. suggestedCategory: đúng 1 trong 4 mã trên.

3. confidence: 0.0 - 1.0. Nội dung mơ hồ, thiếu thông tin -> để thấp (dưới 0.6).

4. keywords: tối đa 5 từ khoá tiếng Việt CÓ DẤU, phản ánh đúng bản chất vụ việc.`;

  const raw = await callGemini(GEMINI_MODEL, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      // 500 token là QUÁ ÍT: gemini-2.5-flash mặc định bật "thinking",
      // phần suy nghĩ nội bộ ăn hết token -> JSON bị cắt giữa chừng
      // -> lỗi "Unterminated string in JSON".
      maxOutputTokens: 2048,
      temperature: 0.2,
      // Ép Gemini trả JSON hợp lệ, không kèm markdown hay lời dẫn
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          normalizedContent: { type: 'STRING' },
          suggestedCategory: { type: 'STRING', enum: ['to_giac', 'khieu_nai', 'phan_anh', 'de_xuat'] },
          confidence: { type: 'NUMBER' },
          keywords: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['normalizedContent', 'suggestedCategory', 'confidence', 'keywords'],
      },
      // Flash: tắt hẳn thinking. Pro: buộc phải có, cho 512 để phân loại chuẩn hơn.
      ...thinking(GEMINI_MODEL, 512),
    },
  });

  let parsed;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    console.warn('Gemini trả JSON hỏng:', String(raw).slice(0, 120));
    throw new Error('AI trả về dữ liệu không hợp lệ');
  }

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
  const text = await callGemini(GEMINI_CHAT_MODEL, {
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
    generationConfig: {
      maxOutputTokens: 20,
      temperature: 0,
      ...thinking(GEMINI_CHAT_MODEL, 128),
    },
  });
  return /SENSITIVE/i.test(text);
}
