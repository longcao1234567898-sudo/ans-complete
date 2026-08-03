/**
 * PHÂN LOẠI Ý KIẾN — HOÀN TOÀN NỘI BỘ, KHÔNG GỌI AI BÊN NGOÀI
 * ============================================================================
 *
 * VÌ SAO BỎ AI KHỎI KHÂU PHÂN LOẠI:
 *
 *  1. RIÊNG TƯ — mọi ý kiến người dân gửi đều là dữ liệu nhạy cảm, không riêng
 *     gì tố giác. Bản cũ chỉ chặn nhóm tố giác không gửi ra ngoài, còn khiếu
 *     nại (tố cáo cán bộ), phản ánh (có tên người, địa chỉ) vẫn gửi sang Google.
 *  2. ỔN ĐỊNH — AI ngoài có thể đổi model, hết hạn mức, ngừng cấp cho tài khoản
 *     mới. Đã xảy ra thật: Google ngừng cấp gemini-2.5-flash cho tài khoản mới.
 *  3. GIẢI THÍCH ĐƯỢC — luật quy định rõ 4 nhóm và hạn xử lý. Phân loại bằng
 *     luật thì chỉ ra được VÌ SAO xếp vào nhóm đó; AI thì không.
 *  4. NHANH — không phải chờ gọi mạng, phản hồi tức thì.
 *
 * AI CHỈ CÒN DÙNG Ở TRỢ LÝ HỎI ĐÁP (chatbox) — nơi người dân chủ động đặt câu
 * hỏi chung, không kèm thông tin vụ việc.
 *
 * ============================================================================
 * CÁCH HOẠT ĐỘNG: chấm điểm theo từ khoá có trọng số.
 *
 *   - Mỗi nhóm có nhiều cụm từ khoá, mỗi cụm một trọng số.
 *   - Cụm càng đặc trưng cho nhóm thì trọng số càng cao.
 *   - Nhóm nào tổng điểm cao nhất thì thắng.
 *   - Độ tin cậy tính theo khoảng cách điểm giữa nhóm nhất và nhì.
 *
 * Từ khoá đều viết KHÔNG DẤU để khớp cả khi bà con gõ thiếu dấu
 * ("trom cap" khớp được cả "trộm cắp", "trom cap", "TRỘM CẮP").
 */

const bo_dau = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/* ==========================================================================
   BẢNG TỪ KHOÁ THEO 4 NHÓM XỬ LÝ

   Trọng số:
     10 = gần như chắc chắn thuộc nhóm này
      6 = dấu hiệu mạnh
      3 = dấu hiệu vừa, cần thêm căn cứ khác
   ========================================================================== */

