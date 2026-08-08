/**
 * KIỂM TRA AN TOÀN ẢNH ĐÍNH KÈM — PHÍA MÁY CHỦ
 * ============================================================================
 *
 * VÌ SAO PHẢI CÓ FILE NÀY:
 * Trước đây toàn bộ việc kiểm tra ảnh nằm ở TRÌNH DUYỆT. Nghe thì đủ, nhưng
 * trình duyệt là máy của người gửi — họ toàn quyền bỏ qua. Chỉ cần gọi thẳng
 * địa chỉ API bằng một công cụ dòng lệnh là mọi lá chắn phía trình duyệt trở
 * nên vô nghĩa, và máy chủ vẫn ghi nhận ảnh đó với trạng thái "an toàn".
 *
 * Nguyên tắc: KIỂM TRA Ở TRÌNH DUYỆT LÀ ĐỂ BÀ CON BIẾT SỚM MÀ SỬA.
 *             KIỂM TRA Ở MÁY CHỦ MỚI LÀ THỨ THẬT SỰ BẢO VỆ HỆ THỐNG.
 *
 * BA MỨC KẾT LUẬN:
 *   'safe'    — cho lưu bình thường
 *   'review'  — vẫn lưu nhưng ĐÁNH DẤU CHỜ CÁN BỘ XEM, không hiện ra ngoài
 *   'blocked' — không lưu ảnh này
 *
 * VÌ SAO CÓ MỨC 'review' THAY VÌ CHỈ CHẶN HOẶC CHO QUA:
 * Máy không thể phán đoán chắc chắn nội dung một tấm ảnh. Chặn nhầm ảnh bằng
 * chứng của người tố giác còn tai hại hơn cho lọt một ảnh xấu — vì mất luôn
 * nguồn tin. Nên chỉ chặn khi CHẮC CHẮN về mặt kỹ thuật (tệp giả mạo, có mã
 * thực thi). Còn nghi ngờ về NỘI DUNG thì chuyển cán bộ xem, máy không tự quyết.
 */

/* Giới hạn dung lượng một ảnh sau khi giải mã. Trình duyệt đã nén còn ~200KB,
   nên 8MB là rất rộng rãi — chỉ nhằm chặn kẻ cố tình nhồi tệp khổng lồ. */
const GIOI_HAN_BYTE = 8 * 1024 * 1024;

/* Số ảnh tối đa cho một ý kiến */
export const SO_ANH_TOI_DA = 3;

/* Định dạng chấp nhận. KHÔNG có SVG: định dạng đó là XML, chứa được thẻ
   <script> và chạy được mã khi mở trực tiếp. */
