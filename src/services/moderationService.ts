/**
 * KIỂM DUYỆT HÌNH ẢNH NHẠY CẢM — 2 tầng:
 *
 * Tầng 1 (luôn chạy, tức thì, offline): heuristic phân tích tỷ lệ điểm ảnh
 *   màu da người trên ảnh thu nhỏ 64x64. Ảnh khoả thân/khiêu dâm thường có
 *   tỷ lệ da rất cao. Đây là lưới lọc thô, có thể nhầm với ảnh chân dung cận.
 *
 * Tầng 2 (khi có key Gemini trong .env): gửi ảnh cho AI thẩm định — chính xác
 *   hơn nhiều và là phán quyết cuối cùng (ghi đè heuristic). Nếu AI lỗi thì
 *   quay về kết quả heuristic.
 */

import { apiFetch, hasBackend, backendHasAI } from './api';

const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
const GEMINI_MODEL = 'gemini-2.5-flash';

export interface ImageModerationResult {
  blocked: boolean;
  reason?: string;
}

/** Nạp ảnh từ data URL */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = dataUrl;
  });
}

/** Tầng 1: tính tỷ lệ điểm ảnh màu da người (quy tắc RGB kinh điển) */
function computeSkinRatio(img: HTMLImageElement): number {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  let skin = 0;
  const total = SIZE * SIZE;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b) {
      skin += 1;
    }
  }
  return skin / total;
}

/** Tầng 2: nhờ Gemini thẩm định — trả 'sensitive' | 'safe' | 'unknown' */
async function askGeminiAboutImage(dataUrl: string): Promise<'sensitive' | 'safe' | 'unknown'> {
  if (!GEMINI_API_KEY) return 'unknown';

  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
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
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini moderation lỗi ${res.status}`);
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  if (/SENSITIVE/i.test(text)) return 'sensitive';
  if (/SAFE/i.test(text)) return 'safe';
  return 'unknown';
}

/** Hàm chính: kiểm tra một ảnh (data URL) có nhạy cảm không */
export async function checkImageSensitive(dataUrl: string): Promise<ImageModerationResult> {
  // Tầng 1: heuristic màu da
  let heuristicSuspicious = false;
  try {
    const img = await loadImage(dataUrl);
    heuristicSuspicious = computeSkinRatio(img) > 0.6;
  } catch {
    /* không đọc được thì bỏ qua heuristic */
  }

  // Tầng 2a: nếu có backend AI, nhờ backend thẩm định (giấu key)
  if (hasBackend && (await backendHasAI())) {
    try {
      const r = await apiFetch<ImageModerationResult>('/api/ai/moderate-image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      if (r.blocked) return r;
      return { blocked: false };
    } catch (e) {
      console.warn('Backend moderate lỗi, thử tiếp:', e);
    }
  }

  // Tầng 2b: AI thẩm định trực tiếp (khi không có backend nhưng có key ở client)
  try {
    const verdict = await askGeminiAboutImage(dataUrl);
    if (verdict === 'sensitive') {
      return { blocked: true, reason: 'AI phát hiện hình ảnh nhạy cảm/khiêu dâm' };
    }
    if (verdict === 'safe') return { blocked: false };
  } catch (error) {
    console.warn('Kiểm duyệt ảnh bằng AI thất bại, dùng heuristic:', error);
  }

  if (heuristicSuspicious) {
    return {
      blocked: true,
      reason: 'Ảnh có tỷ lệ da người bất thường — nghi ngờ nội dung nhạy cảm',
    };
  }
  return { blocked: false };
}
