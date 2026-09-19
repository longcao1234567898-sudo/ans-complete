/**
 * KIỂM AN TOÀN TÀI LIỆU ĐÍNH KÈM (PDF, Word)
 * ============================================================================
 *
 * VÌ SAO CẦN TÀI LIỆU: người gửi khiếu nại, tố cáo hầu như luôn có giấy tờ —
 * đơn đã nộp, quyết định hành chính bị khiếu nại, biên bản, hợp đồng. Trước
 * đây họ phải chụp ảnh từng trang, vừa khó đọc vừa dễ sót trang.
 *
 * ⚠️ NHƯNG TÀI LIỆU NGUY HIỂM HƠN ẢNH NHIỀU.
 *
 * Ảnh chỉ là dữ liệu điểm màu — hệ thống vẽ lại qua canvas là sạch. Tài liệu
 * thì khác hẳn: PDF chạy được JavaScript, mở được trang web, nhúng được tệp
 * khác. Word chạy được macro VBA — đây là đường lây mã độc phổ biến nhất vào
 * máy cơ quan suốt hai chục năm qua.
 *
 * Nên tệp này kiểm BỐN LỚP, mỗi lớp chặn một kiểu tấn công khác nhau:
 *
 *   1. Chữ ký nhị phân — tệp phải ĐÚNG là loại nó khai. Đổi đuôi .exe thành
 *      .pdf là mẹo cũ nhất mà vẫn hiệu quả.
 *   2. Chặn Word có macro — .docm và mọi tệp Office chứa vbaProject.bin.
 *   3. Soi nội dung PDF tìm dấu hiệu tự chạy — /JavaScript, /OpenAction,
 *      /Launch, /EmbeddedFile.
 *   4. Giới hạn kích thước — chặn tệp phình to làm nghẽn máy chủ.
 *
 * ⚠️ KHÔNG BAO GIỜ mở tài liệu trực tiếp trên trình duyệt cán bộ. Giao diện
 *    chỉ cho TẢI VỀ, và cán bộ mở bằng phần mềm của máy — nơi có phần mềm
 *    diệt virus canh. Mở thẳng trên trình duyệt là đưa mã độc vào đúng phiên
 *    đăng nhập có quyền xem danh tính người tố giác.
 */

/** Định dạng cho phép. Mỗi mục có chữ ký nhị phân để kiểm tệp thật. */
const LOAI_CHO_PHEP = [
  {
    ten: 'PDF',
    mime: 'application/pdf',
    duoi: ['pdf'],
    /* %PDF- ở đầu tệp */
    khop: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
  {
    ten: 'Word (docx)',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    duoi: ['docx'],
    /* docx thực chất là tệp nén ZIP: PK\x03\x04 */
    khop: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06),
  },
  {
    ten: 'Word (doc)',
    mime: 'application/msword',
    duoi: ['doc'],
    /* Định dạng Office cũ: D0 CF 11 E0 A1 B1 1A E1 */
    khop: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  },
];

/** Giới hạn mỗi tài liệu. 10MB đủ cho đơn từ và quyết định hành chính. */
export const MAX_TAI_LIEU_MB = 10;

/** Số tài liệu tối đa mỗi ý kiến. */
export const MAX_SO_TAI_LIEU = 3;

/* Dấu hiệu PDF có phần tự chạy. Một PDF đơn từ bình thường KHÔNG có những
   thứ này — có nghĩa là ai đó cố tình nhét vào. */
const DAU_HIEU_PDF_NGUY = [
  '/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/EmbeddedFile', '/RichMedia',
];

/** Đọc phần đầu chuỗi base64 ra mảng byte để soi chữ ký. */
function docByteDau(dataUrl, soByte = 512) {
  const i = dataUrl.indexOf(',');
  if (i < 0) return null;
  try {
    const raw = Buffer.from(dataUrl.slice(i + 1, i + 1 + Math.ceil(soByte / 3) * 4), 'base64');
    return raw;
  } catch {
    return null;
  }
}

/**
 * Kiểm một tài liệu.
 *
 * @returns { hopLe, loai, lyDo } — hopLe false thì lyDo nói rõ vì sao, để
 *          giao diện báo cho bà con thay vì im lặng bỏ qua.
 */