const DINH_DANG = [
  { ten: 'JPEG', mime: 'image/jpeg', khop: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ten: 'PNG', mime: 'image/png', khop: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  { ten: 'GIF', mime: 'image/gif', khop: (b) => chuoi(b, 0, 4) === 'GIF8' },
  { ten: 'WebP', mime: 'image/webp', khop: (b) => chuoi(b, 0, 4) === 'RIFF' && chuoi(b, 8, 12) === 'WEBP' },
  { ten: 'BMP', mime: 'image/bmp', khop: (b) => b[0] === 0x42 && b[1] === 0x4d },
];

function chuoi(buf, tu, den) {
  return Array.from(buf.slice(tu, den)).map((c) => String.fromCharCode(c)).join('');
}

/* Dấu vết mã thực thi có thể bị nhét vào phần chú thích của tệp ảnh.
   Tệp kiểu này gọi là "polyglot": vừa là ảnh hợp lệ, vừa là trang HTML.
   Trình duyệt có thể bị lừa chạy nó nếu máy chủ trả sai kiểu nội dung. */
const DAU_VET_MA = [
  '<script', '<?php', '<%', 'javascript:', 'onerror=', 'onload=',
  '<iframe', '<svg', '<!doctype html', '<html', 'eval(', 'document.cookie',
];

/**
 * Kiểm tra một ảnh gửi dưới dạng chuỗi data URL (base64).
 * @returns {{ trangThai: 'safe'|'review'|'blocked', lyDo: string, dinhDang?: string, soByte?: number }}
 */
export function kiemTraAnhBase64(chuoiAnh) {
  const s = String(chuoiAnh || '');

  /* 1) Phải đúng dạng data URL của ảnh ------------------------------------ */
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,(.*)$/s.exec(s);
  if (!m) {
    return { trangThai: 'blocked', lyDo: 'Không phải dữ liệu ảnh hợp lệ.' };
  }
  const mimeKhaiBao = m[1].toLowerCase();
  const phanBase64 = m[2];

  if (mimeKhaiBao === 'image/svg+xml' || mimeKhaiBao.includes('svg')) {
    return { trangThai: 'blocked', lyDo: 'Không nhận ảnh SVG — định dạng này chứa được mã thực thi.' };
  }
  if (!mimeKhaiBao.startsWith('image/')) {
    return { trangThai: 'blocked', lyDo: `Tệp khai báo kiểu "${mimeKhaiBao}", không phải ảnh.` };
  }

  /* 2) Giải mã và kiểm tra dung lượng ------------------------------------- */
  let buf;
  try {
    buf = Buffer.from(phanBase64, 'base64');
  } catch {
    return { trangThai: 'blocked', lyDo: 'Dữ liệu ảnh hỏng, không giải mã được.' };
  }
  if (buf.length === 0) {
    return { trangThai: 'blocked', lyDo: 'Tệp ảnh rỗng.' };
  }
  if (buf.length > GIOI_HAN_BYTE) {
    return {
      trangThai: 'blocked',
      lyDo: `Ảnh nặng ${(buf.length / 1024 / 1024).toFixed(1)}MB, vượt mức cho phép 8MB.`,
    };
  }

  /* 3) Chữ ký nhị phân — tệp có THẬT SỰ là ảnh không --------------------- */
  const dd = DINH_DANG.find((d) => d.khop(buf));
  if (!dd) {
    return {
      trangThai: 'blocked',
      lyDo: 'Nội dung tệp không khớp bất kỳ định dạng ảnh nào — nghi tệp giả mạo đuôi ảnh.',
    };
  }

  /* 4) Kiểu khai báo phải khớp nội dung thật ------------------------------
     Khai "image/jpeg" mà bên trong là PNG thì chưa chắc đã xấu, nhưng khai
     "image/png" mà bên trong là tệp thực thi thì rất đáng ngờ. Ở đây chữ ký
     đã hợp lệ nên chỉ ghi nhận, không chặn. */

  /* 5) Quét mã thực thi nhét trong tệp -----------------------------------
     Chỉ quét 64KB đầu và 8KB cuối: mã độc thường nằm ở phần chú thích đầu
     tệp hoặc nối thêm vào đuôi. Quét cả tệp sẽ chậm mà không thêm giá trị. */
  const dau = buf.subarray(0, 65536).toString('latin1').toLowerCase();
  const cuoi = buf.subarray(Math.max(0, buf.length - 8192)).toString('latin1').toLowerCase();
  const timThay = DAU_VET_MA.filter((d) => dau.includes(d) || cuoi.includes(d));
  if (timThay.length > 0) {
    return {
      trangThai: 'blocked',
      lyDo: `Trong tệp ảnh có dấu vết mã thực thi (${timThay[0]}) — nghi tệp bị cài mã độc.`,
      dinhDang: dd.ten,
    };
  }

  /* 6) Tệp nối thêm dữ liệu lạ ở đuôi (polyglot ZIP/RAR) ------------------ */
  const duoi = buf.subarray(Math.max(0, buf.length - 4096));
  if (duoi.includes(Buffer.from('PK\x03\x04', 'latin1')) ||
      duoi.includes(Buffer.from('Rar!', 'latin1')) ||
      duoi.includes(Buffer.from('7z\xBC\xAF', 'latin1'))) {
    return {
      trangThai: 'blocked',
      lyDo: 'Tệp ảnh có gói nén đính kèm ở phần đuôi — nghi tệp nguỵ trang.',
      dinhDang: dd.ten,
    };
  }

  return { trangThai: 'safe', lyDo: '', dinhDang: dd.ten, soByte: buf.length };
}

/**
 * Kiểm tra ảnh gửi dưới dạng LINK Cloudinary.
 *
 * Vì sao phải kiểm: nếu chấp nhận link bất kỳ, kẻ xấu gửi được link trỏ tới
 * ảnh khiêu dâm hoặc trang lừa đảo trên máy chủ của họ. Cán bộ mở màn hình
 * quản trị là ảnh đó hiện lên — mà hệ thống lại đang lưu nó như bằng chứng.
 * Ngoài ra link ngoài còn theo dõi được cán bộ nào đã mở, lúc nào.
 *
 * @param {{url:string, publicId?:string}} anh
 * @param {string} cloudName Tên kho ảnh của đơn vị (biến CLOUDINARY_CLOUD_NAME)
 */
export function kiemTraLinkCloudinary(anh, cloudName) {
  const url = String(anh?.url || '');

  let u;
  try {
    u = new URL(url);
  } catch {
    return { trangThai: 'blocked', lyDo: 'Đường dẫn ảnh không hợp lệ.' };
  }

  if (u.protocol !== 'https:') {
    return { trangThai: 'blocked', lyDo: 'Đường dẫn ảnh phải dùng HTTPS.' };
  }
  if (u.hostname !== 'res.cloudinary.com') {
    return {
      trangThai: 'blocked',
      lyDo: `Chỉ nhận ảnh lưu tại kho của đơn vị, không nhận link từ "${u.hostname}".`,
    };
  }

  /* Đường dẫn Cloudinary có dạng /<cloud_name>/image/upload/...
     Thiếu bước này thì kẻ xấu vẫn dùng được Cloudinary của họ. */
  if (cloudName && !u.pathname.startsWith(`/${cloudName}/`)) {
    return {
      trangThai: 'blocked',
      lyDo: 'Ảnh không thuộc kho ảnh của đơn vị.',
    };
  }

  /* Chặn đuôi tệp nguy hiểm ngay cả khi nằm trên miền hợp lệ */
  if (/\.(svgz?|html?|js|php|xml)(\?|$)/i.test(u.pathname)) {
    return { trangThai: 'blocked', lyDo: 'Định dạng tệp không được phép.' };
  }

  return { trangThai: 'safe', lyDo: '' };
}

/**
 * Kiểm tra cả danh sách ảnh của một ý kiến.
 *
 * @param {Array} danhSach   mảng ảnh (chuỗi base64 hoặc {url, publicId})
 * @param {object} tuyChon
 * @param {string} tuyChon.cloudName        tên kho ảnh của đơn vị
 * @param {boolean} tuyChon.canhBaoNoiDung  trình duyệt báo ảnh nghi nhạy cảm
 * @returns {{ hopLe: Array, biChan: Array, canDuyet: boolean }}
 */
export function locDanhSachAnh(danhSach, { cloudName = '', canhBaoNoiDung = false } = {}) {
  const hopLe = [];
  const biChan = [];
  let canDuyet = false;

  const ds = Array.isArray(danhSach) ? danhSach.slice(0, SO_ANH_TOI_DA) : [];

  for (let i = 0; i < ds.length; i += 1) {
    const anh = ds[i];
    const kq = (typeof anh === 'object' && anh?.url)
      ? kiemTraLinkCloudinary(anh, cloudName)
      : kiemTraAnhBase64(anh);

    if (kq.trangThai === 'blocked') {
      biChan.push({ viTri: i + 1, lyDo: kq.lyDo });
      continue;
    }

    /* Trình duyệt đã báo ảnh này nghi nhạy cảm -> vẫn lưu nhưng đánh dấu
       chờ duyệt, KHÔNG hiện ra ngoài cho tới khi cán bộ xem. */
    const trangThai = canhBaoNoiDung ? 'review' : 'safe';
    if (trangThai === 'review') canDuyet = true;

    hopLe.push({ anh, trangThai, dinhDang: kq.dinhDang || null });
  }

  return { hopLe, biChan, canDuyet };
}
