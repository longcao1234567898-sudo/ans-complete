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
 *   3. Soi nội dung PDF tìm dấu hiệu tự chạy — /JavaScript, /Launch,
 *      /EmbeddedFile…, và /OpenAction không phải chỉ dẫn mở trang. Soi theo
 *      TÊN PDF đầy đủ, kể cả trong luồng đối tượng nén (BUG-034).
 *   4. Giới hạn kích thước — chặn tệp phình to làm nghẽn máy chủ.
 *
 * ⚠️ KHÔNG BAO GIỜ mở tài liệu trực tiếp trên trình duyệt cán bộ. Giao diện
 *    chỉ cho TẢI VỀ, và cán bộ mở bằng phần mềm của máy — nơi có phần mềm
 *    diệt virus canh. Mở thẳng trên trình duyệt là đưa mã độc vào đúng phiên
 *    đăng nhập có quyền xem danh tính người tố giác.
 */

import { inflateSync } from 'node:zlib';
import { docCfb } from './trich-chu/doc.js';

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

const LY_DO_PDF_NGUY = 'Tệp PDF này có phần tự chạy nên không an toàn để nhận. '
  + 'Bà con thử in ra rồi chụp lại, hoặc lưu thành PDF mới bằng máy in ảo.';
const LY_DO_PDF_KHONG_KIEM_DUOC = 'Máy không soi được bên trong tệp PDF này (nén hoặc mã hoá theo cách lạ) '
  + 'nên chưa nhận. Bà con thử in ra rồi chụp lại, hoặc lưu thành PDF mới bằng máy in ảo.';

/* SOI PDF THEO TÊN, KHÔNG THEO CHUỖI CON (BUG-034).

   Bản cũ tìm chuỗi con "/AA", "/OpenAction"… trên byte thô. Hai cái sai cùng gốc:
     · chặn nhầm — "/AA" khớp tên phông nhúng "/AAAAAA+Times" mà Chrome, LibreOffice
       đặt cho MỌI PDF có chữ; "/OpenAction [1 0 R /XYZ …]" chỉ là "mở ở trang 1".
       Gần như mọi đơn người dân lưu PDF bị bỏ;
     · lọt — tên viết bằng mã #xx (/J#61vaScript là /JavaScript) và khoá nằm trong
       luồng đối tượng nén (/ObjStm, PDF 1.5+) không hiện ra ở byte thô.
   Nay: tách từng TÊN PDF (dấu / tới ký tự phân cách), giải mã #xx, so trùng cả tên;
   giải nén luồng đối tượng để soi cả bên trong. Không giải được thì chặn (luật 1). */

/** Khoá/hành động tự chạy hoặc mở thứ bên ngoài. Có mặt ở bất kỳ từ điển nào là chặn */
const TEN_NGUY = new Set([
  'JavaScript', 'JS', 'Launch', 'AA', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia',
  'SubmitForm', 'ImportData', 'GoToR', 'GoToE', 'XFA',
]);
/* Trong byte của luồng (ảnh, phông, nội dung trang) chỉ tìm tên dài: tên ngắn như /JS,
   /AA gặp ngẫu nhiên trong dữ liệu nhị phân của ảnh scan vài MB. Đủ an toàn vì hành
   động tự chạy nào cũng phải có tên dài (/S /JavaScript, /S /Launch…); /OpenAction
   không bao giờ có trong luồng thật — thấy là có người cố giấu. */
const TEN_NGUY_TRONG_LUONG = new Set([
  'JavaScript', 'Launch', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia', 'SubmitForm',
  'ImportData', 'OpenAction',
]);
/* /OpenAction chỉ được là "mở ở trang nào, cỡ nào" — allow-list tên được phép bên trong */
const TEN_DICH = new Set(['XYZ', 'Fit', 'FitH', 'FitV', 'FitR', 'FitB', 'FitBH', 'FitBV']);
const TEN_GOTO = new Set([...TEN_DICH, 'Type', 'Action', 'S', 'GoTo', 'D']);
const BO_LOC = new Set(['FlateDecode', 'Fl', 'ASCIIHexDecode', 'AHx', 'ASCII85Decode', 'A85', 'LZWDecode', 'LZW',
  'RunLengthDecode', 'RL', 'CCITTFaxDecode', 'CCF', 'JBIG2Decode', 'DCTDecode', 'DCT', 'JPXDecode', 'Crypt']);
/** Tổng dung lượng giải nén luồng đối tượng cho một tệp — chống bom nén */
const TRAN_GIAI_NEN = 50 * 1024 * 1024;

/* Ký tự phân cách và khoảng trắng của PDF (ISO 32000-1 §7.2.2) — tên kết thúc ở đây */
const TEN_PDF = /\/([^\0\t\n\f\r ()<>[\]{}/%]*)/g;
const giaiTen = (t) => t.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