const BANG_TU_KHOA = {
  /* ---- NHÓM 1: TỐ GIÁC TIN BÁO (hạn 20 ngày — Bộ luật TTHS 2015, Điều 147) */
  to_giac: {
    ten: 'Tố giác tin báo',
    nhom: [
      { diem: 10, chuDe: 'ma tuý', tu: ['ma tuy', 'chich hut', 'hut chich', 'choi da', 'bay lac', 'tang tru ma tuy', 'buon ban ma tuy', 'hang trang', 'con nghien', 'tiem chich'] },
      { diem: 10, chuDe: 'cờ bạc', tu: ['danh bac', 'da ga', 'so de', 'ghi de', 'ca do', 'xoc dia', 'lo de', 'ca cuoc', 'sat phat', 'song bac'] },
      { diem: 10, chuDe: 'trộm cướp', tu: ['trom cap', 'trom xe', 'an trom', 'an cap', 'cuop', 'cuop giat', 'mat trom', 'be khoa', 'dot nhap', 'trom do'] },
      { diem: 10, chuDe: 'tín dụng đen', tu: ['cho vay nang lai', 'tin dung den', 'doi no thue', 'xiet no', 'lai suat cat co', 'khung bo doi no', 'tat den',
        'cho vay lai nang', 'vay lai nang', 'lai nang', 'rai to roi', 'to roi cho vay',
        'vay khong the chap', 'bat no', 'de doa con no', 'tat son', 'nem chat ban'] },
      { diem: 10, chuDe: 'lừa đảo', tu: ['lua dao', 'chiem doat', 'da cap', 'lua tien', 'gia mao', 'lua dao qua mang', 'gia danh cong an', 'gia danh can bo',
        /* Giả danh cơ quan nhà nước — thủ đoạn phổ biến nhất hiện nay */
        'tu xung cong an', 'tu xung can bo', 'tu xung toa an', 'tu xung vien kiem sat',
        'gia danh toa an', 'gia danh vien kiem sat', 'gia danh ngan hang', 'gia danh dien luc',
        'chuyen tien de xac minh', 'phong toa tai khoan', 'dinh an', 'lien quan duong day',
        /* Chiếm đoạt mã xác thực, tài khoản */
        'ma otp', 'cung cap otp', 'ma xac thuc', 'cai app la', 'quet ma qr la',
        'mat tien trong tai khoan', 'chiem quyen dieu khien',
        /* Dụ dỗ qua mạng */
        'viec nhe luong cao', 'cam ket loi nhuan', 'san dau tu', 'dau tu ao',
        'trung thuong', 'nhan thuong', 'coc tien', 'tuyen cong tac vien'] },
      { diem: 10, chuDe: 'bạo lực', tu: ['danh nhau', 'dam chem', 'chem nguoi', 'hanh hung', 'gay thuong tich', 'con do', 'xa hoi den', 'bao hanh', 'danh vo', 'danh con', 'danh dap',
        /* Bà con thường kể lại sự việc chứ không dùng từ chuyên môn */
        'chong danh', 'vo danh', 'cha danh', 'me danh', 'danh me', 'danh cha',
        'danh nguoi gia', 'nhot con', 'khoc thet', 'keu cuu', 'say ruou danh',
        'duoi ra khoi nha', 'doa giet vo', 'hanh ha'] },
      { diem: 10, chuDe: 'xâm hại', tu: ['hiep dam', 'xam hai', 'dam o', 'quay roi tinh duc', 'xam hai tre em', 'du do tre'] },
      { diem: 10, chuDe: 'mại dâm', tu: ['mai dam', 'gai goi', 'chua chap mai dam', 'mua ban dam', 'kich duc'] },
      { diem: 10, chuDe: 'buôn lậu, hàng cấm', tu: ['buon lau', 'hang cam', 'hang gia', 'thuoc la lau', 'phao lau', 'xang gia', 'thuc pham ban', 'hang nhai'] },
      { diem: 10, chuDe: 'vũ khí', tu: ['sung', 'vu khi', 'hung khi', 'dao kiem', 'vat lieu no', 'phao no', 'thuoc no', 'sung tu che'] },
      { diem: 10, chuDe: 'mua bán người', tu: ['buon nguoi', 'bat coc', 'vuot bien', 'dua nguoi trai phep', 'mua ban nguoi', 'lua di lam viec nhe'] },
      { diem: 10, chuDe: 'án nghiêm trọng', tu: ['giet nguoi', 'giet', 'thu tieu', 'xac chet', 'tu vong bat thuong'] },
      { diem: 6, chuDe: 'gây rối', tu: ['gay roi trat tu', 'tu tap dong nguoi', 'quay roi', 'de doa', 'doa danh', 'doa giet', 'khung bo tinh than'] },
      { diem: 6, chuDe: 'môi trường, khai thác', tu: ['xa thai', 'o nhiem nguon nuoc', 'khai thac cat', 'cat tac', 'pha rung', 'lam tac', 'san bat dong vat'] },
      { diem: 10, chuDe: 'công nghệ cao', tu: ['hack', 'chiem tai khoan', 'danh cap thong tin', 'tin nhan lua dao', 'link gia', 'app vay tien',
        /* Nâng từ 6 lên 10 điểm: lừa đảo công nghệ nay là loại tố giác phổ biến
           nhất, để 6 điểm dễ bị nhóm "phản ánh" giành mất. */
        'link la', 'phan mem doc hai', 'dang nhap ho', 'ban thong tin ca nhan',
        'lo thong tin ca nhan', 'gia mao website', 'trang web gia'] },
      { diem: 10, chuDe: 'trình báo trực tiếp', tu: ['to giac', 'to cao toi pham', 'trinh bao', 'bao an', 'bao cong an', 'toi muon to giac', 'xin to giac'] },
    ],
  },

  /* ---- NHÓM 2: KHIẾU NẠI, TỐ CÁO (hạn 30 ngày — Luật Khiếu nại 2011) ------
     Đặc trưng: nhắm vào QUYẾT ĐỊNH HÀNH CHÍNH hoặc HÀNH VI CÁN BỘ.
     Đây là nhóm BẮT BUỘC có danh tính, không cho gửi ẩn danh. */
  khieu_nai: {
    ten: 'Khiếu nại, tố cáo',
    nhom: [
      { diem: 10, chuDe: 'khiếu nại quyết định', tu: ['khieu nai', 'khieu kien', 'khong dong y quyet dinh', 'quyet dinh hanh chinh', 'quyet dinh xu phat', 'bien ban xu phat', 'phan quyet', 'khong thoa dang'] },
      { diem: 10, chuDe: 'tố cáo cán bộ', tu: ['to cao can bo', 'to cao cong chuc', 'can bo vi pham', 'can bo nhung nhieu', 'can bo hach sach', 'can bo cua quyen', 'lam quyen', 'lam dung chuc vu'] },
      { diem: 10, chuDe: 'tiêu cực', tu: ['tham nhung', 'hoi lo', 'nhan hoi lo', 'voi vinh', 'boi tron', 'lot tay', 'phong bi', 'tieu cuc', 'mai lo', 'bao ke'] },
      { diem: 6, chuDe: 'thái độ phục vụ', tu: ['thai do khong dung muc', 'gay kho de', 'hach sach', 'lam kho', 'cua quyen', 'hach dich', 'thieu ton trong dan', 'quat thao'] },
      { diem: 6, chuDe: 'chậm trễ hồ sơ', tu: ['ho so bi ngam', 'ngam ho so', 'khong tra ket qua', 'qua han giai quyet', 'hen di hen lai', 'di lai nhieu lan', 'lam mat ho so'] },
      { diem: 6, chuDe: 'thu sai quy định', tu: ['thu tien sai', 'thu phi cao', 'thu ngoai quy dinh', 'khong co bien lai', 'thu them tien'] },
      { diem: 6, chuDe: 'đất đai, đền bù', tu: ['tranh chap dat', 'thu hoi dat', 'den bu khong thoa dang', 'giai phong mat bang', 'cap so do', 'so do sai'] },
      { diem: 3, chuDe: 'oan sai', tu: ['oan sai', 'xu ly khong cong bang', 'thien vi', 'bao che', 'lam sai quy trinh'] },
    ],
  },

  /* ---- NHÓM 3: PHẢN ÁNH, KIẾN NGHỊ (hạn 15 ngày) -------------------------
     Đặc trưng: tình hình chung của địa bàn, không tố giác ai cụ thể. */
  phan_anh: {
    ten: 'Phản ánh, kiến nghị',
    nhom: [
      { diem: 10, chuDe: 'trật tự đô thị', tu: ['lan chiem via he', 'lan chiem long duong', 'buon ban tren via he', 'do xe lan chiem', 'hop cho tu phat', 'bay ban', 'dung rap trai phep'] },
      { diem: 10, chuDe: 'tiếng ồn', tu: ['tieng on', 'hat karaoke', 'karaoke keo', 'loa keo', 'mo nhac to', 'on ao ban dem', 'nhau nhet on ao', 'gay on'] },
      { diem: 10, chuDe: 'giao thông', tu: ['den giao thong hong', 'bien bao', 'duong hu', 'o ga', 'ngap nuoc', 'ket xe', 'diem den', 'khong doi mu bao hiem', 'lang lach', 'danh vong', 'do xe sai quy dinh', 'xe qua tai'] },
      { diem: 10, chuDe: 'hạ tầng', tu: ['den duong hong', 'den duong khong sang', 'mat dien', 'cong tac nuoc', 'rac thai', 'do rac bua bai', 'cong ranh', 'nap cong', 'cay xanh nga'] },
      { diem: 6, chuDe: 'an ninh khu dân cư', tu: ['thanh nien tu tap', 'nghi van', 'nguoi la', 'doi tuong nghi van', 'mat an ninh', 'khong an toan', 'lo lang an ninh', 'de nghi tuan tra'] },
      { diem: 6, chuDe: 'chăn nuôi, môi trường', tu: ['mui hoi', 'nuoc thai', 'chan nuoi gay o nhiem', 'cho tha rong', 'gia suc tha rong', 'dot rac'] },
      { diem: 6, chuDe: 'phản ánh chung', tu: ['phan anh', 'kien nghi', 'de nghi xu ly', 'de nghi kiem tra', 'mong co quan', 'kinh mong', 'bao con', 'ba con mong'] },
    ],
  },

  /* ---- NHÓM 4: ĐỀ XUẤT, THẮC MẮC (hạn 10 ngày) --------------------------- */
  de_xuat: {
    ten: 'Đề xuất, thắc mắc',
    nhom: [
      { diem: 10, chuDe: 'thủ tục giấy tờ', tu: ['thu tuc', 'ho so can gi', 'giay to gi', 'can nhung gi', 'lam can cuoc', 'can cuoc cong dan', 'ho chieu', 'ly lich tu phap', 'giay xac nhan', 'dang ky xe', 'sang ten'] },
      { diem: 10, chuDe: 'cư trú', tu: ['tam tru', 'tam vang', 'thuong tru', 'ho khau', 'dang ky cu tru', 'chuyen ho khau', 'nhap ho khau', 'tach ho khau'] },
      { diem: 10, chuDe: 'câu hỏi', tu: ['xin hoi', 'cho hoi', 'toi muon hoi', 'thac mac', 'huong dan giup', 'khong biet lam sao', 'lam the nao', 'the nao de', 'co can khong', 'bao lau thi xong', 'phi bao nhieu', 'le phi'] },
      { diem: 10, chuDe: 'đề xuất', tu: ['de xuat', 'gop y', 'y kien dong gop', 'nen co them', 'mong duoc bo sung', 'sang kien', 'de nghi bo sung'] },
      { diem: 6, chuDe: 'dịch vụ công', tu: ['dich vu cong', 'lam online', 'cong dich vu cong', 'vneid', 'dinh danh dien tu', 'nop truc tuyen'] },
      { diem: 6, chuDe: 'lịch làm việc', tu: ['gio lam viec', 'lam viec thu may', 'nghi trua', 'dia chi tru so', 'so dien thoai truc ban'] },
    ],
  },
};

