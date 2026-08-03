import { isToGiacText } from '../utils/security';
/**
 * KIỂM DUYỆT HÌNH ẢNH NHẠY CẢM — 2 tầng:
 *
 * Tầng 1 (luôn chạy, tức thì, offline): heuristic phân tích tỷ lệ điểm ảnh
 *   màu da người trên ảnh thu nhỏ 64x64. Ảnh khoả thân/khiêu dâm thường có
 *   tỷ lệ da rất cao. Đây là lưới lọc thô, có thể nhầm với ảnh chân dung cận.
 *
 * Tầng 2 (khi backend có bật AI): gửi ảnh cho BACKEND thẩm định — chính xác hơn
 *   nhiều và là phán quyết cuối cùng (ghi đè heuristic). Backend lỗi hoặc không
 *   có backend thì quay về kết quả heuristic.
 *
 * ⚠️ KHÔNG CÒN nhánh gửi ảnh THẲNG từ trình duyệt sang Google: nhánh đó vừa làm
 * lộ API key trong bundle JavaScript, vừa đẩy ẢNH BẰNG CHỨNG của người dân ra
 * dịch vụ bên thứ ba ngay từ máy của họ. Không có backend thì thà chỉ dùng
 * heuristic cục bộ, tuyệt đối KHÔNG chặn người dân gửi ý kiến vì thiếu AI.
 */

import { apiFetch, hasBackend, backendHasAI } from './api';

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

/** Hàm chính: kiểm tra một ảnh (data URL) có nhạy cảm không */
export async function checkImageSensitive(
  dataUrl: string,
  /** Nội dung ý kiến — nếu là TỐ GIÁC thì KHÔNG gửi ảnh sang AI bên ngoài */
  content = ''
): Promise<ImageModerationResult> {
  // 🛡️ ẢNH BẰNG CHỨNG TỐ GIÁC: chỉ kiểm duyệt CỤC BỘ, tuyệt đối không gửi sang Google.
  // Ảnh tố giác có thể chứa mặt người, biển số xe, hiện trường — dữ liệu nhạy cảm nhất.
  const isToGiac = isToGiacText(content);
  // Tầng 1: heuristic màu da
  let heuristicSuspicious = false;
  try {
    const img = await loadImage(dataUrl);
    heuristicSuspicious = computeSkinRatio(img) > 0.6;
  } catch {
    /* không đọc được thì bỏ qua heuristic */
  }

  // Tầng 2: nhờ backend AI thẩm định — BỎ QUA nếu là ảnh tố giác.
  // Backend lỗi -> rơi xuống heuristic bên dưới, KHÔNG chặn người dân.
  if (!isToGiac && hasBackend && (await backendHasAI())) {
    try {
      const r = await apiFetch<ImageModerationResult>('/api/ai/moderate-image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      if (r.blocked) return r;
      return { blocked: false };
    } catch (e) {
      console.warn('Backend moderate lỗi, dùng heuristic cục bộ:', e);
    }
  }

  if (heuristicSuspicious) {
    return {
      blocked: true,
      reason: 'Ảnh có tỷ lệ da người bất thường — nghi ngờ nội dung nhạy cảm',
    };
  }
  return { blocked: false };
}
