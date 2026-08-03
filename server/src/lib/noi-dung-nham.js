/**
 * PHÁT HIỆN NỘI DUNG NHẢM
 * ============================================================================
 *
 * Bắt các kiểu gõ bừa cho đủ số ký tự tối thiểu, ví dụ:
 *
 *   "Aaaabdjiwma"           -> gõ bừa, không phải tiếng Việt
 *   "aaaaaaaaaaaaaaaaaaaa"  -> lặp một ký tự
 *   "asdfghjkl qwerty"      -> rê tay trên bàn phím
 *   "test test test test"   -> lặp một từ
 *   "111111111111"          -> toàn số
 *   "ádfjk ;lasdjf ;lkasjd" -> phụ âm liên tiếp, không có nguyên âm
 *
 * VÌ SAO CẦN:
 * Ô nội dung bắt tối thiểu 20 ký tự để bà con mô tả cho rõ. Nhưng người muốn
 * nghịch chỉ cần gõ bừa cho đủ 20 ký tự là gửi được. Mỗi ý kiến rác đều tốn
 * công cán bộ mở ra đọc rồi mới xoá được.
 *
 * NGUYÊN TẮC KHI VIẾT BỘ LỌC NÀY:
 * Thà bỏ lọt còn hơn chặn nhầm. Chặn nhầm một tố giác thật thì hậu quả nặng
 * hơn nhiều so với việc cán bộ phải xoá một ý kiến rác. Vì vậy mọi ngưỡng
 * dưới đây đều đặt ở mức DỄ DÃI, và chỉ chặn khi có bằng chứng rõ ràng.
 */

const bo_dau = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/* Các dãy phím nằm cạnh nhau — rê tay là ra đúng thứ tự này */
const DAY_PHIM = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  '1234567890', 'qwerty', 'asdfgh', 'zxcvbn',
  'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz',
];

/* Từ tiếng Việt thông dụng — dùng để xác nhận đây là câu tiếng Việt thật.
   Chỉ cần khớp vài từ là đủ kết luận không phải gõ bừa. */
const TU_THONG_DUNG = [
  'toi', 'la', 'co', 'khong', 'duoc', 'nguoi', 'nha', 'o', 'tai', 'cho', 'nay',
  'va', 'cua', 'cho', 'den', 'di', 'ra', 'vao', 'len', 'xuong', 'nhieu', 'rat',
  'bi', 'da', 'se', 'dang', 'thi', 'ma', 'nhung', 'vi', 'nen', 'mong', 'xin',
  'de nghi', 'kinh', 'ba con', 'cong an', 'khu vuc', 'duong', 'xa', 'phuong',
  'ap', 'khom', 'gio', 'ngay', 'dem', 'sang', 'chieu', 'toi qua', 'hom',
  'viec', 'vu', 'tinh hinh', 'phan anh', 'bao', 'giup', 'lam', 'gay', 'anh huong',
];

/* --------------------------------------------------------------------------
   KIỂM TRA "TIẾNG" CÓ ĐỌC ĐƯỢC KHÔNG

   Tiếng Việt có cấu trúc rất chặt: [phụ âm đầu] + [nguyên âm] + [phụ âm cuối].
   Chỉ 27 phụ âm đầu và 8 phụ âm cuối được phép.

   Nhờ vậy phân biệt được ngay:
       "truong"  -> tr + uo + ng   ✅ đọc được
       "bdjiwma" -> bdj...          ❌ không đọc được

   Đây là dấu hiệu mạnh nhất để bắt gõ bừa, và bắt được cả chuỗi NGẮN —
   những rào khác đều cần văn bản đủ dài mới hoạt động.
   -------------------------------------------------------------------------- */

const PHU_AM_DAU = [
  'ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'qu', 'th', 'tr',
  'b', 'c', 'd', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x',
];
const PHU_AM_CUOI = ['ng', 'nh', 'ch', 'c', 'm', 'n', 'p', 't'];

/** Một "tiếng" có đọc được theo luật tiếng Việt không? */
function tiengDocDuoc(tieng) {
  let s = tieng;
  if (!s || !/^[a-z]+$/.test(s)) return true; // có số hoặc ký tự khác -> bỏ qua, không xét

  // Bóc phụ âm đầu (thử cụm dài trước: ngh trước ng trước n)
  for (const pa of PHU_AM_DAU) {
    if (s.startsWith(pa)) { s = s.slice(pa.length); break; }
  }
  // Bóc phụ âm cuối
  for (const pc of PHU_AM_CUOI) {
    if (s.length > 1 && s.endsWith(pc)) { s = s.slice(0, -pc.length); break; }
  }
  // Phần còn lại phải toàn nguyên âm, tối đa 3 (uye, uyu, oai...)
  return /^[aeiouy]{1,3}$/.test(s);
}

/**
 * Kiểm tra một đoạn văn bản.
 * @returns {{ nham: boolean, lyDo: string, diem: number, chiTiet: string[] }}
 *   nham = true  -> nên CHẶN, kèm câu giải thích cho bà con
 *   diem         -> càng cao càng đáng ngờ (để ghi log, tiện chỉnh ngưỡng sau)
 */
