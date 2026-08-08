/**
 * KIỂM DUYỆT ẢNH NHẠY CẢM — CHẠY NGAY TRÊN TRÌNH DUYỆT
 * ============================================================================
 *
 * NGUYÊN TẮC: ẢNH KHÔNG RỜI KHỎI MÁY NGƯỜI GỬI ĐỂ ĐI KIỂM DUYỆT.
 * Ảnh bà con gửi kèm là dữ liệu nhạy cảm nhất của cả hệ thống — có thể chứa
 * mặt người, biển số xe, địa chỉ nhà, hiện trường vụ việc. Gửi sang dịch vụ
 * ngoài để "nhờ AI xem hộ" là rủi ro lớn hơn nhiều so với lợi ích lọc được
 * vài ảnh xấu. Vì vậy toàn bộ phân tích dưới đây chạy cục bộ.
 *
 * BA MỨC KẾT LUẬN:
 *   an toàn   — cho gửi bình thường
 *   chờ duyệt — vẫn cho gửi nhưng cán bộ xem trước khi hiển thị
 *   chặn      — không nhận
 *
 * VÌ SAO CÓ MỨC CHỜ DUYỆT:
 * Không thuật toán cục bộ nào phán đoán đúng nội dung ảnh 100%. Chặn nhầm ảnh
 * bằng chứng của người tố giác còn tai hại hơn cho lọt một ảnh xấu — vì mất
 * luôn nguồn tin, mà người ta thường không gửi lại lần hai. Nên máy chỉ CHẶN
 * khi rất chắc chắn, còn nghi ngờ thì chuyển cán bộ quyết định.
 *
 * ⚠️ GIỚI HẠN CẦN NÓI RÕ:
 * Bộ lọc này nhận diện được ảnh khoả thân / phơi bày da thịt ở mức thô.
 * Nó KHÔNG nhận diện được nội dung mang tính chính trị, cờ hiệu, biểu ngữ hay
 * hình ảnh phản động — việc đó cần đọc hiểu chữ và bối cảnh trong ảnh, vượt xa
 * khả năng một thuật toán chạy trong trình duyệt. Cố làm bằng cách đoán theo
 * màu sắc sẽ chặn nhầm rất nhiều ảnh vô hại (ảnh cờ Tổ quốc, ảnh hội nghị có
 * phông đỏ, ảnh lễ hội...). Loại nội dung đó thuộc phần việc của CÁN BỘ tại
 * hàng chờ duyệt, cộng với bộ lọc từ ngữ trên phần nội dung văn bản đi kèm.
 */

