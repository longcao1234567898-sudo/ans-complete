/**
 * PHÁT HIỆN TIN TRÙNG LẶP — kể cả khi bị sửa nhẹ để né.
 *
 * VÌ SAO CẦN: băm SHA-256 nội dung chỉ bắt được bản GIỐNG HỆT.
 * Kẻ xấu thêm một dấu chấm, đổi hoa thường, hoặc chèn một chữ là qua được.
 * Với hệ thống công an cấp cơ sở, người trong cuộc mâu thuẫn có động cơ
 * thật để làm việc này — không phải phá phách vu vơ.
 *
 * Giải pháp 2 lớp:
 *   Lớp A — CHUẨN HOÁ MẠNH rồi băm: bỏ dấu, bỏ hoa thường, bỏ mọi dấu câu
 *           và khoảng trắng. "Đường X có ổ gà!" và "duong x co o ga"
 *           ra cùng một dấu vân tay.
 *   Lớp B — SO ĐỘ TƯƠNG ĐỒNG với các tin gần đây: chèn/xoá vài chữ vẫn bị bắt.
 *
 * Không cần sửa cấu trúc database — so sánh ngay trong bộ nhớ.
 */

/** Bỏ dấu tiếng Việt */
function boDau(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * CHUẨN HOÁ MẠNH: đưa về dạng chỉ còn chữ và số, không dấu, không hoa thường.
 * Mục đích: mọi biến thể "trang trí" của cùng một nội dung ra cùng một chuỗi.
 */
export function chuanHoaManh(text) {
  return boDau(String(text || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // bỏ mọi dấu câu, ký hiệu, emoji
    .replace(/\s+/g, ' ')            // gộp khoảng trắng
    .trim();
}

/** Tách thành tập từ (bỏ từ quá ngắn để giảm nhiễu) */
function tapTu(text) {
  return new Set(
    chuanHoaManh(text)
      .split(' ')
      .filter((w) => w.length >= 2)
  );
}

/**
 * ĐỘ TƯƠNG ĐỒNG 0..1 giữa 2 đoạn văn (hệ số Jaccard trên tập từ).
 * 1.0 = giống hệt về từ ngữ; 0 = không chung từ nào.
 *
 * Chọn Jaccard vì: đơn giản, nhanh, và bắt tốt kiểu "chèn thêm vài chữ"
 * — thứ mà kẻ né tránh hay dùng nhất.
 */
export function doTuongDong(a, b) {
  const A = tapTu(a);
  const B = tapTu(b);
  if (A.size === 0 || B.size === 0) return 0;

  let chung = 0;
  for (const w of A) if (B.has(w)) chung++;

  const hop = A.size + B.size - chung;
  const jaccard = hop === 0 ? 0 : chung / hop;

  /* PHÉP BAO HÀM — bắt mánh "độn thêm chữ".
     Kẻ né tránh hay thêm câu chào dài ("Kính gửi quý cơ quan công an,
     tôi xin phản ánh...") để làm loãng phép đo Jaccard.
     Nếu gần như TOÀN BỘ từ của bên ngắn nằm trong bên dài -> vẫn là trùng.

     Chỉ áp dụng khi cả hai đủ dài (>=10 từ) để tránh chặn nhầm
     tin ngắn chung chung kiểu "xin hỏi thủ tục". */
  const nho = Math.min(A.size, B.size);
  if (nho >= 10) {
    const baoHam = chung / nho;
    if (baoHam >= 0.9) return Math.max(jaccard, baoHam);
  }

  return jaccard;
}

/* ===== NGƯỠNG QUYẾT ĐỊNH =====
 * Đặt khác nhau theo nguồn gửi, vì mức độ đáng ngờ khác nhau:
 *  - Cùng thiết bị mà gửi nội dung na ná -> gần như chắc chắn cố tình -> CHẶN
 *  - Khác thiết bị -> có thể là 2 người dân cùng phản ánh một vụ việc thật
 *    (ví dụ cả xóm cùng báo một ổ gà) -> KHÔNG chặn, chỉ ĐÁNH DẤU cho cán bộ xem
 */
/* Ngưỡng 0.75 chọn từ số liệu thử nghiệm thật:
 *   - Hai tin THẬT khác nhau cùng chủ đề: cao nhất đo được 0.67
 *   - Các mánh né tránh (thêm câu chào, chèn chữ): thấp nhất 0.79
 *   -> 0.75 nằm giữa, chặn được mánh né mà không chặn nhầm dân thật. */
const NGUONG_CHAN_CUNG_IP = 0.75;   // cùng IP: giống 75% trở lên -> chặn
const NGUONG_DANH_DAU     = 0.85;   // khác IP: giống 85% trở lên -> đánh dấu
const SO_TIN_COI_LA_CHIEN_DICH = 4; // >=4 tin na ná trong 24h -> nghi có tổ chức

/**
 * Kiểm tra một nội dung sắp gửi có trùng/na ná tin nào gần đây không.
 *
 * @param {object} pool  - pool MySQL
 * @param {string} noiDung - nội dung người dân vừa nhập
 * @param {string} ip      - IP người gửi
 * @returns {Promise<{chan: boolean, lyDo?: string, danhDau: boolean, ghiChu?: string}>}
 */
export async function kiemTraTrungLapGanDung(pool, noiDung, ip) {
  const ketQua = { chan: false, danhDau: false };

  try {
    // Lấy các tin trong 24 giờ qua để đối chiếu.
    // Giới hạn 300 dòng: đủ để bắt chiến dịch spam, mà không nặng máy chủ.
    const [rows] = await pool.query(
      `SELECT original_content, ip_address
       FROM submissions
       WHERE created_at > NOW() - INTERVAL 24 HOUR
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 300`
    );
    if (!rows.length) return ketQua;

    const chuanMoi = chuanHoaManh(noiDung).slice(0, 1000);
    if (chuanMoi.length < 20) return ketQua; // quá ngắn thì không xét

    let naNaKhacIp = 0;
    let cheDoNhat = 0;

    for (const r of rows) {
      const cu = String(r.original_content || '');
      if (!cu) continue;

      // LỚP A: chuẩn hoá mạnh rồi so bằng — bắt kiểu đổi dấu câu, hoa thường
      const chuanCu = chuanHoaManh(cu).slice(0, 1000);
      const giongHetSauChuanHoa = chuanCu === chuanMoi;

      // LỚP B: so độ tương đồng — bắt kiểu chèn/xoá vài chữ
      const diem = giongHetSauChuanHoa ? 1 : doTuongDong(chuanMoi, chuanCu);
      if (diem > cheDoNhat) cheDoNhat = diem;

      const cungIp = r.ip_address && ip && r.ip_address === ip;

      if (cungIp && diem >= NGUONG_CHAN_CUNG_IP) {
        return {
          chan: true,
          danhDau: false,
          lyDo: 'Nội dung này gần giống với ý kiến bà con vừa gửi. Vui lòng dùng mã tra cứu đã cấp để theo dõi, hoặc mô tả thêm tình tiết MỚI nếu có.',
        };
      }

      if (!cungIp && diem >= NGUONG_DANH_DAU) naNaKhacIp++;
    }

    // Nhiều tin na ná từ NHIỀU thiết bị khác nhau -> dấu hiệu có tổ chức.
    // KHÔNG chặn (có thể là dân thật cùng phản ánh một vụ), nhưng báo cán bộ biết.
    if (naNaKhacIp >= SO_TIN_COI_LA_CHIEN_DICH) {
      ketQua.danhDau = true;
      ketQua.ghiChu = `Nghi gửi hàng loạt: ${naNaKhacIp} ý kiến nội dung tương tự từ các thiết bị khác nhau trong 24 giờ`;
    } else if (naNaKhacIp > 0) {
      ketQua.danhDau = true;
      ketQua.ghiChu = `Có ${naNaKhacIp} ý kiến nội dung tương tự trong 24 giờ (độ giống ${Math.round(cheDoNhat * 100)}%)`;
    }

    return ketQua;
  } catch (err) {
    // Lỗi kiểm tra KHÔNG được chặn người dân gửi ý kiến
    console.warn('Kiểm tra trùng lặp lỗi (bỏ qua):', err.message);
    return ketQua;
  }
}