export function kiemTraNoiDungNham(vanBanGoc) {
  const goc = String(vanBanGoc || '').trim();
  const t = bo_dau(goc);
  const chiTiet = [];
  let diem = 0;

  // Quá ngắn thì đã có lớp kiểm tra khác lo, ở đây bỏ qua
  if (goc.length < 8) return { nham: false, lyDo: '', diem: 0, chiTiet: [] };

  const chuCai = t.replace(/[^a-z]/g, '');
  const cacTu = t.split(/[^a-z0-9]+/).filter(Boolean);

  /* ---- 1. Lặp cùng một ký tự quá nhiều lần liên tiếp ------------------
     "aaaaaa" — người viết thật không bao giờ gõ quá 3 ký tự giống nhau
     liên tiếp (trừ vài trường hợp nhấn mạnh như "hlepppp"). */
  const lapKyTu = t.match(/(.)\1{3,}/g);
  if (lapKyTu) {
    diem += 40;
    chiTiet.push(`lặp ký tự "${lapKyTu[0][0]}" ${lapKyTu[0].length} lần liên tiếp`);
  }

  /* ---- 2. Toàn số hoặc toàn ký tự đặc biệt --------------------------- */
  if (chuCai.length < goc.replace(/\s/g, '').length * 0.3) {
    diem += 35;
    chiTiet.push('hầu như không có chữ cái');
  }

  /* ---- 3. Rê tay trên bàn phím --------------------------------------- */
  for (const day of DAY_PHIM) {
    for (let i = 0; i + 5 <= day.length; i++) {
      if (t.includes(day.slice(i, i + 5))) {
        diem += 40;
        chiTiet.push(`chứa dãy phím liền nhau "${day.slice(i, i + 5)}"`);
        break;
      }
    }
    if (diem >= 40) break;
  }

  /* ---- 4. Lặp lại cùng một từ ----------------------------------------
     "test test test test" — đếm tỷ lệ từ khác nhau trên tổng số từ. */
  if (cacTu.length >= 4) {
    const tyLeKhacNhau = new Set(cacTu).size / cacTu.length;
    if (tyLeKhacNhau <= 0.35) {
      diem += 35;
      chiTiet.push('lặp đi lặp lại cùng một vài từ');
    }
  }

  /* ---- 5. Thiếu nguyên âm --------------------------------------------
     Tiếng Việt có tỷ lệ nguyên âm rất cao (khoảng 45-50%). Dưới 20% gần
     như chắc chắn là gõ bừa. */
  if (chuCai.length >= 8) {
    const soNguyenAm = (chuCai.match(/[aeiouy]/g) || []).length;
    const tyLe = soNguyenAm / chuCai.length;
    if (tyLe < 0.2) {
      diem += 35;
      chiTiet.push('tỷ lệ nguyên âm quá thấp, không giống tiếng Việt');
    }
  }

  /* ---- 6. Từ dài bất thường ------------------------------------------
     Tiếng Việt viết rời từng tiếng, mỗi tiếng tối đa khoảng 7 chữ cái
     ("nghieng", "thuong"). Một cụm liền 12 chữ cái trở lên là bất thường. */
  const tuDai = cacTu.filter((w) => /^[a-z]+$/.test(w) && w.length >= 10);
  if (tuDai.length > 0) {
    diem += 30;
    chiTiet.push(`có cụm chữ dài bất thường "${tuDai[0]}"`);
  }

  /* ---- 7. Không có từ tiếng Việt thông dụng nào -----------------------
     Đây là dấu hiệu mạnh nhất. Một câu tiếng Việt thật dài trên 20 ký tự
     gần như luôn chứa ít nhất một trong các từ rất thông dụng. */
  const coTuThat = TU_THONG_DUNG.some((w) => ` ${t} `.includes(` ${w} `));
  if (!coTuThat && goc.length >= 12) {
    diem += 30;
    chiTiet.push('không chứa từ tiếng Việt thông dụng nào');
  }

  /* ---- 8. Cả đoạn chỉ là MỘT cụm không dấu cách ----------------------- */
  if (cacTu.length === 1 && goc.replace(/\s/g, '').length >= 10) {
    diem += 25;
    chiTiet.push('cả đoạn là một cụm liền, không có dấu cách');
  }

  /* ---- 9. Phụ âm liên tiếp quá dài ------------------------------------
     Tiếng Việt tối đa 3 phụ âm liền ("ngh"). Từ 5 trở lên là gõ bừa. */
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(chuCai)) {
    diem += 30;
    chiTiet.push('có chuỗi phụ âm liên tiếp không đọc được');
  }

  /* ---- 10. Tỷ lệ "tiếng" đọc được theo luật tiếng Việt ----------------
     Rào mạnh nhất, và là rào DUY NHẤT bắt được chuỗi ngắn như "Aaaabdjiwma".
     Chỉ xét các cụm toàn chữ cái; cụm có số (biển số xe, ngày tháng) bỏ qua. */
  const tuChuCai = cacTu.filter((w) => /^[a-z]+$/.test(w));
  if (tuChuCai.length > 0) {
    const soDocDuoc = tuChuCai.filter(tiengDocDuoc).length;
    const tyLe = soDocDuoc / tuChuCai.length;
    if (tyLe < 0.4) {
      diem += 40;
      chiTiet.push(`${tuChuCai.length - soDocDuoc}/${tuChuCai.length} cụm chữ không đọc được theo tiếng Việt`);
    } else if (tyLe < 0.65 && tuChuCai.length >= 3) {
      diem += 20;
      chiTiet.push('nhiều cụm chữ không đọc được');
    }
  }

  /* ---- Kết luận -------------------------------------------------------
     Ngưỡng 60: phải có ÍT NHẤT HAI dấu hiệu mạnh mới chặn.
     Một dấu hiệu đơn lẻ có thể là oan (ví dụ bà con viết tắt, viết hoa
     hết, hoặc dùng nhiều số khi ghi biển số xe). */
  const nham = diem >= 60;

  /* ---- Câu nhắc cụ thể theo đúng dấu hiệu bắt được ---------------------
     Trước đây mọi trường hợp đều nhận CÙNG MỘT câu chung chung, nên bà con
     không biết mình sai ở đâu để sửa — dễ bỏ cuộc không gửi nữa.
     Nay nhìn vào chiTiet để nói đúng vấn đề. Xếp theo thứ tự ưu tiên:
     dấu hiệu nào rõ nhất thì nhắc dấu hiệu đó. */
  function nhacCuThe() {
    const co = (tu) => chiTiet.some((c) => c.includes(tu));

    if (co('lặp ký tự'))
      return 'Nội dung có ký tự bị lặp nhiều lần. Bà con vui lòng viết lại bằng câu tiếng Việt bình thường.';
    if (co('dãy phím liền nhau'))
      return 'Nội dung giống như gõ bừa trên bàn phím. Bà con vui lòng mô tả sự việc bằng lời.';
    if (co('lặp đi lặp lại cùng một vài từ'))
      return 'Nội dung lặp lại cùng một vài từ. Bà con vui lòng mô tả rõ sự việc thay vì gõ lặp.';
    if (co('hầu như không có chữ cái'))
      return 'Nội dung hầu như chỉ có chữ số. Bà con vui lòng mô tả sự việc bằng lời.';
    if (co('không đọc được theo tiếng Việt') || co('phụ âm liên tiếp'))
      return 'Nội dung chưa đọc được thành câu tiếng Việt. Bà con vui lòng viết rõ: sự việc gì, ở đâu, khi nào.';
    if (co('không chứa từ tiếng Việt thông dụng'))
      return 'Nội dung chưa rõ nghĩa. Bà con vui lòng mô tả cụ thể: sự việc gì, xảy ra ở đâu, khi nào, ai liên quan.';

    return 'Nội dung có vẻ chưa được viết rõ ràng. Bà con vui lòng mô tả cụ thể sự việc: '
      + 'xảy ra ở đâu, khi nào, ai liên quan — để cán bộ có căn cứ xử lý.';
  }

  return {
    nham,
    diem,
    chiTiet,
    lyDo: nham ? nhacCuThe() : '',
  };
}