export interface ImageModerationResult {
  /** true = không nhận ảnh này */
  blocked: boolean;
  /** true = vẫn nhận nhưng cần cán bộ xem trước khi hiển thị */
  needsReview?: boolean;
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

/** Số đo rút ra từ một tấm ảnh */
interface SoDoAnh {
  /** Tỷ lệ điểm ảnh màu da trên toàn ảnh (0–1) */
  tyLeDa: number;
  /** Tỷ lệ của MẢNG DA LIỀN LỚN NHẤT trên toàn ảnh (0–1) */
  mangDaLonNhat: number;
  /** Mật độ đường viền — ảnh chụp giấy tờ, biểu ngữ, màn hình thì cao */
  matDoVien: number;
  /** Ảnh gần như một màu (chụp lỗi, chụp trần nhà) */
  quaDonSac: boolean;
}

const KICH_THUOC = 64; // phân tích trên ảnh thu nhỏ 64x64 cho nhanh

/**
 * Một điểm ảnh có phải màu da người không.
 *
 * Dùng ĐỒNG THỜI hai quy tắc rồi lấy hợp:
 *
 *   1. Quy tắc RGB (Kovac) — nhanh, nhưng vốn được hiệu chỉnh trên người da sáng.
 *   2. Quy tắc YCbCr — tách riêng độ sáng khỏi sắc độ, nên nhận đúng cả da
 *      ngăm lẫn da tối, và ít bị ảnh hưởng bởi ánh sáng đèn vàng.
 *
 * Bản trước CHỈ dùng quy tắc RGB. Hệ quả thực tế: ảnh người da ngăm — phần lớn
 * bà con lao động vùng sông nước — bị tính là "không phải da" nên ảnh nhạy cảm
 * lọt qua; ngược lại ảnh chân dung người da sáng lại hay bị chặn oan.
 */
function laMauDa(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const theoRGB =
    r > 95 && g > 40 && b > 20 &&
    max - min > 15 &&
    Math.abs(r - g) > 15 &&
    r > g && r > b;

  // Chuyển sang YCbCr — công thức chuẩn ITU-R BT.601
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;

  const theoYCbCr =
    y > 40 &&                       // bỏ vùng quá tối, dễ nhầm
    cb >= 77 && cb <= 127 &&        // ngưỡng chuẩn trong tài liệu xử lý ảnh
    cr >= 133 && cr <= 173;

  return theoRGB || theoYCbCr;
}

/* ⚠️ GIỚI HẠN CỦA MỌI QUY TẮC DỰA TRÊN MÀU:
   Gỗ nâu, tường sơn vàng, cát, da rám nắng của đồ vật... nằm ĐÚNG cùng dải
   màu với da người. Không một quy tắc xét từng điểm ảnh nào tách được chúng.
   Đã thử thu hẹp ngưỡng: tỷ lệ nhận nhầm không giảm, chỉ làm bỏ sót da tối.

   Vì vậy quyết định cuối KHÔNG dựa vào tỷ lệ da, mà kết hợp ba dấu hiệu:
     · mảng da LIỀN lớn nhất  — ảnh khoả thân da trải rộng, ảnh chân dung thì gọn
     · mật độ đường viền      — ảnh chụp gỗ, giấy tờ, biểu ngữ nhiều nét; da mịn
     · độ đơn sắc             — ảnh chụp tường, chụp trần loại ra ngay
   Một dấu hiệu đơn lẻ không đủ để chặn. */

/** Rút các số đo từ ảnh */
function doAnh(img: HTMLImageElement): SoDoAnh | null {
  const canvas = document.createElement('canvas');
  canvas.width = KICH_THUOC;
  canvas.height = KICH_THUOC;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, KICH_THUOC, KICH_THUOC);
  const { data } = ctx.getImageData(0, 0, KICH_THUOC, KICH_THUOC);

  const tong = KICH_THUOC * KICH_THUOC;
  const laDa = new Uint8Array(tong);
  const xam = new Float32Array(tong);
  let soDa = 0;