/* ==========================================================================
   MỨC KHẨN CẤP
   ========================================================================== */

const TU_KHOA_KHAN = [
  'dang xay ra', 'ngay bay gio', 'ngay luc nay', 'vua moi xay ra', 'khan cap',
  'cap cuu', 'nguy hiem tinh mang', 'sap chet', 'bi thuong nang', 'mau',
  'dang danh nhau', 'dang danh', 'dang cuop', 'chay nha', 'chay no', 'hoa hoan',
  'doa giet', 'doa danh', 'bat coc', 'tu tu', 'nhay cau', 'tre em bi',
];

const TU_KHOA_QUAN_TRONG = [
  'nhieu lan', 'keo dai', 'lien tuc', 'thuong xuyen', 'nhieu thang',
  'ca xom', 'ca khu', 'nhieu nguoi', 'tre em', 'nguoi gia', 'phu nu',
  'gan truong hoc', 'truoc cong truong', 'benh vien',
];

/* ==========================================================================
   HÀM PHỤ
   ========================================================================== */

/** Đếm số lần xuất hiện của một cụm từ trong văn bản */
function demXuatHien(vanBan, cum) {
  let n = 0;
  let i = vanBan.indexOf(cum);
  while (i !== -1) {
    n++;
    i = vanBan.indexOf(cum, i + cum.length);
  }
  return n;
}

/** Nhận diện câu hỏi — dấu hiệu mạnh của nhóm "Đề xuất, thắc mắc" */
function laCauHoi(goc, khongDau) {
  if (goc.includes('?')) return true;
  const dauHieu = ['xin hoi', 'cho hoi', 'co the', 'lam sao', 'the nao', 'bao nhieu', 'khi nao', 'o dau', 'can gi', 'phai lam gi'];
  return dauHieu.some((d) => khongDau.includes(d));
}

/* ==========================================================================
   HÀM CHÍNH
   ========================================================================== */

/**
 * Phân loại một ý kiến.
 * Trả về cùng cấu trúc mà giao diện đang dùng, nên không phải sửa frontend.
 */
/**
 * CỨU HỘ khi bộ từ khoá nhóm không khớp được gì.
 *
 * Hai bộ từ khoá chạy song song và bổ trợ nhau:
 *   · Bộ từ khoá NHÓM   — rộng, bắt các cách diễn đạt chung chung
 *   · Bảng 28 CHỦ ĐỀ    — hẹp và cụ thể, bắt đúng tên sự việc
 *
 * Có những câu chỉ bảng chủ đề bắt được, ví dụ "đèn đường tổ 5 hỏng":
 * không có từ nào mang nghĩa "phản ánh, kiến nghị", nhưng "đèn đường"
 * khớp thẳng chủ đề Hạ tầng. Trước đây các câu này bị xếp "không rõ nhóm"
 * với độ tin cậy 0.3 — đẩy việc phân loại lại cho cán bộ một cách không cần thiết.
 */