export function kiemTaiLieu(dataUrl, tenTep = '') {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return { hopLe: false, lyDo: 'Tệp không hợp lệ.' };
  }

  /* LỚP 4 — kích thước. Kiểm trước vì rẻ nhất. */
  const uocTinhByte = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  if (uocTinhByte > MAX_TAI_LIEU_MB * 1024 * 1024) {
    const mb = (uocTinhByte / 1024 / 1024).toFixed(1);
    return { hopLe: false, lyDo: `Tài liệu ${mb}MB, vượt quá ${MAX_TAI_LIEU_MB}MB.` };
  }

  /* LỚP 2a — chặn theo ĐUÔI TỆP trước khi đọc nội dung.

     Đặt trước để lý do báo cho bà con được đúng: tệp .docm ngắn mà kiểm nội
     dung trước thì báo "không đọc được tệp", bà con tưởng tệp hỏng trong khi
     thật ra là định dạng không được nhận. */
  const ten = String(tenTep).toLowerCase();
  const DUOI_CAM = ['.docm', '.dotm', '.xlsm', '.xlsb', '.pptm'];
  if (DUOI_CAM.some((d) => ten.endsWith(d))) {
    return { hopLe: false, lyDo: 'Không nhận tệp Office có macro. Bà con lưu lại dạng .docx hoặc .pdf rồi gửi.' };
  }

  const b = docByteDau(dataUrl);
  if (!b || b.length < 8) return { hopLe: false, lyDo: 'Không đọc được tệp.' };

  /* LỚP 1 — chữ ký nhị phân. Tệp phải ĐÚNG là loại nó khai. */
  const loai = LOAI_CHO_PHEP.find((l) => l.khop(b));
  if (!loai) {
    return {
      hopLe: false,
      lyDo: 'Hệ thống chỉ nhận tệp PDF và Word. Tệp này không đúng định dạng đó.',
    };
  }

  /* LỚP 2 — chặn Word có macro.

     .docm là Word có macro, chặn theo tên. Nhưng kẻ gian đổi tên thành .docx
     được, nên soi thêm trong nội dung: tệp Office chứa vbaProject.bin là có
     macro, bất kể tên gì. */
  if (loai.ten === 'Word (docx)') {
    /* LỚP 2b — TỆP NÉN THƯỜNG ĐỔI TÊN VẪN LỌT NẾU CHỈ KIỂM CHỮ KÝ.

       docx thực chất là tệp nén ZIP, nên mọi tệp .zip đổi tên thành .docx đều
       khớp chữ ký. Kẻ gian có thể nén mã độc rồi đổi tên — cán bộ tải về giải
       nén là dính.

       Nên kiểm thêm cấu trúc: tệp Word THẬT bắt buộc chứa word/document.xml.
       Tệp nén thường không có phần đó. */
    const toanBo = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (!toanBo.includes(Buffer.from('word/document.xml'))) {
      return {
        hopLe: false,
        lyDo: 'Tệp này không phải tài liệu Word thật (có thể là tệp nén đổi tên). '
            + 'Bà con gửi lại bằng tệp Word hoặc PDF.',
      };
    }
  }
  if (loai.ten.startsWith('Word')) {
    const toanBo = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (toanBo.includes(Buffer.from('vbaProject.bin'))) {
      return { hopLe: false, lyDo: 'Tệp Word này có chứa macro nên không được nhận. Bà con lưu lại dạng PDF rồi gửi.' };
    }
  }

  /* LỚP 3 — soi PDF tìm phần tự chạy. */
  if (loai.ten === 'PDF') {
    const toanBo = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64').toString('latin1');
    const thay = DAU_HIEU_PDF_NGUY.find((d) => toanBo.includes(d));
    if (thay) {
      return {
        hopLe: false,
        lyDo: 'Tệp PDF này có phần tự chạy nên không an toàn để nhận. '
            + 'Bà con thử in ra rồi chụp lại, hoặc lưu thành PDF mới bằng máy in ảo.',
      };
    }
  }

  return { hopLe: true, loai: loai.ten, mime: loai.mime };
}

/** Lọc danh sách tài liệu, trả về phần hợp lệ và lý do cho phần bị chặn. */
export function locDanhSachTaiLieu(ds) {
  const hopLe = [];
  const biChan = [];
  for (const t of (Array.isArray(ds) ? ds.slice(0, MAX_SO_TAI_LIEU) : [])) {
    const dataUrl = typeof t === 'string' ? t : t?.data;
    const ten = typeof t === 'object' ? t?.ten : '';
    const kq = kiemTaiLieu(dataUrl, ten);
    if (kq.hopLe) hopLe.push({ data: dataUrl, ten: String(ten || 'tai-lieu').slice(0, 150), mime: kq.mime });
    else biChan.push({ ten: String(ten || '').slice(0, 150), lyDo: kq.lyDo });
  }
  return { hopLe, biChan };
}