  for (let i = 0; i < tong; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    xam[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    if (laMauDa(r, g, b)) {
      laDa[i] = 1;
      soDa += 1;
    }
  }

  /* --- Mảng da liền lớn nhất -------------------------------------------
     Vì sao cần: ảnh chân dung cận mặt cũng có tỷ lệ da rất cao, nhưng đó là
     MỘT vùng gọn giữa khung. Ảnh khoả thân thì da trải rộng khắp khung hình.
     Chỉ nhìn tỷ lệ tổng thì không phân biệt được hai loại này.
     Dùng thuật toán loang (flood fill) theo 4 hướng. */
  const daXet = new Uint8Array(tong);
  let lonNhat = 0;
  const ngan: number[] = [];
  for (let i = 0; i < tong; i += 1) {
    if (!laDa[i] || daXet[i]) continue;
    let dem = 0;
    ngan.length = 0;
    ngan.push(i);
    daXet[i] = 1;
    while (ngan.length) {
      const cur = ngan.pop() as number;
      dem += 1;
      const x = cur % KICH_THUOC;
      const y = (cur / KICH_THUOC) | 0;
      if (x > 0) { const n = cur - 1; if (laDa[n] && !daXet[n]) { daXet[n] = 1; ngan.push(n); } }
      if (x < KICH_THUOC - 1) { const n = cur + 1; if (laDa[n] && !daXet[n]) { daXet[n] = 1; ngan.push(n); } }
      if (y > 0) { const n = cur - KICH_THUOC; if (laDa[n] && !daXet[n]) { daXet[n] = 1; ngan.push(n); } }
      if (y < KICH_THUOC - 1) { const n = cur + KICH_THUOC; if (laDa[n] && !daXet[n]) { daXet[n] = 1; ngan.push(n); } }
    }
    if (dem > lonNhat) lonNhat = dem;
  }

  /* --- Mật độ đường viền ------------------------------------------------
     Ảnh chụp giấy tờ, biểu ngữ, ảnh chụp màn hình có RẤT NHIỀU đường viền
     (nét chữ). Da người thì mịn, ít viền. Dùng để giảm chặn oan. */
  let vien = 0;
  let demSoSanh = 0;
  for (let y = 1; y < KICH_THUOC - 1; y += 1) {
    for (let x = 1; x < KICH_THUOC - 1; x += 1) {
      const i = y * KICH_THUOC + x;
      const gx = Math.abs(xam[i + 1] - xam[i - 1]);
      const gy = Math.abs(xam[i + KICH_THUOC] - xam[i - KICH_THUOC]);
      if (gx + gy > 60) vien += 1;
      demSoSanh += 1;
    }
  }

  /* --- Ảnh gần như một màu --------------------------------------------- */
  let tongXam = 0;
  for (let i = 0; i < tong; i += 1) tongXam += xam[i];
  const tb = tongXam / tong;
  let phuongSai = 0;
  for (let i = 0; i < tong; i += 1) phuongSai += (xam[i] - tb) ** 2;
  phuongSai /= tong;

  return {
    tyLeDa: soDa / tong,
    mangDaLonNhat: lonNhat / tong,
    matDoVien: vien / demSoSanh,
    quaDonSac: phuongSai < 40,
  };
}

/**
 * Kiểm tra một ảnh (data URL) có nhạy cảm không.
 *
 * NGƯỠNG QUYẾT ĐỊNH — chọn theo hướng "thà để cán bộ xem còn hơn chặn oan":
 *
 *   Mảng da liền > 55% khung hình  VÀ  ít đường viền   -> CHẶN
 *       Da trải kín khung, bề mặt mịn. Rất khó là thứ gì khác.
 *
 *   Tỷ lệ da > 45%                                     -> CHỜ CÁN BỘ DUYỆT
 *       Có thể là ảnh chân dung cận, ảnh bàn tay, ảnh vết thương — loại ảnh
 *       bằng chứng hành hung rất hay gặp. Không chặn, chuyển cán bộ xem.
 */
export async function checkImageSensitive(
  dataUrl: string,
  /** Giữ tham số cho nơi gọi cũ; không còn dùng vì mọi ảnh đều chỉ kiểm cục bộ */
  _content = ''
): Promise<ImageModerationResult> {
  let sd: SoDoAnh | null = null;
  try {
    sd = doAnh(await loadImage(dataUrl));
  } catch {
    // Không đọc được ảnh: để lá chắn chữ ký nhị phân ở bước trước xử lý
    return { blocked: false };
  }
  if (!sd) return { blocked: false };

  // Ảnh gần như một màu -> không đủ căn cứ kết luận, cho qua
  if (sd.quaDonSac) return { blocked: false };

  const daNhieu = sd.mangDaLonNhat > 0.55;
  const beMatMin = sd.matDoVien < 0.12;

  if (daNhieu && beMatMin) {
    return {
      blocked: true,
      reason: 'Ảnh có vùng da người chiếm phần lớn khung hình — nghi nội dung khoả thân',
    };
  }

  if (sd.tyLeDa > 0.45) {
    return {
      blocked: false,
      needsReview: true,
      reason: 'Ảnh sẽ được cán bộ xem trước khi hiển thị',
    };
  }

  return { blocked: false };
}
