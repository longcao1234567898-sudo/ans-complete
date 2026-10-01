/**
 * NHẬN DIỆN TIN TỐ GIÁC MẬT (ADR-003 việc 12)
 * ============================================================================
 *
 * Tin tố cáo cán bộ, người làm việc trong cơ quan nhà nước, chính quyền phải
 * vào THẲNG phần chỉ lãnh đạo xem ngay lúc nhận — không qua hàng sàng lọc, vì
 * người sàng lọc có thể chính là người bị tố cáo. Cờ `to_giac_mat` đọc qua lớp
 * phạm vi một chỗ (lib/pham-vi-ho-so.js): cán bộ không thấy tin mang cờ.
 *
 * CÁCH NHẬN DIỆN — hai đường, khớp một là đủ:
 *   1. Một CHỨC DANH (công an, cán bộ, chủ tịch xã, địa chính...) và một HÀNH
 *      VI sai phạm (nhận tiền, vòi tiền, bảo kê, làm ngơ...) nằm CÙNG MỘT CÂU.
 *      Ghép đôi để không bắt nhầm câu thường như "tôi muốn báo công an".
 *   2. Một hành vi tự nó đã là sai phạm công vụ (tham nhũng, nhận hối lộ, chạy
 *      án, lạm quyền...) — không cần chức danh đi kèm.
 * So trên chữ đã bỏ dấu: nhiều bà con gõ không dấu ("cong an nhan tien").
 *
 * ĐÁNH ĐỔI ĐÃ CHẤP NHẬN — thà bắt dư hơn sót:
 *   · "Báo công an vụ hàng xóm đòi tiền nợ" có thể bị bắt dư -> tin vào phần
 *     lãnh đạo; lãnh đạo bấm "Đưa ra khỏi phần tố giác mật" là trả về luồng
 *     thường. Bắt sót thì tố cáo một cán bộ nằm trước mắt chính cán bộ đó.
 *   · Kẻ cố tình viết lách từ khoá vẫn lọt; cán bộ thấy tin như vậy thì bấm
 *     "Chuyển vào tố giác mật" (chỉ một chiều, cán bộ không đưa ra được).
 */

const CHUC_DANH = [
  'cong an', 'canh sat', 'csgt', 'cong an vien', 'truong cong an', 'pho cong an',
  'can bo', 'cong chuc', 'vien chuc', 'nguoi nha nuoc', 'co quan nha nuoc', 'chinh quyen',
  'chu tich', 'pho chu tich', 'bi thu', 'uy ban', 'ubnd', 'hoi dong nhan dan',
  'truong thon', 'truong ap', 'truong ban', 'truong khu pho', 'to truong', 'truong xom',
  'dia chinh', 'kiem lam', 'thue', 'hai quan', 'quan ly thi truong', 'thanh tra',
  'kiem sat', 'toa an', 'tham phan', 'thi hanh an', 'dan quan', 'bao ve dan pho',
  'truong phong', 'pho phong', 'giam doc', 'hieu truong', 'bo doi', 'quan doi',
];

const HANH_VI = [
  'nhan tien', 'voi tien', 'doi tien', 'an tien', 'lay tien', 'thu tien', 'dua tien',
  'phong bi', 'boi tron', 'lot tay', 'tien lam luat', 'hoi lo',
  'an chan', 'an bot', 'bao ke', 'lam ngo', 'bao che', 'tiep tay', 'cau ket', 'thong dong',
  'dung tung', 'nhung nhieu', 'sach nhieu', 'gay kho', 'lam kho', 'hach dich',
  'cuong ep', 'ep cung', 'danh nguoi', 'danh dap', 'de doa', 'doa nat', 'kho de',
  'xu ep', 'o du', 'che giau', 'tiet lo thong tin', 'ban thong tin',
];

/* Tự nó đã là sai phạm công vụ — không cần chức danh đi kèm */
const DOC_LAP = [
  'tham nhung', 'tham o', 'nhan hoi lo', 'an hoi lo', 'dua hoi lo', 'chay an', 'chay chuc',
  'chay viec', 'lam dung chuc vu', 'lam quyen', 'long quyen', 'bien thu', 'nhung nhieu dan',
];

/** Bỏ dấu, chữ thường, chỉ giữ chữ số và khoảng trắng; giữ dấu câu tách câu */
function boDau(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

const coTu = (cau, tu) => cau.includes(` ${tu} `);

/**
 * @returns {{ mat: boolean, lyDo: string[] }} lyDo: các cặp/từ đã khớp, để lãnh
 *   đạo thấy vì sao tin vào phần mật
 */
export function nhanDienToGiacMat(noiDung) {
  const cacCau = boDau(noiDung)
    .split(/[.!?;\n\r]+/)
    .map((c) => ` ${c.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `);
  const lyDo = new Set();
  for (const cau of cacCau) {
    for (const tu of DOC_LAP) if (coTu(cau, tu)) lyDo.add(tu);
    const chucDanh = CHUC_DANH.filter((t) => coTu(cau, t));
    if (chucDanh.length === 0) continue;
    const hanhVi = HANH_VI.filter((t) => coTu(cau, t));
    for (const hv of hanhVi) lyDo.add(`${chucDanh[0]} + ${hv}`);
  }
  return { mat: lyDo.size > 0, lyDo: [...lyDo].slice(0, 6) };
}