function cuuBangChuDe(goc, t) {
  const cd = nhanDienChuDe(goc, null);
  if (cd) {
    const day = CHU_DE.find((c) => c.ma === cd.ma);
    return {
      normalizedContent: chuanHoaVanPhong(goc, day.nhom),
      suggestedCategory: day.nhom,
      confidence: 0.62,
      keywords: [],
      chuDe: [cd.ten],
      detectedTopic: cd.ma,
      topicLabel: cd.ten,
      lyDoPhanLoai: `Nhận diện theo chủ đề "${cd.ten}". Cán bộ có thể phân loại lại nếu cần.`,
      ...doanMucKhan(t, day),
      aiSkipped: true,
      privacyNote: 'Nội dung được phân loại HOÀN TOÀN trong hệ thống, không gửi sang bất kỳ dịch vụ AI bên ngoài nào.',
    };
  }
  return {
    normalizedContent: chuanHoaVanPhong(goc, 'phan_anh'),
    suggestedCategory: 'phan_anh',
    confidence: 0.3,
    keywords: [],
    chuDe: [],
    detectedTopic: null,
    topicLabel: null,
    lyDoPhanLoai: 'Không tìm thấy dấu hiệu đặc trưng của nhóm nào. Tạm xếp vào Phản ánh, kiến nghị để cán bộ xem và phân loại lại.',
    ...doanMucKhan(t),
    aiSkipped: true,
    privacyNote: 'Nội dung được phân loại HOÀN TOÀN trong hệ thống, không gửi sang bất kỳ dịch vụ AI bên ngoài nào.',
  };
}

export function phanLoaiNoiDung(noiDungGoc) {
  const goc = String(noiDungGoc || '').trim();
  const t = ' ' + bo_dau(goc).replace(/\s+/g, ' ') + ' ';

  /* --- Bước 1: chấm điểm từng nhóm --- */
  const ketQua = {};
  for (const [ma, cauHinh] of Object.entries(BANG_TU_KHOA)) {
    let tong = 0;
    const tuKhopDuoc = [];
    const chuDeKhop = new Set();

    for (const g of cauHinh.nhom) {
      for (const tu of g.tu) {
        const soLan = demXuatHien(t, tu);
        if (soLan > 0) {
          // Lần đầu tính đủ điểm, các lần sau chỉ tính thêm một nửa
          // -> tránh việc lặp một từ nhiều lần đẩy điểm lên vô lý
          tong += g.diem + (soLan - 1) * (g.diem / 2);
          tuKhopDuoc.push(tu);
          chuDeKhop.add(g.chuDe);
        }
      }
    }
    ketQua[ma] = { diem: tong, tu: tuKhopDuoc, chuDe: [...chuDeKhop], ten: cauHinh.ten };
  }

  /* --- Bước 2: điều chỉnh theo ngữ cảnh --- */

  // Câu hỏi -> nghiêng về "Đề xuất, thắc mắc"
  if (laCauHoi(goc, t)) ketQua.de_xuat.diem += 8;

  // Nhắc tới cán bộ/cơ quan kèm ý phàn nàn -> nghiêng về "Khiếu nại, tố cáo"
  const nhacCanBo = ['can bo', 'cong chuc', 'nhan vien', 'cong an vien', 'chu tich xa', 'truong ap', 'to truong'];
  const yPhanNan = ['khong dung', 'sai', 'vi pham', 'thai do', 'gay kho', 'khong giai quyet', 'lam ngo'];
  if (nhacCanBo.some((x) => t.includes(x)) && yPhanNan.some((x) => t.includes(x))) {
    ketQua.khieu_nai.diem += 8;
  }

  // Văn bản rất ngắn (dưới 8 chữ) -> hạ điểm mọi nhóm, vì căn cứ quá mỏng
  const soChu = goc.split(/\s+/).filter(Boolean).length;
  if (soChu < 8) {
    for (const k of Object.keys(ketQua)) ketQua[k].diem *= 0.6;
  }

  /* --- Bước 3: chọn nhóm thắng --- */
  const xepHang = Object.entries(ketQua).sort((a, b) => b[1].diem - a[1].diem);
  const [maNhat, nhat] = xepHang[0];
  const nhi = xepHang[1][1];

  // Không nhóm nào có dấu hiệu -> mặc định "Phản ánh, kiến nghị"
  // (nhóm trung tính nhất, cán bộ đọc rồi chuyển nhóm sau)
  if (nhat.diem === 0) {
    return {
      ...cuuBangChuDe(goc, t),
      aiSkipped: true,
      privacyNote: 'Nội dung được phân loại HOÀN TOÀN trong hệ thống, không gửi sang bất kỳ dịch vụ AI bên ngoài nào.',
    };
  }

  /* --- Bước 4: độ tin cậy theo khoảng cách điểm --- */
  // Cách biệt càng lớn thì càng chắc chắn
  const cachBiet = nhat.diem - nhi.diem;
  let confidence = 0.55 + Math.min(0.4, cachBiet / 30);
  if (nhat.chuDe.length >= 2) confidence += 0.05; // khớp nhiều chủ đề -> chắc hơn
  confidence = Math.min(0.97, Number(confidence.toFixed(2)));

  const chuDeChiTiet = nhanDienChuDe(goc, maNhat);
  const chuDeDayDu = chuDeChiTiet ? CHU_DE.find((c) => c.ma === chuDeChiTiet.ma) : null;

  return {
    normalizedContent: chuanHoaVanPhong(goc, maNhat),
    suggestedCategory: maNhat,
    confidence,
    keywords: nhat.tu.slice(0, 6),
    chuDe: nhat.chuDe,

    /* CHỦ ĐỀ CHI TIẾT — trong 28 chủ đề của bảng CHU_DE.
       Nhóm cho biết hồ sơ đi về đâu; chủ đề cho biết ĐÚNG việc gì.
       Nhờ đó cán bộ nhìn nhãn là nắm ngay bản chất, và thống kê được
       địa bàn nào nhiều loại vụ việc nào. */
    detectedTopic: (chuDeChiTiet && chuDeChiTiet.ma) || null,
    topicLabel: (chuDeChiTiet && chuDeChiTiet.ten) || null,

    lyDoPhanLoai: taoLyDo(nhat, cachBiet),
    ...doanMucKhan(t, chuDeDayDu),
    aiSkipped: true,
    privacyNote:
      maNhat === 'to_giac'
        ? 'Nội dung có dấu hiệu tố giác tội phạm — được phân tích HOÀN TOÀN trong hệ thống, không gửi ra ngoài để bảo vệ người tố giác.'
        : 'Nội dung được phân loại HOÀN TOÀN trong hệ thống, không gửi sang bất kỳ dịch vụ AI bên ngoài nào.',
  };
}