/** Mọi tên PDF trong `chu`: [{ ten (đã giải #xx), cuoi (vị trí sau tên) }] */
function cacTen(chu) {
  const ra = [];
  TEN_PDF.lastIndex = 0;
  for (let m = TEN_PDF.exec(chu); m; m = TEN_PDF.exec(chu)) ra.push({ ten: giaiTen(m[1]), cuoi: m.index + m[0].length });
  return ra;
}

/** Cắt phần ngoặc cân bằng mở bằng `mo` ở đầu `chu` ('<<'/'>>' hoặc '['/']'); null nếu không đóng */
function catNgoac(chu, mo, dong) {
  let sau = 0;
  for (let i = 0; i < chu.length; i += 1) {
    if (chu.startsWith(mo, i)) { sau += 1; i += mo.length - 1; } else if (chu.startsWith(dong, i)) {
      sau -= 1; i += dong.length - 1;
      if (sau === 0) return chu.slice(0, i + 1);
    }
  }
  return null;
}

/**
 * Giá trị của /OpenAction có phải chỉ dẫn mở trang không. `cacDinhNghia(so)` trả mọi
 * lần định nghĩa đối tượng `so` (một số có thể bị định nghĩa nhiều lần qua các bản sửa
 * nối tiếp — trình đọc dùng bản nào tuỳ bảng xref, nên lần nào cũng phải an toàn).
 */
