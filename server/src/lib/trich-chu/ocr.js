/**
 * OCR NỘI BỘ — tesseract.js, mô hình tiếng Việt và tiếng Anh nằm sẵn trong
 * node_modules (P52). CHỈ chạy trong tiến trình con (tien-trinh-con.js).
 * ============================================================================
 *
 * KHÔNG TẢI GÌ LÚC CHẠY: mặc định tesseract.js tải mô hình ngôn ngữ từ CDN.
 * Ở đây mô hình đến từ gói @tesseract.js-data/* đã ghim phiên bản và có mã băm
 * toàn vẹn trong package-lock — ảnh không đi đâu, mô hình không ai tráo được.
 *
 * NGÔN NGỮ (đo trên ảnh mẫu P52, chi tiết ở ADR-005):
 *   · Mô hình tiếng Việt đọc cả chữ Latin không dấu rất tốt — kể cả văn bản
 *     tiếng Anh (0–0,3% lỗi ký tự trên ảnh mẫu), nên là mặc định.
 *   · Ghép "vie+eng" làm tiếng Việt kém đi chút (0,6% -> 1,2%) và chậm hơn, nên
 *     chỉ dùng khi chữ đọc ra trông như văn bản tiếng Anh: đọc lại bằng vie+eng
 *     rồi giữ bản có độ tin cậy cao hơn.
 *   · Cán bộ chọn được hẳn một ngôn ngữ khi trích lại.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createWorker } from 'tesseract.js';

export const NGON_NGU = ['vie', 'eng', 'vie+eng'];
const require = createRequire(import.meta.url);

let thuMuc = null;
function thuMucMoHinh() {
  if (thuMuc) return thuMuc;
  /* tesseract.js tìm mọi ngôn ngữ trong MỘT thư mục — hai gói nằm hai nơi, nên
     gom bằng liên kết tượng trưng vào một thư mục tạm của tiến trình này */
  const tam = mkdtempSync(join(tmpdir(), 'htans-ocr-'));
  for (const ma of ['vie', 'eng']) {
    const goi = dirname(require.resolve(`@tesseract.js-data/${ma}/package.json`));
    symlinkSync(join(goi, '4.0.0_best_int', `${ma}.traineddata.gz`), join(tam, `${ma}.traineddata.gz`));
  }
  process.once('exit', () => { try { rmSync(tam, { recursive: true, force: true }); } catch { /* bỏ qua */ } });
  thuMuc = tam;
  return tam;
}

const boDoc = new Map();
function layBoDoc(ngonNgu) {
  if (!boDoc.has(ngonNgu)) {
    boDoc.set(ngonNgu, createWorker(ngonNgu.split('+'), 1, {
      langPath: thuMucMoHinh(),
      cacheMethod: 'none',
      gzip: true,
      errorHandler: () => {},
    }));
  }
  return boDoc.get(ngonNgu);
}

const TU_TIENG_ANH = /\b(the|and|of|to|in|is|on|for|with|from|at|by|was|were|this|that)\b/gi;
const CHU_CO_DAU = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi;

/**
 * Chữ đọc ra trông như PHẦN LỚN là tiếng Anh. Văn bản tiếng Việt có chừng 20–30%
 * chữ cái mang dấu; dưới 8% là tiếng Anh, có thể lẫn vài dòng tiếng Việt (bản
 * khai của người nước ngoài kèm lời phiên dịch) — đúng loại mà vie+eng đọc tốt hơn.
 */
export function trongNhuTiengAnh(text) {
  const chuCai = (text.match(/\p{L}/gu) || []).length;
  if (chuCai < 30) return false;
  const coDau = (text.match(CHU_CO_DAU) || []).length;
  return coDau / chuCai < 0.08 && (text.match(TU_TIENG_ANH) || []).length >= 3;
}

/** OCR một ảnh (Buffer JPEG/PNG/BMP/WebP). ngonNgu null = tự chọn như trên. */
export async function ocr(anh, { ngonNgu = null } = {}) {
  const nn = ngonNgu ?? 'vie';
  const { data } = await (await layBoDoc(nn)).recognize(anh);
  let kq = { noiDung: data.text ?? '', doTinCay: Number(data.confidence) || 0, ngonNgu: nn, thuTiengAnh: false };
  if (!ngonNgu && trongNhuTiengAnh(kq.noiDung)) {
    const lai = (await (await layBoDoc('vie+eng')).recognize(anh)).data;
    kq.thuTiengAnh = true;
    if ((Number(lai.confidence) || 0) > kq.doTinCay) {
      kq = { noiDung: lai.text ?? '', doTinCay: Number(lai.confidence) || 0, ngonNgu: 'vie+eng', thuTiengAnh: true };
    }
  }
  return kq;
}