/** Câu giải thích ngắn để hiện cho người dân và cán bộ cùng đọc */
function taoLyDo(nhat, cachBiet) {
  const chuDe = nhat.chuDe.length ? nhat.chuDe.join(', ') : 'nội dung chung';
  const chac = cachBiet >= 10 ? 'rõ ràng' : cachBiet >= 4 ? 'khá rõ' : 'tương đối';
  return `Nội dung có dấu hiệu ${chac} thuộc nhóm "${nhat.ten}" (chủ đề: ${chuDe}).`;
}

/** Đoán mức khẩn cấp */
/** Trẻ em liên quan -> nâng một bậc ưu tiên */
const CO_TRE_EM = ['tre em', 'hoc sinh', 'em be', 'chau be', 'tre nho', 'be gai', 'be trai', 'con nho'];

/**
 * Đoán mức khẩn cấp.
 *
 * Kết hợp HAI nguồn tín hiệu, vì mỗi nguồn trả lời một câu hỏi khác nhau:
 *   · Từ khoá trong câu   -> "có đang xảy ra không?"  (đang đánh nhau, chảy máu)
 *   · Chủ đề của vụ việc  -> "việc này nghiêm trọng cỡ nào?" (ma tuý, bạo hành)
 *
 * Trước đây chỉ xét nguồn thứ nhất, nên một tin báo bạo hành trẻ em viết bình
 * tĩnh, không có từ nào gấp gáp, vẫn bị xếp mức bình thường — sai bản chất.
 *
 * @param {string} t        nội dung đã bỏ dấu
 * @param {object|null} cd  chủ đề chi tiết đã nhận diện (có trường .khan)
 */
function doanMucKhan(t, cd = null) {
  const khanTheoChuDe = cd && cd.khan ? cd.khan : 'normal';
  const coTreEm = CO_TRE_EM.some((k) => t.includes(k));

  // 1. Từ khoá nguy cấp trong câu -> khẩn ngay, không cần xét gì thêm
  if (TU_KHOA_KHAN.some((k) => t.includes(k))) {
    return { suggestedUrgency: 'urgent', urgencyReason: 'Nội dung có dấu hiệu đang xảy ra hoặc nguy hiểm tính mạng — cần xử lý ngay.' };
  }

  // 2. Bản thân loại vụ việc đã thuộc diện khẩn (giết người, bắt cóc, xâm hại...)
  if (khanTheoChuDe === 'urgent') {
    return { suggestedUrgency: 'urgent', urgencyReason: `Tính chất vụ việc nghiêm trọng (${cd.ten}) — cần xử lý khẩn.` };
  }

  // 3. Vụ việc nghiêm trọng lại có trẻ em liên quan -> nâng lên khẩn
  if (coTreEm && khanTheoChuDe === 'important') {
    return { suggestedUrgency: 'urgent', urgencyReason: `Vụ việc ${cd.ten.toLowerCase()} có liên quan trẻ em — ưu tiên xử lý.` };
  }

  // 4. Từ khoá cho thấy việc kéo dài, ảnh hưởng nhiều người
  if (TU_KHOA_QUAN_TRONG.some((k) => t.includes(k))) {
    return { suggestedUrgency: 'important', urgencyReason: 'Vụ việc kéo dài hoặc ảnh hưởng nhiều người — cần sớm quan tâm.' };
  }

  // 5. Loại vụ việc thuộc diện nghiêm trọng
  if (khanTheoChuDe === 'important') {
    return { suggestedUrgency: 'important', urgencyReason: `Vụ việc ${cd.ten.toLowerCase()} — cần sớm quan tâm.` };
  }

  return { suggestedUrgency: 'normal', urgencyReason: '' };
}

/**
 * Chuẩn hoá thành câu văn hành chính để cán bộ đọc nhanh.
 * KHÔNG viết lại nội dung — chỉ thêm câu mở đầu, giữ nguyên lời bà con.
 * (Viết lại bằng máy dễ làm sai lệch ý, nhất là với tố giác.)
 */
function chuanHoaVanPhong(goc, ma) {
  const sach = goc.replace(/\s+/g, ' ').trim();
  const moDau = {
    to_giac: 'Tố giác, tin báo về vụ việc:',
    khieu_nai: 'Khiếu nại, tố cáo về:',
    phan_anh: 'Phản ánh, kiến nghị về:',
    de_xuat: 'Đề xuất, thắc mắc:',
  };
  return `${moDau[ma] || 'Nội dung:'} "${sach}"`;
}

/** Dùng ở chỗ khác nếu cần kiểm tra nhanh có phải tố giác không */
export function laToGiac(noiDung) {
  return phanLoaiNoiDung(noiDung).suggestedCategory === 'to_giac';
}