function openActionAnToan(giaTri, cacDinhNghia, choPhepThamChieu = true) {
  const v = giaTri.replace(/^[\0\t\n\f\r ]+/, '');
  if (v.startsWith('[')) {
    const mang = catNgoac(v, '[', ']');
    return mang !== null && cacTen(mang).every((t) => TEN_DICH.has(t.ten));
  }
  if (v.startsWith('<<')) {
    const dict = catNgoac(v, '<<', '>>');
    if (dict === null) return false;
    const ten = cacTen(dict);
    return ten.every((t) => TEN_GOTO.has(t.ten)) && ten.some((t, i) => t.ten === 'S' && ten[i + 1]?.ten === 'GoTo');
  }
  const ref = /^(\d+)[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+R/.exec(v);
  if (!ref || !choPhepThamChieu) return false;
  const dn = cacDinhNghia(Number(ref[1]));
  return dn.length > 0 && dn.every((than) => openActionAnToan(than, cacDinhNghia, false));
}

/**
 * Soi một PDF. @returns {null | string} null = không thấy gì nguy hiểm; chuỗi = lý do chặn.
 */
function soiPdf(buf) {
  const chu = buf.toString('latin1');

  /* Tách byte của các luồng ra khỏi phần từ điển. Từ khoá "stream" mở luồng đứng sau
     ">>" của từ điển luồng; "endstream" đóng. */
  const ngoai = [];
  const luong = [];
  const moLuong = /(?<!end)stream(?:\r\n|\n|\r)/g;
  let viTri = 0;
  for (let m = moLuong.exec(chu); m; m = moLuong.exec(chu)) {
    const batDau = m.index + m[0].length;
    let ket = chu.indexOf('endstream', batDau);
    if (ket < 0) ket = chu.length;
    const dauDict = chu.lastIndexOf('obj', m.index);
    luong.push({ dict: chu.slice(Math.max(dauDict, viTri), m.index), than: chu.slice(batDau, ket) });
    ngoai.push(chu.slice(viTri, m.index));
    viTri = ket + 'endstream'.length;
    moLuong.lastIndex = viTri;
  }
  ngoai.push(chu.slice(viTri));
  const chuNgoai = ngoai.join('\n');

  /* Đối tượng cấp đầu: "n g obj … endobj" (luồng đã tách nên không bắt nhầm bên trong) */
  const dinhNghia = new Map();
  const them = (so, than) => dinhNghia.set(so, [...(dinhNghia.get(so) ?? []), than]);
  for (const m of chuNgoai.matchAll(/(\d+)[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+obj\b([\s\S]*?)(?=endobj|\d+[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+obj\b|$)/g)) {
    them(Number(m[1]), m[2]);
  }

  /* Luồng đối tượng nén: giải nén để soi như từ điển thường */
  const tenNgoai = cacTen(chuNgoai);
  const maHoa = tenNgoai.some((t) => t.ten === 'Encrypt');
  const cacChuTuDien = [chuNgoai];
  let conLai = TRAN_GIAI_NEN;
  for (const l of luong) {
    const tenDict = cacTen(l.dict).map((t) => t.ten);
    if (!tenDict.includes('ObjStm')) {
      if (cacTen(l.than).some((t) => TEN_NGUY_TRONG_LUONG.has(t.ten))) return LY_DO_PDF_NGUY;
      continue;
    }
    /* Tệp mã hoá thì nội dung luồng là bản mã — không soi được bên trong */
    if (maHoa) return LY_DO_PDF_KHONG_KIEM_DUOC;
    const loc = tenDict.filter((t) => BO_LOC.has(t));
    if (loc.some((t) => t !== 'FlateDecode' && t !== 'Fl') || tenDict.includes('Predictor')) return LY_DO_PDF_KHONG_KIEM_DUOC;
    let duLieu = Buffer.from(l.than, 'latin1');
    if (loc.length > 0) {
      try {
        duLieu = inflateSync(duLieu, { maxOutputLength: conLai });
      } catch {
        return LY_DO_PDF_KHONG_KIEM_DUOC;
      }
    }
    conLai -= duLieu.length;
    if (conLai <= 0) return LY_DO_PDF_KHONG_KIEM_DUOC;
    const giai = duLieu.toString('latin1');
    cacChuTuDien.push(giai);
    /* Đầu luồng: các cặp "số-đối-tượng vị-trí"; nội dung bắt đầu ở /First */
    const first = /\/First[\0\t\n\f\r ]+(\d+)/.exec(l.dict);
    if (!first) return LY_DO_PDF_KHONG_KIEM_DUOC;
    const so = giai.slice(0, Number(first[1])).trim().split(/[\0\t\n\f\r ]+/).filter(Boolean).map(Number);
    if (so.length % 2 !== 0 || so.some((x) => !Number.isInteger(x))) return LY_DO_PDF_KHONG_KIEM_DUOC;
    for (let i = 0; i < so.length; i += 2) {
      const tu = Number(first[1]) + so[i + 1];
      const den = i + 3 < so.length ? Number(first[1]) + so[i + 3] : giai.length;
      them(so[i], giai.slice(tu, den));
    }
  }

  const cacDinhNghia = (so) => dinhNghia.get(so) ?? [];
  for (const chuTD of cacChuTuDien) {
    for (const t of cacTen(chuTD)) {
      if (TEN_NGUY.has(t.ten)) return LY_DO_PDF_NGUY;
      if (t.ten === 'OpenAction' && !openActionAnToan(chuTD.slice(t.cuoi), cacDinhNghia)) return LY_DO_PDF_NGUY;
    }
  }
  return null;
}

/* Tên mục trong tệp Word 97–2003 (CFB) chứa macro VBA: Word cất ở kho "Macros",
   bên trong có "VBA", "_VBA_PROJECT". So không phân biệt hoa thường. */
const MUC_MACRO_DOC = new Set(['macros', 'vba', '_vba_project', '_vba_project_cur']);

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
  const LY_DO_MACRO = 'Tệp Word này có chứa macro nên không được nhận. Bà con lưu lại dạng PDF rồi gửi.';
  if (loai.ten === 'Word (docx)') {
    const toanBo = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (toanBo.includes(Buffer.from('vbaProject.bin'))) return { hopLe: false, lyDo: LY_DO_MACRO };
  }
  /* Word 97–2003 (.doc) không có vbaProject.bin — macro nằm trong kho "Macros" của tệp
     CFB. Đọc thư mục của tệp; đọc không được thì chặn (luật 1) — BUG-034 (f). */
  if (loai.ten === 'Word (doc)') {
    let cacMuc;
    try {
      cacMuc = docCfb(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')).cacMuc;
    } catch {
      return { hopLe: false, lyDo: 'Tệp Word (.doc) này hỏng hoặc không đúng định dạng nên chưa nhận. Bà con lưu lại dạng .docx hoặc PDF rồi gửi.' };
    }
    if (cacMuc.some((m) => MUC_MACRO_DOC.has(m.ten.toLowerCase()))) return { hopLe: false, lyDo: LY_DO_MACRO };
  }

  /* LỚP 3 — soi PDF tìm phần tự chạy (BUG-034: theo tên, kể cả trong luồng nén). */
  if (loai.ten === 'PDF') {
    const lyDo = soiPdf(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    if (lyDo) return { hopLe: false, lyDo };
  }

  return { hopLe: true, loai: loai.ten, mime: loai.mime };
}

/** Lọc danh sách tài liệu, trả về phần hợp lệ và lý do cho phần bị chặn. */
export function locDanhSachTaiLieu(ds) {
  const hopLe = [];
  const biChan = [];
  for (const t of (Array.isArray(ds) ? ds.slice(0, MAX_SO_TAI_LIEU) : [])) {
    const dataUrl = typeof t === 'string' ? t : t?.data;
    /* Tên chỉ nhận chuỗi: đối tượng dựng tay ({"toString":1}) làm String() ném lỗi */
    const ten = typeof t === 'object' && typeof t?.ten === 'string' ? t.ten : '';
    const kq = kiemTaiLieu(dataUrl, ten);
    if (kq.hopLe) hopLe.push({ data: dataUrl, ten: String(ten || 'tai-lieu').slice(0, 150), mime: kq.mime });
    else biChan.push({ ten: String(ten || '').slice(0, 150), lyDo: kq.lyDo });
  }
  return { hopLe, biChan };
}