/**
 * Kiểm tra HỌ TÊN có phải gõ bừa không.
 * Tên người Việt: chỉ gồm chữ cái và dấu cách, mỗi tiếng 1-7 chữ cái.
 */
export function kiemTraHoTenNham(tenGoc) {
  const ten = String(tenGoc || '').trim();
  if (!ten) return { nham: false, lyDo: '' };

  const t = bo_dau(ten);

  // Có chữ số hoặc ký tự lạ
  if (/[0-9]/.test(ten)) {
    return { nham: true, lyDo: 'Họ tên không được chứa chữ số.' };
  }
  if (/[^\p{L}\s.']/u.test(ten)) {
    return { nham: true, lyDo: 'Họ tên chỉ gồm chữ cái và dấu cách.' };
  }
  // Lặp ký tự
  if (/(.)\1{3,}/.test(t)) {
    return { nham: true, lyDo: 'Họ tên không hợp lệ. Vui lòng nhập đúng họ tên của bà con.' };
  }
  // Một tiếng quá dài
  const tieng = t.split(/\s+/).filter(Boolean);
  if (tieng.some((w) => w.length > 8)) {
    return { nham: true, lyDo: 'Họ tên không hợp lệ. Vui lòng nhập đúng họ tên của bà con.' };
  }
  // Phụ âm liên tiếp
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(t.replace(/\s/g, ''))) {
    return { nham: true, lyDo: 'Họ tên không hợp lệ. Vui lòng nhập đúng họ tên của bà con.' };
  }
  // Quá ít tiếng
  if (tieng.length < 2) {
    return { nham: true, lyDo: 'Vui lòng nhập đầy đủ họ và tên.' };
  }

  return { nham: false, lyDo: '' };
}