/* ==================================================================
   NHẬN DIỆN CHỦ ĐỀ CHI TIẾT — 28 chủ đề

   Nhóm xử lý (4 nhóm) trả lời "hồ sơ đi về đâu".
   Chủ đề chi tiết trả lời "việc gì" — giúp cán bộ nắm ngay bản chất
   vụ việc mà không cần đọc hết nội dung, và giúp thống kê được
   địa bàn nào nhiều loại vụ việc nào.
   ================================================================== */

export const CHU_DE = [
  /* ---------- NHÓM 1: TỐ GIÁC TIN BÁO VỀ TỘI PHẠM ---------- */
  {
    ma: 'ma_tuy', nhom: 'to_giac', ten: 'Ma tuý, chất cấm', trongSo: 3, khan: 'important',
    tuKhoa: ['ma tuy', 'ma tuý', 'heroin', 'ket ta', 'da ban', 'hang trang', 'chich hut',
      'hut chich', 'con nghien', 'nguoi nghien', 'chich choac', 'bay lac', 'choi da',
      'tang tru ma tuy', 'buon ma tuy', 'ban ma tuy', 'thuoc lac', 'bong cuoi', 'shisha',
      'can sa', 'co my', 'nuoc vui', 'tem giay'],
  },
  {
    ma: 'trom_cap', nhom: 'to_giac', ten: 'Trộm cắp tài sản', trongSo: 3, khan: 'important',
    tuKhoa: ['trom cap', 'an trom', 'an cap', 'trom xe', 'mat trom', 'bi trom', 'ke trom',
      'be khoa', 'pha khoa', 'cay tu', 'trom cho', 'bat trom cho', 'moc tui', 'thoi mien',
      'trom vat', 'lay cap'],
  },
  {
    ma: 'cuop_giat', nhom: 'to_giac', ten: 'Cướp, cướp giật', trongSo: 3, khan: 'urgent',
    tuKhoa: ['cuop', 'cuop giat', 'giat do', 'giat dien thoai', 'giat day chuyen',
      'cuop tai san', 'cuong doat', 'trang tron cuop'],
  },
  {
    ma: 'lua_dao', nhom: 'to_giac', ten: 'Lừa đảo chiếm đoạt tài sản', trongSo: 3, khan: 'important',
    tuKhoa: ['lua dao', 'chiem doat', 'da cap', 'lua tien', 'gia danh cong an',
      'gia danh cong ty', 'gia danh vien kiem sat', 'app vay tien', 'san ao', 'dau tu ao',
      'viec nhe luong cao', 'lam nhiem vu', 'chuyen khoan', 'link la', 'sim rac lua',
      'gia mao', 'bi lua', 'cam ket loi nhuan', 'ty le thang cao',
      /* Bổ sung: thủ đoạn giả danh cơ quan nhà nước — dạng phổ biến nhất hiện nay.
         Kẻ gian gọi điện tự xưng công an, toà án, viện kiểm sát, thuế, điện lực...
         doạ người dân dính án rồi yêu cầu chuyển tiền "để xác minh". */
      'tu xung cong an', 'tu xung can bo', 'tu xung toa an', 'tu xung vien kiem sat',
      'tu xung cuc canh sat', 'gia danh toa an', 'gia danh thue', 'gia danh dien luc',
      'gia danh ngan hang', 'gia danh nhan vien',
      'chuyen tien de xac minh', 'chuyen tien xac minh', 'yeu cau chuyen tien',
      'phong toa tai khoan', 'lien quan duong day', 'dinh an', 'lenh bat',
      /* Chiếm đoạt mã xác thực và tài khoản */
      'ma otp', 'cung cap otp', 'ma xac thuc', 'cho so tai khoan', 'quet ma qr la',
      'dang nhap ho', 'chiem quyen dieu khien', 'cai app la', 'cai dat app la',
      'phan mem doc hai', 'mat tien trong tai khoan', 'tru tien trong tai khoan',
      /* Dụ dỗ qua mạng xã hội */
      'nhan thuong', 'trung thuong', 'qua tang mien phi', 'coc tien', 'dat coc',
      'tuyen cong tac vien', 'chot don ao', 'ban hang online lua'],
  },
  {
    ma: 'danh_bac', nhom: 'to_giac', ten: 'Cờ bạc, cá độ', trongSo: 3, khan: 'important',
    tuKhoa: ['danh bac', 'da ga', 'so de', 'ghi de', 'ca do', 'ca cuoc', 'xoc dia',
      'bai bac', 'tai xiu', 'lo de', 'ban ca an tien', 'game bai', 'sat phat'],
  },
  {
    ma: 'tin_dung_den', nhom: 'to_giac', ten: 'Tín dụng đen, đòi nợ thuê', trongSo: 3, khan: 'important',
    tuKhoa: ['cho vay nang lai', 'tin dung den', 'doi no thue', 'xiet no', 'khung bo doi no',
      'lai suat cao', 'vay nong', 'to bua doi no', 'nem chat ban', 'goi dien khung bo',
      /* Bổ sung: cách quảng cáo và đòi nợ thực tế ở địa bàn */
      'cho vay lai nang', 'vay lai nang', 'lai nang', 'cho vay lai cao',
      'rai to roi', 'dan to roi', 'to roi cho vay', 'quang cao cho vay',
      'vay khong the chap', 'vay nhanh trong ngay', 'ho tro tai chinh',
      'bat no', 'de doa con no', 'canh ne', 'khoa cua doi no', 'tat son'],
  },
  {
    ma: 'gay_thuong_tich', nhom: 'to_giac', ten: 'Cố ý gây thương tích, ẩu đả', trongSo: 3, khan: 'urgent',
    tuKhoa: ['danh nhau', 'dam chem', 'chem nguoi', 'hanh hung', 'gay thuong tich',
      'danh hoi dong', 'con do', 'giang ho', 'bao luc', 'danh nguoi', 'dam da'],
  },
  {
    ma: 'bao_hanh', nhom: 'to_giac', ten: 'Bạo hành gia đình, trẻ em', trongSo: 3, khan: 'urgent',
    tuKhoa: ['bao hanh', 'danh vo', 'danh con', 'bao luc gia dinh', 'ngoc dai', 'hanh ha',
      'bo me danh', 'danh dap tre', 'bao hanh tre em', 'nguoc dai nguoi gia',
      /* Bổ sung: bà con thường không dùng từ "bạo hành" mà kể lại sự việc.
         Ví dụ "chồng tôi thường xuyên đánh đập tôi", "nhà bên có tiếng
         trẻ khóc thét và tiếng đánh". Thiếu các cụm này thì bỏ lọt. */
      'danh dap', 'chong danh', 'chong toi danh', 'vo danh', 'cha danh', 'me danh',
      'danh me', 'danh cha', 'danh ong ba', 'danh nguoi gia',
      'khoc thet', 'tieng khoc thet', 'keu cuu', 'tieng keu cuu',
      'nhot con', 'bo doi', 'khong cho an', 'doa giet vo', 'duoi ra khoi nha',
      'chui boi vo', 'chui boi con', 'say ruou danh', 'nhau vao danh'],
  },
  {
    ma: 'xam_hai', nhom: 'to_giac', ten: 'Xâm hại, dâm ô', trongSo: 3, khan: 'urgent',
    tuKhoa: ['hiep dam', 'xam hai', 'dam o', 'quay roi tinh duc', 'so soang',
      'du do tre em', 'lam dung tinh duc'],
  },
  {
    ma: 'giet_nguoi', nhom: 'to_giac', ten: 'Giết người, đe doạ tính mạng', trongSo: 3, khan: 'urgent',
    tuKhoa: ['giet nguoi', 'doa giet', 'am sat', 'thu tieu', 'giet chet', 'xac chet',
      'mat tich nghi van'],
  },
  {
    ma: 'bat_coc', nhom: 'to_giac', ten: 'Bắt cóc, mua bán người', trongSo: 3, khan: 'urgent',
    tuKhoa: ['bat coc', 'buon nguoi', 'mua ban nguoi', 'dua nguoi trai phep', 'vuot bien',
      'lua ban sang campuchia', 'giu nguoi trai phep'],
  },
  {
    ma: 'vu_khi', nhom: 'to_giac', ten: 'Vũ khí, vật liệu nổ', trongSo: 3, khan: 'urgent',
    tuKhoa: ['sung', 'vu khi', 'hung khi', 'dao kiem', 'ma tau', 'vat lieu no', 'thuoc no',
      'phao no', 'tu che phao', 'sung tu che', 'binh xit hoi cay'],
  },
  {
    ma: 'buon_lau', nhom: 'to_giac', ten: 'Buôn lậu, hàng giả', trongSo: 2, khan: 'important',
    tuKhoa: ['buon lau', 'hang cam', 'hang gia', 'hang nhai', 'thuoc la lau', 'duong lau',
      'tron thue', 'hang khong ro nguon goc', 'thuc pham ban'],
  },
  {
    ma: 'mai_dam', nhom: 'to_giac', ten: 'Mại dâm, chứa chấp', trongSo: 3, khan: 'important',
    tuKhoa: ['mai dam', 'gai goi', 'chua chap', 'moi gioi mai dam', 'kich duc',
      'massage tra hinh', 'ban dam'],
  },
  {
    ma: 'to_giac_chung', nhom: 'to_giac', ten: 'Tố giác, tin báo khác', trongSo: 2, khan: 'important',
    tuKhoa: ['to giac', 'to cao toi pham', 'trinh bao', 'bao an', 'trinh bao cong an',
      'toi pham', 'vi pham phap luat', 'pham toi'],
  },

  /* ---------- NHÓM 2: KHIẾU NẠI, TỐ CÁO CÁN BỘ ---------- */
  {
    ma: 'nhung_nhieu', nhom: 'khieu_nai', ten: 'Cán bộ nhũng nhiễu, vòi tiền', trongSo: 3, khan: 'important',
    tuKhoa: ['nhung nhieu', 'voi tien', 'boi tron', 'phong bi', 'lot tay', 'chung chi',
      'goi y dua tien', 'an hoi lo', 'nhan hoi lo', 'tham nhung', 'tieu cuc', 'lam tien'],
  },
  {
    ma: 'thai_do_can_bo', nhom: 'khieu_nai', ten: 'Thái độ, tác phong cán bộ', trongSo: 2, khan: 'normal',
    tuKhoa: ['thai do can bo', 'cua quyen', 'hach sach', 'quat thao', 'gat gong',
      'khong huong dan', 'lam ngo', 'vo cam', 'thieu ton trong', 'noi trong khong'],
  },
  {
    ma: 'ho_so_cham', nhom: 'khieu_nai', ten: 'Giải quyết hồ sơ chậm trễ', trongSo: 2, khan: 'normal',
    tuKhoa: ['ho so cham', 'di lai nhieu lan', 'hen nhieu lan', 'qua han giai quyet',
      'khong tra ket qua', 'ngam ho so', 'day qua day lai', 'chua giai quyet'],
  },
  {
    ma: 'quyet_dinh_sai', nhom: 'khieu_nai', ten: 'Khiếu nại quyết định hành chính', trongSo: 3, khan: 'normal',
    tuKhoa: ['khieu nai', 'quyet dinh hanh chinh', 'xu phat sai', 'phat oan', 'cuong che',
      'thu hoi dat', 'boi thuong khong thoa dang', 'khong dong y quyet dinh',
      'to cao can bo', 'khieu nai quyet dinh'],
  },

  /* ---------- NHÓM 3: PHẢN ÁNH, KIẾN NGHỊ AN NINH TRẬT TỰ ---------- */
  {
    ma: 'tieng_on', nhom: 'phan_anh', ten: 'Tiếng ồn, karaoke', trongSo: 3, khan: 'normal',
    tuKhoa: ['tieng on', 'karaoke', 'hat hoa', 'loa keo', 'mo nhac to', 'on ao',
      'nhau nhet on', 'khong ngu duoc', 'am thanh lon', 'loa thung'],
  },
  {
    ma: 'tu_tap_gay_roi', nhom: 'phan_anh', ten: 'Tụ tập, gây rối trật tự', trongSo: 2, khan: 'important',
    tuKhoa: ['tu tap', 'gay roi', 'quay roi', 'thanh nien tu tap', 'gay mat trat tu',
      'lang thang dem khuya', 'gay su', 'chui boi', 'quay pha'],
  },
  {
    ma: 'giao_thong', nhom: 'phan_anh', ten: 'Giao thông, đua xe', trongSo: 2, khan: 'important',
    tuKhoa: ['dua xe', 'lang lach', 'danh vong', 'phong nhanh', 'chay au', 'xe container',
      'xe qua tai', 'do xe lan chiem', 'ket xe', 'vuot den do', 'khong doi mu bao hiem',
      'xe do che'],
  },
  {
    ma: 'ha_tang', nhom: 'phan_anh', ten: 'Hạ tầng, đèn đường, ngập nước', trongSo: 2, khan: 'normal',
    tuKhoa: ['den duong', 'den hong', 'duong hu', 'o ga', 'ngap nuoc', 'cong nghet',
      'via he hu', 'cau hong', 'sut lun', 'sat lo', 'mat nap cong'],
  },
  {
    ma: 'moi_truong', nhom: 'phan_anh', ten: 'Môi trường, vệ sinh', trongSo: 2, khan: 'normal',
    tuKhoa: ['o nhiem', 'rac thai', 'xa thai', 'hoi thoi', 'nuoc thai', 'khoi bui',
      'do rac bua bai', 'chan nuoi hoi', 'xac dong vat'],
  },
  {
    ma: 'lan_chiem', nhom: 'phan_anh', ten: 'Lấn chiếm lòng lề đường', trongSo: 2, khan: 'normal',
    tuKhoa: ['lan chiem', 'hang quan lan chiem', 'buon ban via he', 'che dù', 'bay ban',
      'chiem long duong', 'dung sap'],
  },
  {
    ma: 'phan_anh_chung', nhom: 'phan_anh', ten: 'Phản ánh, kiến nghị khác', trongSo: 1, khan: 'normal',
    tuKhoa: ['phan anh', 'kien nghi', 'bat an', 'lo lang', 'mong co quan', 'de nghi xu ly',
      'de nghi kiem tra', 'mong duoc quan tam'],
  },

  /* ---------- NHÓM 4: ĐỀ XUẤT, THẮC MẮC THỦ TỤC ---------- */
  {
    ma: 'thu_tuc', nhom: 'de_xuat', ten: 'Thủ tục hành chính', trongSo: 3, khan: 'normal',
    tuKhoa: ['cccd', 'can cuoc', 'chung minh nhan dan', 'vneid', 'dinh danh dien tu',
      'tam tru', 'tam vang', 'ho khau', 'thuong tru', 'ly lich tu phap', 'giay xac nhan',
      'lam ho chieu', 'dang ky xe', 'sang ten', 'giay phep lai xe', 'cong chung',
      'dich vu cong', 'ho so can gi', 'thu tuc'],
  },
  {
    ma: 'hoi_dap', nhom: 'de_xuat', ten: 'Hỏi đáp, thắc mắc', trongSo: 2, khan: 'normal',
    tuKhoa: ['cho hoi', 'xin hoi', 'muon hoi', 'hoi ve', 'thac mac', 'tu van',
      'huong dan giup', 'gio lam viec', 'lam o dau', 'bao nhieu tien', 'mat bao lau',
      'can giay to gi', 'lam sao de', 'the nao'],
  },
  {
    ma: 'gop_y', nhom: 'de_xuat', ten: 'Góp ý, đề xuất giải pháp', trongSo: 2, khan: 'normal',
    tuKhoa: ['gop y', 'de xuat', 'kien nghi giai phap', 'nen lap dat', 'nen tang cuong',
      'mong don vi', 'y kien dong gop', 'sang kien', 'cam on', 'khen ngoi', 'bieu duong'],
  },
];


/** Đếm số lần một cụm từ xuất hiện */
function demKhopCum(text, cum) {
  let n = 0, i = text.indexOf(cum);
  while (i !== -1) { n += 1; i = text.indexOf(cum, i + cum.length); }
  return n;
}

/**
 * Tìm chủ đề chi tiết nhất trong một nhóm.
 * @returns {{ ma: string, ten: string }|null}
 */
export function nhanDienChuDe(noiDung, nhom) {
  const t = ' ' + boDauCD(noiDung) + ' ';
  let tot = null, diemTot = 0;
  for (const cd of CHU_DE) {
    if (nhom && cd.nhom !== nhom) continue;
    let diem = 0;
    for (const kw of cd.tuKhoa) {
      const n = demKhopCum(t, kw);
      if (n > 0) diem += cd.trongSo * (kw.includes(' ') ? 1.4 : 1) * Math.min(n, 2);
    }
    if (diem > diemTot) { diemTot = diem; tot = cd; }
  }
  return tot ? { ma: tot.ma, ten: tot.ten } : null;
}

const boDauCD = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Liệt kê toàn bộ chủ đề — dùng cho thống kê và kiểm thử */
export function danhSachChuDe() {
  return CHU_DE.map((c) => ({ ma: c.ma, ten: c.ten, nhom: c.nhom }));
}
