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


/* ==========================================================================
   TỪ KHOÁ TIẾNG ANH
   ==========================================================================

   VÌ SAO CẦN: người nước ngoài sinh sống trên địa bàn, hoặc bà con dùng
   công cụ dịch, có thể gửi ý kiến bằng tiếng Anh. Bảng tiếng Việt ở trên
   không bắt được chữ nào, nên mọi đơn tiếng Anh đều rơi vào nhóm mặc định
   "Phản ánh, kiến nghị" với độ tin cậy 0.3 — kể cả khi đó là tin tố giác
   tội phạm nghiêm trọng.

   ⚠️ QUY TẮC BẮT BUỘC KHI THÊM TỪ TIẾNG ANH — ĐỌC KỸ TRƯỚC KHI SỬA:

   Hàm khớp dùng includes(), tức KHỚP CHUỖI CON, KHÔNG có ranh giới từ.
   Mà văn bản đã được BỎ DẤU trước khi so. Hậu quả: rất nhiều từ tiếng Anh
   ngắn nằm lọt bên trong từ tiếng Việt đã bỏ dấu:

       'an'  nằm trong  "an ninh", "bán", "làm ăn", "an toàn"
       'co'  nằm trong  "có", "công", "cổng"
       'ban' nằm trong  "bán", "bàn", "ban đêm"
       'can' nằm trong  "cán bộ", "cần"
       'on'  nằm trong  "con", "còn", "không"
       'in'  nằm trong  "ninh", "tin", "xin"

   Thêm mấy từ đó là mọi đơn tiếng Việt đều bị chấm điểm sai.

   NÊN: chỉ dùng từ TỪ 4 KÝ TỰ TRỞ LÊN, và ưu tiên CỤM NHIỀU TỪ.
   Toàn bộ danh sách dưới đây đã được kiểm tra tự động: không từ nào khớp
   nhầm vào kho câu tiếng Việt mẫu.
   ========================================================================== */
const TU_KHOA_EN = {
  to_giac: [
    { diem: 10, chuDe: 'ma tuý', tu: [
      'drug', 'drugs', 'narcotic', 'heroin', 'meth lab', 'crystal meth', 'methamphetamine', 'cocaine', 'cannabis', 'marijuana',
      'drug dealer', 'selling drugs', 'drug trafficking'
    ] },
    { diem: 10, chuDe: 'trộm cắp', tu: [
      'theft', 'stolen', 'burglary', 'robbery', 'pickpocket', 'break in', 'broke into',
      'stole my', 'shoplifting'
    , 'be khoa','cay khoa','pha khoa','dot nhap','leo rao','lay cap','mat xe','mat dien thoai','mat vi','trom cho','vat nuoi bi mat'] },
    { diem: 10, chuDe: 'cướp', tu: [
      'mugging', 'mugged', 'armed robbery', 'snatch', 'snatched'
    ] },
    { diem: 10, chuDe: 'lừa đảo', tu: [
      'scam', 'scammer', 'scammed', 'fraud', 'fraudulent', 'swindle', 'phishing',
      'impersonating police', 'impersonate police', 'fake police',
      'transfer money to verify', 'otp code', 'verification code', 'investment scam',
      'job scam', 'easy money high salary', 'ponzi', 'pyramid scheme'
    ] },
    { diem: 10, chuDe: 'cờ bạc', tu: [
      'gambling', 'gamble', 'illegal betting', 'betting ring', 'casino illegal',
      'football betting', 'lottery ring'
    ] },
    { diem: 10, chuDe: 'tín dụng đen', tu: [
      'loan shark', 'loansharking', 'usury', 'predatory lending', 'debt collector threat',
      'threatening debt'
    ] },
    { diem: 10, chuDe: 'bạo lực', tu: [
      'assault', 'assaulted', 'beat up', 'beating', 'stabbed', 'stabbing', 'violence',
      'violent attack', 'domestic violence', 'abuse', 'abused', 'child abuse',
      'beat his wife', 'hit his wife'
    ] },
    { diem: 10, chuDe: 'xâm hại', tu: [
      'sexual assault', 'molest', 'molested', 'rape', 'raped', 'harassment sexual'
    ] },
    { diem: 10, chuDe: 'tính mạng', tu: [
      'murder', 'killed', 'homicide', 'death threat', 'threaten to kill', 'kidnap',
      'kidnapping', 'human trafficking'
    ] },
    { diem: 10, chuDe: 'vũ khí', tu: [
      'firearm', 'illegal weapon', 'explosive', 'gunshot', 'carrying gun'
    ] },
    { diem: 10, chuDe: 'hàng giả', tu: [
      'counterfeit', 'smuggling', 'contraband', 'fake goods', 'fake documents',
      'forged papers'
    ] },
    { diem: 10, chuDe: 'mại dâm', tu: [
      'prostitution', 'brothel', 'sex trade'
    ] },
    { diem: 8, chuDe: 'công nghệ cao', tu: [
      'hacked', 'hacking', 'account stolen', 'data leak', 'identity theft',
      'malicious link', 'malware', 'fake website'
    ] },
    { diem: 10, chuDe: 'tố giác chung', tu: [
      'report a crime', 'report crime', 'criminal activity', 'illegal activity',
      'suspicious activity', 'witness a crime',
      /* Bổ sung sau kiểm thử: bà con nước ngoài hay mở đầu bằng
         "I would like to report..." chứ không dùng chữ "crime". */
      'report a case', 'report an incident', 'would like to report', 'want to report',
      'wish to report', 'reporting an incident'
    ] },
  ],
  khieu_nai: [
    { diem: 10, chuDe: 'cán bộ vòi tiền', tu: [
      'bribe', 'bribery', 'asked for money', 'demanded money', 'corruption',
      'corrupt official', 'extortion by official', 'kickback'
    ] },
    { diem: 8, chuDe: 'thái độ', tu: [
      'rude officer', 'rude official', 'bad attitude', 'disrespectful staff',
      'unprofessional behaviour', 'unprofessional behavior'
    ] },
    { diem: 8, chuDe: 'chậm trễ', tu: [
      'delayed paperwork', 'delay processing', 'still not resolved',
      'no response for weeks', 'pending too long'
    ] },
    { diem: 10, chuDe: 'khiếu nại QĐ', tu: [
      'file a complaint', 'lodge a complaint', 'appeal the decision',
      'administrative decision', 'unfair fine', 'wrongful fine', 'dispute the penalty',
      'denounce official'
    ] },
  ],
  phan_anh: [
    { diem: 8, chuDe: 'tiếng ồn', tu: [
      'noise', 'noisy', 'loud music', 'karaoke loud', 'disturbing the peace',
      'noise pollution'
    ] },
    { diem: 8, chuDe: 'tụ tập', tu: [
      'loitering', 'gathering causing disorder', 'public disorder', 'rowdy group',
      'disturbance'
    ] },
    { diem: 8, chuDe: 'giao thông', tu: [
      'speeding', 'reckless driving', 'traffic violation', 'illegal parking',
      'street racing', 'drunk driving'
    ] },
    { diem: 8, chuDe: 'hạ tầng', tu: [
      'broken street light', 'streetlight', 'pothole', 'flooding', 'road damaged',
      'no lighting'
    ] },
    { diem: 8, chuDe: 'môi trường', tu: [
      'pollution', 'dumping waste', 'garbage dumping', 'sewage', 'littering',
      'bad smell factory'
    ] },
    { diem: 8, chuDe: 'lấn chiếm', tu: [
      'encroaching sidewalk', 'blocking the road', 'occupying pavement',
      'illegal construction'
    ] },
  ],
  de_xuat: [
    { diem: 8, chuDe: 'thủ tục', tu: [
      'procedure', 'how do i apply', 'how to apply', 'required documents',
      'paperwork needed', 'residence registration', 'temporary residence',
      'id card application', 'citizen id', 'passport application'
    ] },
    { diem: 8, chuDe: 'hỏi đáp', tu: [
      'i would like to ask', 'may i ask', 'could you tell me', 'what documents',
      'where should i go', 'opening hours', 'office hours'
    ] },
    { diem: 8, chuDe: 'đề xuất', tu: [
      'i suggest', 'my suggestion', 'recommendation', 'propose to install',
      'request more patrol', 'should install camera'
    ] },
  ],
};

const BANG_TU_KHOA = {
  /* ---- NHÓM 1: TỐ GIÁC TIN BÁO (hạn 20 ngày — Bộ luật TTHS 2015, Điều 147) */
  to_giac: {
    ten: 'Tố giác tin báo',
    nhom: [
      { diem: 10, chuDe: 'ma tuý', tu: ['ma tuy', 'chich hut', 'hut chich', 'choi da', 'bay lac', 'tang tru ma tuy', 'buon ban ma tuy', 'hang trang', 'con nghien', 'tiem chich', 'ke da', 'hang trang', 'di banh', 'thuoc lac', 'co my', 'bong cuoi', 'khi cuoi', 'bom keo', 'nuoc vui', 'tem giay', 'ban le ma tuy', 'tu diem ma tuy'] },
      { diem: 10, chuDe: 'cờ bạc', tu: ['danh bac', 'da ga', 'ghi de', 'ca do', 'xoc dia', 'lo de',
        /* ĐÃ BỎ 'so de' — cụm này nằm lọt trong "hồ sơ để lâu" (ho so de lau),
           là cách nói rất hay gặp trong đơn khiếu nại, khiến đơn khiếu nại bị
           xếp nhầm sang nhóm Tố giác với chủ đề Cờ bạc.
           Thay bằng các cụm dài hơn, không thể nhầm: */
        'choi so de', 'danh so de', 'ghi so de', 'so de online', 'bao so de', 'ca cuoc', 'sat phat', 'song bac'] },
      { diem: 10, chuDe: 'trộm cướp', tu: ['trom cap', 'trom xe', 'an trom', 'an cap', 'cuop', 'cuop giat', 'mat trom', 'be khoa', 'dot nhap', 'trom do'] },
      { diem: 10, chuDe: 'tín dụng đen', tu: ['cho vay nang lai', 'tin dung den', 'doi no thue', 'xiet no', 'lai suat cat co', 'khung bo doi no', 'tat den',
        'cho vay lai nang', 'vay lai nang', 'lai nang', 'rai to roi', 'to roi cho vay',
        'vay khong the chap', 'bat no', 'de doa con no', 'tat son', 'nem chat ban', 'vay app', 'app den', 'bom no', 'khung bo tinh than', 'goi cho nguoi than doi no', 'dang anh len mang doi no', 'ghep anh boi nho', 'giu giay to the chan'] },
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
      /* Chiếm đoạt tài nguyên, tài sản công — là hành vi VI PHẠM PHÁP LUẬT
         nên thuộc nhóm Tố giác, không phải Phản ánh. Trước đây thiếu hẳn. */
      { diem: 10, chuDe: 'chiếm đoạt tài nguyên', tu: [
        'cau trom dien', 'trom dien', 'trom nuoc', 'cau trom nuoc',
        'khai thac cat trai phep', 'hut cat trai phep', 'cat tac',
        'khai thac go trai phep', 'chat pha cay rung', 'pha rung', 'lam tac',
        'khai thac khoang san trai phep', 'san bat dong vat hoang da',
        'danh bat ca bang dien', 'kich dien bat ca', 'no min bat ca'] },
      { diem: 10, chuDe: 'vũ khí', tu: ['sung', 'vu khi', 'hung khi', 'dao kiem', 'vat lieu no', 'phao no', 'thuoc no', 'sung tu che',
        'dot phao', 'ban phao', 'phao lau', 'che tao phao', 'buon phao'] },
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
      { diem: 10, chuDe: 'đề xuất', tu: ['de xuat', 'gop y', 'y kien dong gop', 'nen co them', 'mong duoc bo sung', 'sang kien', 'de nghi bo sung',
        /* Bổ sung: hai dạng rất hay gặp mà trước rơi nhầm sang Phản ánh */
        'de nghi mo', 'de nghi to chuc', 'de nghi lap', 'de nghi bo tri',
        'de nghi tang cuong', 'tuyen truyen phap luat',
        'muon xin xac nhan', 'xin xac nhan', 'xin giay xac nhan', 'can xac nhan',
        'xin cap giay', 'xin cap lai', 'muon lam thu tuc'] },
      { diem: 6, chuDe: 'dịch vụ công', tu: ['dich vu cong', 'lam online', 'cong dich vu cong', 'vneid', 'dinh danh dien tu', 'nop truc tuyen'] },
      { diem: 6, chuDe: 'lịch làm việc', tu: ['gio lam viec', 'lam viec thu may', 'nghi trua', 'dia chi tru so', 'so dien thoai truc ban'] },
    ],
  },
};

/* --------------------------------------------------------------------------
   HỢP BẢNG TIẾNG VIỆT VÀ TIẾNG ANH

   Làm bằng mã thay vì chép tay từ khoá tiếng Anh vào từng dòng tiếng Việt.
   Lý do: giữ hai danh sách TÁCH RIÊNG thì sửa danh sách này không sợ làm
   hỏng danh sách kia, và nhìn vào biết ngay từ nào thuộc ngôn ngữ nào.
   -------------------------------------------------------------------------- */
for (const ma of Object.keys(TU_KHOA_EN)) {
  /* Lưu ý cấu trúc: BANG_TU_KHOA[ma] là một OBJECT { ten, nhom: [...] },
     mảng cụm từ khoá nằm ở thuộc tính .nhom chứ không phải ở gốc. */
  if (!BANG_TU_KHOA[ma]?.nhom) continue;
  BANG_TU_KHOA[ma].nhom.push(...TU_KHOA_EN[ma]);
}


/* ==========================================================================
   MỨC KHẨN CẤP
   ========================================================================== */

const TU_KHOA_KHAN = [
  'dang xay ra', 'ngay bay gio', 'ngay luc nay', 'vua moi xay ra', 'khan cap',
  'cap cuu', 'nguy hiem tinh mang', 'sap chet', 'bi thuong nang', 'mau',
  'dang danh nhau', 'dang danh', 'dang cuop', 'chay no', 'hoa hoan',
  /* ĐÃ BỎ 'chay nha' (cháy nhà) — sau khi bỏ dấu nó nằm lọt trong "chạy nhanh"
     (chay nhanh), khiến câu "xe tải chạy nhanh trong khu dân cư" bị báo KHẨN
     CẤP. Thay bằng các cụm dài hơn, không thể nhầm: */
  'chay nha dan', 'nha bi chay', 'chay nha hang xom', 'ngoi nha dang chay',
  'doa giet', 'doa danh', 'bat coc', 'tu tu', 'nhay cau', 'tre em bi',

  /* =====================================================================
     BỔ SUNG SAU KIỂM THỬ — bản trước bỏ sót 8/18 tình huống khẩn cấp thật.

     Nguyên nhân bỏ sót: danh sách cũ chỉ có dạng "đang + động từ"
     ("dang danh nhau", "dang cuop"). Nhưng bà con gọi báo lúc hoảng loạn
     thường viết theo cách khác hẳn:
       · Nêu HIỆN TƯỢNG đang thấy: "khói mù mịt", "có tiếng kêu cứu"
       · Nêu HẬU QUẢ: "nằm bất tỉnh", "chảy máu nhiều"
       · Nêu TÌNH THẾ của mình: "tôi đang trốn", "bị nhốt không ra được"
     Ba cách này đều khẩn cấp không kém, mà không có chữ "đang" đứng trước.
     ===================================================================== */

  /* -- Cháy nổ: bà con tả khói/lửa chứ ít khi viết đúng chữ "hoả hoạn" -- */
  'dang chay', 'chay lon', 'khoi mu mit', 'boc chay', 'lua chay', 'chay rui',
  'no binh gas', 'ro ri gas', 'mui gas nong nac', 'chap dien chay',

  /* -- Đang bị tấn công / truy đuổi -- */
  'ruot chem', 'ruot danh', 'dang chem', 'dang dam', 'dang hanh hung',
  'cam dao duoi', 'cam hung khi', 'vua bi dam', 'vua bi chem', 'vua bi danh',
  'dang pha cua', 'be khoa nha', 'cay cua', 'dot nhap nha',
  'trom con trong nha', 'ke trom con trong', 'dang trong nha toi',

  /* -- Hậu quả về người: dấu hiệu cần cấp cứu ngay -- */
  'bat tinh', 'ngat xiu', 'khong tinh', 'chay mau nhieu', 'mau chay nhieu',
  'gay xuong', 'thuong tich nang', 'nguy kich', 'kho tho', 'co giat',
  'tai nan giao thong', 'vua xay ra tai nan', 'dam xe', 'lat xe',

  /* -- Người bị khống chế / mất tích -- */
  'bi nhot', 'nhot trong nha', 'khong ra duoc', 'bi giam giu', 'bi khong che',
  'mat tich', 'chua ve nha', 'khong lien lac duoc', 'lac mat con',
  'con toi mat tich', 'khong thay con dau',

  /* -- Kêu cứu trực tiếp -- */
  'cuu toi', 'cuu voi', 'giup toi voi', 'xin cuu gap', 'cuu gap',
  'tieng keu cuu', 'keu cuu', 'la het', 'gao khoc',

  /* -- Đe doạ tức thời -- */
  'doa giet ca nha', 'se giet', 'dang doa', 'cam dao doa', 'doa dot nha',
  'dang dap pha', 'dap pha nha',

  /* -- Tự gây hại -- */
  'dinh nhay', 'muon chet', 'uong thuoc doc', 'cat tay', 'tu van',

  /* Tiếng Anh nối vào cuối file — xem KHAN_EN */
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

/* Đưa ra ngoài hàm để nối thêm dấu hiệu tiếng Anh ở cuối file.
   Trước đây khai báo bên trong hàm nên không bổ sung được. */
const DAU_HIEU_HOI = ['xin hoi', 'cho hoi', 'co the', 'lam sao', 'the nao',
  'bao nhieu', 'khi nao', 'o dau', 'can gi', 'phai lam gi'];

/** Nhận diện câu hỏi — dấu hiệu mạnh của nhóm "Đề xuất, thắc mắc" */
function laCauHoi(goc, khongDau) {
  if (goc.includes('?')) return true;
  return DAU_HIEU_HOI.some((d) => khongDau.includes(d));
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
      'can sa', 'co my', 'nuoc vui', 'tem giay', 'ke da', 'di banh', 'thuoc lac', 'co my', 'bong cuoi', 'khi cuoi', 'bom keo', 'nuoc vui', 'tem giay', 'tu diem ma tuy', 'ban le ma tuy'],
  },
  {
    ma: 'trom_cap', nhom: 'to_giac', ten: 'Trộm cắp tài sản', trongSo: 3, khan: 'important',
    tuKhoa: ['trom cap', 'an trom', 'an cap', 'trom xe', 'mat trom', 'bi trom', 'ke trom',
      'be khoa', 'pha khoa', 'cay tu', 'trom cho', 'bat trom cho', 'moc tui', 'thoi mien',
      'trom vat', 'lay cap', 'be khoa', 'cay khoa', 'pha khoa', 'dot nhap', 'leo rao', 'lay cap', 'mat xe', 'mat dien thoai', 'mat vi', 'trom cho', 'vat nuoi bi mat', 'cay tu', 'moc tui'],
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
    tuKhoa: ['danh bac', 'da ga', 'ghi de', 'ca do', 'ca cuoc', 'xoc dia',
      /* Bỏ 'so de' — xem giải thích ở bảng nhóm phía trên */
      'choi so de', 'danh so de', 'ghi so de', 'so de online',
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
      'bat no', 'de doa con no', 'canh ne', 'khoa cua doi no', 'tat son', 'vay app', 'app den', 'bom no', 'khung bo tinh than', 'doi no nguoi than', 'dang anh len mang', 'ghep anh boi nho', 'giu giay to the chan'],
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


/* --------------------------------------------------------------------------
   TỪ KHOÁ TIẾNG ANH CHO TỪNG CHỦ ĐỀ

   Cùng quy tắc như bảng nhóm: tối thiểu 4 ký tự, ưu tiên cụm nhiều từ, đã
   kiểm tra tự động là không khớp nhầm vào câu tiếng Việt.

   Riêng 'karaoke' giữ lại dù xuất hiện trong cả hai ngôn ngữ — đó là từ mượn,
   và trong cả hai trường hợp đều trỏ đúng chủ đề Tiếng ồn.
   -------------------------------------------------------------------------- */
const CHU_DE_EN = {
  ma_tuy: [
    'drug', 'drugs', 'narcotic', 'heroin', 'meth lab', 'crystal meth', 'methamphetamine', 'cocaine', 'cannabis', 'marijuana',
    'drug dealer', 'selling drugs', 'drug trafficking', 'drug addict'
  ],
  trom_cap: [
    'theft', 'stolen', 'stole my', 'burglary', 'break in', 'broke into', 'shoplifting',
    'pickpocket', 'my bike was stolen', 'motorbike stolen'
  ],
  cuop_giat: [
    'robbery', 'mugging', 'mugged', 'armed robbery', 'snatched my', 'bag snatching'
  ],
  lua_dao: [
    'scam', 'scammer', 'scammed', 'fraud', 'fraudulent', 'phishing', 'impersonating police',
    'impersonate police', 'fake police', 'transfer money to verify', 'otp code',
    'verification code', 'investment scam', 'job scam', 'fake website', 'ponzi',
    'pyramid scheme', 'lost all my savings', 'easy money high salary'
  ],
  danh_bac: [
    'gambling', 'gamble', 'illegal betting', 'betting ring', 'football betting',
    'underground casino', 'lottery ring'
  ],
  tin_dung_den: [
    'loan shark', 'loansharking', 'usury', 'predatory lending',
    'threatening my family for debt', 'debt collector', 'harassing for debt'
  ],
  gay_thuong_tich: [
    'assault', 'assaulted', 'beat up', 'beating', 'stabbed', 'stabbing',
    'fighting in the street', 'brawl', 'injured me'
  ],
  bao_hanh: [
    'domestic violence', 'husband beats', 'husband hits', 'wife beating', 'beats me',
    'beat me', 'hits me', 'child abuse', 'abusing his wife', 'abusing children',
    'my father beats', 'crying child neighbour'
  ],
  xam_hai: [
    'sexual assault', 'sexual harassment', 'molest', 'molested', 'rape', 'raped',
    'indecent exposure'
  ],
  giet_nguoi: [
    'murder', 'homicide', 'killed someone', 'death threat', 'threaten to kill',
    'threatened to kill me'
  ],
  bat_coc: [
    'kidnap', 'kidnapping', 'abduction', 'human trafficking', 'missing child', 'trafficked'
  ],
  vu_khi: [
    'firearm', 'illegal weapon', 'explosive', 'gunshot', 'carrying a gun', 'homemade bomb'
  ],
  buon_lau: [
    'smuggling', 'contraband', 'counterfeit', 'fake goods', 'fake documents',
    'forged papers', 'illegal import'
  ],
  mai_dam: [
    'prostitution', 'brothel', 'sex trade', 'sex workers operating'
  ],
  to_giac_chung: [
    'report a crime', 'report a case', 'report an incident', 'would like to report',
    'want to report', 'criminal activity', 'illegal activity', 'suspicious activity',
    'witnessed a crime'
  ],
  nhung_nhieu: [
    'bribe', 'bribery', 'asked for money', 'demanded money', 'corruption',
    'corrupt official', 'extortion', 'kickback', 'pay extra to speed up'
  ],
  thai_do_can_bo: [
    'rude officer', 'rude official', 'rude staff', 'bad attitude', 'disrespectful',
    'unprofessional behaviour', 'unprofessional behavior', 'shouted at me'
  ],
  ho_so_cham: [
    'delayed', 'delay', 'has been delayed', 'still not resolved', 'no response',
    'pending too long', 'waiting for weeks', 'waiting for months', 'never got a reply'
  ],
  quyet_dinh_sai: [
    'file a complaint', 'lodge a complaint', 'appeal the decision',
    'administrative decision', 'unfair fine', 'wrongful fine', 'dispute the penalty',
    'wrong decision', 'denounce official'
  ],
  tieng_on: [
    'noise', 'noisy', 'loud music', 'karaoke', 'disturbing the peace', 'noise pollution',
    'too loud at night'
  ],
  tu_tap_gay_roi: [
    'loitering', 'public disorder', 'rowdy', 'disturbance', 'gathering causing trouble',
    'drunk people gathering'
  ],
  giao_thong: [
    'speeding', 'reckless driving', 'traffic violation', 'illegal parking', 'street racing',
    'drunk driving', 'dangerous driving'
  ],
  ha_tang: [
    'street light', 'streetlight', 'broken light', 'pothole', 'flooding', 'road damaged',
    'no lighting', 'water logging'
  ],
  moi_truong: [
    'pollution', 'dumping waste', 'garbage', 'sewage', 'littering', 'bad smell',
    'waste into the canal', 'factory smoke'
  ],
  lan_chiem: [
    'encroaching', 'blocking the road', 'occupying pavement', 'occupying sidewalk',
    'illegal construction', 'built without permit'
  ],
  phan_anh_chung: [
    'complain about', 'want to reflect', 'bring to your attention'
  ],
  thu_tuc: [
    'procedure', 'how do i apply', 'how to apply', 'required documents', 'what documents',
    'paperwork needed', 'residence registration', 'temporary residence', 'citizen id',
    'id card application', 'passport application', 'criminal record certificate'
  ],
  hoi_dap: [
    'would like to ask', 'may i ask', 'could you tell me', 'where should i go',
    'opening hours', 'office hours', 'is it possible to'
  ],
  gop_y: [
    'i suggest', 'my suggestion', 'recommendation', 'propose to install',
    'request more patrol', 'should install', 'it would be better if'
  ],
};

/* Gộp vào bảng chủ đề tiếng Việt */
for (const cd of CHU_DE) {
  if (CHU_DE_EN[cd.ma]) cd.tuKhoa.push(...CHU_DE_EN[cd.ma]);
}


/* --------------------------------------------------------------------------
   BỘ TỪ KHOÁ TIẾNG ANH MỞ RỘNG

   Bổ sung cho 4 bộ phụ trợ mà bản trước bỏ sót hoàn toàn. Hậu quả nếu thiếu:
   một tin báo "someone is threatening to kill my family right now" bị xếp
   mức khẩn cấp BÌNH THƯỜNG — ngang với câu hỏi thủ tục hành chính.
   -------------------------------------------------------------------------- */

/* Chủ đề — bổ sung cách diễn đạt tự nhiên và biến thể Anh/Mỹ */
const CHU_DE_EN2 = {
  ma_tuy: [
    'drug den', 'drug use', 'using drugs', 'injecting drugs', 'drug needles', 'syringes',
    'ecstasy', 'ketamine', 'crystal meth', 'laughing gas', 'nitrous oxide', 'pills party',
    'smoking weed', 'growing cannabis', 'drug lab', 'selling pills', 'drug ring', 'pushers'
  ],
  trom_cap: [
    'thief', 'thieves', 'robbed my house', 'my house was robbed', 'my phone was stolen',
    'wallet stolen', 'bicycle stolen', 'stealing from', 'broke my lock', 'forced the door',
    'took my belongings', 'missing valuables', 'livestock stolen', 'stole cash'
  ],
  cuop_giat: [
    'snatch theft', 'grabbed my bag', 'pulled my phone', 'motorbike snatcher',
    'robbed at knifepoint', 'robbed at gunpoint', 'violent robbery', 'held me up'
  ],
  lua_dao: [
    'online scam', 'telephone scam', 'phone scam', 'text message scam', 'sms scam',
    'romance scam', 'dating scam', 'crypto scam', 'bitcoin scam', 'forex scam',
    'fake job offer', 'advance fee', 'deposit first', 'pay upfront then', 'click the link',
    'malicious link', 'fake bank message', 'fake delivery message', 'account frozen scam',
    'tax scam', 'electricity bill scam', 'prize scam', 'lottery scam', 'conned me',
    'ripped me off', 'tricked me into', 'duped', 'defrauded', 'lost my money to',
    'sent money to a stranger', 'gave them my otp', 'shared verification code',
    'fake official', 'pretending to be police', 'claims to be from the court',
    'court summons scam'
  ],
  danh_bac: [
    'betting site', 'online casino', 'online gambling', 'bookmaker', 'bookie',
    'cock fighting', 'card game for money', 'poker for money', 'dice game', 'slot machines',
    'placing bets', 'gambling den', 'gambling addiction ring'
  ],
  tin_dung_den: [
    'illegal lending', 'high interest loan', 'black credit', 'extortionate interest',
    'debt collectors harassing', 'threw paint at my house', 'threw dirty water',
    'posted my photo online', 'threatening messages about debt', 'forced to sign loan',
    'app loan harassment',
    'throws paint', 'throwing paint', 'paint at my house', 'dirty water at my house',
    'because of a loan', 'because of debt', 'owe money threats'
  ],
  gay_thuong_tich: [
    'punched', 'kicked', 'hit me with', 'attacked me', 'group attacked', 'street fight',
    'bar fight', 'brawl outside', 'wounded', 'bleeding', 'broken bones', 'hospitalised',
    'hospitalized',
    'a fight', 'fight happening', 'fighting now', 'with knives', 'with a knife',
    'people fighting', 'group fighting', 'attacked with'
  ],
  bao_hanh: [
    'beats his children', 'abusing his family', 'locked the child', 'starving the child',
    'elderly abuse', 'abusing elderly', 'neglecting children', 'screaming and hitting',
    'drunk and violent at home', 'threatens his wife', 'kicked out of the house',
    'being beaten', 'is beaten', 'beaten next door', 'hitting a child', 'hitting his child',
    'child crying next door', 'hears crying', 'violence at home', 'beating my',
    'beating her', 'beating him'
  ],
  xam_hai: [
    'inappropriate touching', 'touched me inappropriately', 'groping', 'stalking me',
    'sexual abuse of a minor', 'child sexual abuse', 'peeping', 'filming without consent',
    'revenge porn', 'sharing intimate photos'
  ],
  giet_nguoi: [
    'attempted murder', 'stabbed to death', 'beaten to death', 'found dead', 'body found',
    'threatening my life', 'wants to kill me', 'said he would kill',
    'threatening to kill', 'threatens to kill', 'going to kill', 'will kill me',
    'kill my family', 'kill me', 'kill him', 'kill her', 'wants me dead', 'tried to kill'
  ],
  bat_coc: [
    'took my child', 'child taken', 'forced into a car', 'held against her will',
    'held against his will', 'labour trafficking', 'labor trafficking', 'sold to a brothel',
    'lured abroad', 'cannot contact my daughter',
    'is missing', 'went missing', 'has gone missing', 'cannot find my daughter',
    'cannot find my son', 'disappeared since', 'not come home'
  ],
  vu_khi: [
    'knife attack', 'machete', 'carrying knives', 'illegal firearms', 'ammunition',
    'grenade', 'fireworks illegal', 'making explosives'
  ],
  buon_lau: [
    'counterfeit goods', 'fake branded', 'fake medicine', 'fake alcohol',
    'expired food sold', 'smuggled cigarettes', 'illegal wildlife', 'ivory trade',
    'fake certificates', 'forged licence', 'forged license'
  ],
  mai_dam: [
    'massage parlour front', 'massage parlor front', 'karaoke with girls', 'pimping',
    'soliciting'
  ],
  to_giac_chung: [
    'i witnessed', 'i saw someone', 'there is a man who', 'i suspect that',
    'happening in my neighbourhood', 'happening in my neighborhood', 'please investigate',
    'please look into this', 'need police attention', 'anonymous report'
  ],
  nhung_nhieu: [
    'under the table', 'asked for a bribe', 'wanted money to speed up', 'demanded a fee',
    'unofficial fee', 'extra charge not on receipt', 'no receipt given', 'abuse of power',
    'misuse of authority', 'favouritism', 'favoritism'
  ],
  thai_do_can_bo: [
    'very rude to me', 'treated me badly', 'ignored me', 'refused to help', 'shouted at me',
    'made me wait for hours', 'discriminated against me', 'arrogant officer'
  ],
  ho_so_cham: [
    'application stuck', 'processing too slow', 'passed the deadline', 'over the deadline',
    'promised but never', 'keep asking me to come back', 'sent me back and forth',
    'lost my documents'
  ],
  quyet_dinh_sai: [
    'i disagree with the decision', 'unjust decision', 'penalty is unfair',
    'fined without reason', 'revoke the decision', 'request reconsideration',
    'administrative appeal', 'wrongly accused', 'decision violates the law'
  ],
  tieng_on: [
    'construction noise', 'noise at night', 'shouting all night', 'barking dogs',
    'engine revving', 'loudspeakers', 'music until late', 'cannot sleep because of noise'
  ],
  tu_tap_gay_roi: [
    'youths gathering', 'drinking in public', 'causing trouble at night',
    'racing motorbikes at night', 'fighting in public', 'vandalism', 'graffiti',
    'breaking things'
  ],
  giao_thong: [
    'overloaded truck', 'trucks at night', 'no helmet', 'running red light',
    'wrong way driving', 'blocked traffic', 'accident happened', 'hit and run',
    'unsafe crossing', 'no traffic lights', 'children crossing danger'
  ],
  ha_tang: [
    'broken pavement', 'damaged road', 'manhole open', 'no drainage', 'power outage',
    'water supply problem', 'bridge damaged', 'dangerous electrical wires', 'fallen tree'
  ],
  moi_truong: [
    'air pollution', 'water pollution', 'chemical smell', 'burning rubbish', 'burning waste',
    'factory discharge', 'dead fish in the canal', 'open sewer', 'rubbish not collected',
    'stagnant water mosquitoes'
  ],
  lan_chiem: [
    'built on public land', 'extended into the alley', 'shop taking over the pavement',
    'parking on the sidewalk', 'blocking the fire lane', 'fence on public land'
  ],
  phan_anh_chung: [
    'i would like to reflect', 'bringing this to your attention', 'general feedback',
    'concern about the area', 'local issue'
  ],
  thu_tuc: [
    'household registration', 'permanent residence', 'change of address', 'police clearance',
    'criminal record check', 'judicial record', 'notarisation', 'notarization',
    'renew my id', 'lost my id card', 'replace id card', 'visa extension',
    'temporary stay declaration', 'foreigner registration', 'work permit'
  ],
  hoi_dap: [
    'what is the process', 'what should i do', 'do i need an appointment', 'is there a fee',
    'how long does it take', 'can i do it online', 'which office handles',
    'who should i contact'
  ],
  gop_y: [
    'it would help if', 'please consider adding', 'suggest improving', 'idea to improve',
    'more street lighting would', 'more patrols would help', 'community proposal',
    'would help', 'would be helpful', 'would be better', 'please install',
    'request to install', 'suggest installing', 'we need more', 'the area needs',
    'proposal to'
  ],
};
for (const cd of CHU_DE) {
  if (CHU_DE_EN2[cd.ma]) cd.tuKhoa.push(...CHU_DE_EN2[cd.ma]);
}

/* Dấu hiệu KHẨN CẤP — cần xử lý ngay */
const KHAN_EN = [
  'right now', 'happening now', 'is happening', 'currently happening', 'in progress',
  'just happened', 'a moment ago', 'emergency', 'urgent', 'urgently', 'immediately',
  'help me now', 'life threatening', 'about to die', 'dying', 'severely injured',
  'serious injury', 'bleeding heavily', 'unconscious', 'fire', 'house on fire', 'explosion',
  'being attacked', 'being beaten', 'attacking someone', 'threatening to kill',
  'threaten to kill', 'death threat', 'kidnapped', 'kidnapping in progress', 'suicide',
  'about to jump', 'trying to kill himself', 'trying to kill herself', 'child in danger',
  'armed', 'has a knife', 'has a gun', 'hostage',
  /* --- Bổ sung sau kiểm thử tiếng Anh (7/10 -> đủ) ---
     Ba nhóm bị sót, đều là cách người nước ngoài mô tả tình huống gấp:
       · Đột nhập đang diễn ra   : "broke into", "someone is inside"
       · Bị khống chế, không thoát: "locked inside", "cannot get out"
       · Kêu cứu                  : "screaming for help", "calling for help" */
  'broke into', 'breaking into', 'someone is inside', 'intruder', 'burglar inside',
  'forced the door', 'smashed the window', 'i am hiding', 'hiding from',
  'locked inside', 'locked in', 'cannot get out', 'can not get out', 'trapped',
  'held against', 'cannot escape', 'being held',
  'screaming for help', 'calling for help', 'crying for help', 'shouting for help',
  'help me now', 'please help urgently', 'someone screaming', 'hear screaming',
  'smoke everywhere', 'house on fire', 'building on fire', 'flames'
];

/* Dấu hiệu QUAN TRỌNG — kéo dài, nhiều người, nhóm yếu thế */
const QUAN_TRONG_EN = [
  'many times', 'repeatedly', 'every night', 'every day', 'for months', 'for weeks',
  'continues to', 'keeps happening', 'whole neighbourhood', 'whole neighborhood',
  'many households', 'many people affected', 'children', 'elderly', 'pregnant', 'disabled',
  'near the school', 'in front of the school', 'near the hospital', 'near the market',
  'vulnerable'
];

/* Có TRẺ EM liên quan — nâng mức ưu tiên */
const TRE_EM_EN = [
  'child', 'children', 'kids', 'minor', 'minors', 'student', 'students', 'schoolchildren',
  'my son', 'my daughter', 'baby', 'toddler', 'infant', 'under age', 'underage'
];

/* Dấu hiệu CÂU HỎI — để xếp vào nhóm Đề xuất, thắc mắc */
const HOI_EN = [
  'how do i', 'how can i', 'how long', 'how much', 'how many', 'what should',
  'what documents', 'what is the', 'where can i', 'where should', 'when can i', 'when will',
  'can i', 'could you', 'do i need', 'is there', 'are there', 'who should', 'which office',
  'please advise', 'please guide'
];

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


/* ==========================================================================
   NỐI CÁC BỘ TỪ KHOÁ TIẾNG ANH VÀO BỘ TIẾNG VIỆT

   Đặt ở CUỐI FILE vì các danh sách tiếng Anh được khai báo sau danh sách
   tiếng Việt. Nối sớm hơn sẽ lỗi "chưa khởi tạo biến".

   Các danh sách này chỉ được ĐỌC lúc chạy hàm phân loại, nên nối ở đây vẫn
   kịp — lúc có yêu cầu đầu tiên thì module đã nạp xong.
   ========================================================================== */
TU_KHOA_KHAN.push(...KHAN_EN);
TU_KHOA_QUAN_TRONG.push(...QUAN_TRONG_EN);
CO_TRE_EM.push(...TRE_EM_EN);
DAU_HIEU_HOI.push(...HOI_EN);

/* --------------------------------------------------------------------------
   ĐỒNG BỘ: từ khoá CHỦ ĐỀ tiếng Anh -> bảng QUYẾT ĐỊNH NHÓM

   Vì sao cần: hai bảng làm hai việc khác nhau (xem chú thích đầu file), nhưng
   về mặt logic chúng liên quan — một cụm chỉ ra chủ đề "Giết người, đe doạ
   tính mạng" thì đương nhiên cũng chỉ ra nhóm "Tố giác tin báo".

   Không đồng bộ thì xảy ra đúng tình huống này: câu
   "someone is threatening to kill my family" nhận đúng mức KHẨN CẤP nhưng bị
   xếp vào nhóm "Phản ánh, kiến nghị" — hạn xử lý 15 ngày thay vì 20 ngày, và
   không vào luồng tố giác.

   CHỈ đồng bộ phần TIẾNG ANH. Bảng tiếng Việt đã được cân chỉnh riêng qua
   nhiều vòng thử, đụng vào sẽ làm lệch kết quả đang đúng.
   -------------------------------------------------------------------------- */
for (const cd of CHU_DE) {
  const tuEn = [...(CHU_DE_EN[cd.ma] || []), ...(CHU_DE_EN2[cd.ma] || [])];
  if (tuEn.length === 0) continue;
  const bang = BANG_TU_KHOA[cd.nhom];
  if (!bang?.nhom) continue;
  bang.nhom.push({
    diem: cd.trongSo >= 3 ? 10 : 8,   // chủ đề càng đặc trưng, điểm càng cao
    chuDe: cd.ten.toLowerCase(),
    tu: tuEn,
  });
}


/* ==========================================================================
   KIỂM TRA NỘI DUNG CÓ ĐỦ RÕ ĐỂ TIẾP NHẬN CHƯA
   ==========================================================================

   Dùng ở bước 1 của biểu mẫu: nếu hệ thống không hiểu bà con đang trình báo
   việc gì thì mời viết lại rõ hơn, thay vì cho đi tiếp rồi cán bộ nhận được
   một đơn không xử lý được.

   ⚠️ CÂN NHẮC QUAN TRỌNG KHI ĐẶT NGƯỠNG:

   Chặn quá tay còn hại hơn cho lọt. Người tố giác bị từ chối một lần thường
   KHÔNG gửi lại lần hai — mất luôn nguồn tin, mà đó có thể là tin quan trọng
   nhất. Nhiều bà con lớn tuổi diễn đạt mộc mạc, không dùng từ ngữ mà bộ luật
   từ khoá biết trước.

   VÌ VẬY chỉ báo "chưa rõ" khi HỘI ĐỦ CẢ BA điều kiện:
     1. Không bắt được BẤT KỲ từ khoá nào (cả tiếng Việt lẫn tiếng Anh)
     2. Không nhận ra chủ đề nào
     3. Nội dung KHÔNG có dấu hiệu tối thiểu của một trình báo:
        không nói ở đâu, không nói khi nào, không nói ai/cái gì

   Chỉ thiếu một hoặc hai điều thì vẫn cho qua.
   ========================================================================== */

/* Dấu hiệu bà con có mô tả ĐỊA ĐIỂM */
const DAU_HIEU_NOI_CHON = [
  'o ap', 'tai ap', 'ap ', 'khom', 'xom', 'duong', 'hem', 'ngo',
  /* KHÔNG dùng 'to ' (tổ) — khớp vào chữ "to" trong MỌI câu tiếng Anh
     ("want to report", "how to apply"). Dùng cụm đầy đủ: */
  'to dan pho', 'to nhan dan',
  'gan nha', 'canh nha', 'truoc nha', 'sau nha', 'nha ong', 'nha ba', 'nha so',
  'khu vuc', 'dia chi', 'truong', 'benh vien', 'ben pha', 'cau ',
  /* KHÔNG dùng 'cho ' (chợ) — nó khớp vào "cho tôi", "cho biết", "cho phép",
     là những cụm có mặt trong hầu hết mọi câu, khiến cổng kiểm tra mất tác dụng.
     Thay bằng các cụm chỉ dùng khi thật sự nói về cái chợ: */
  'ngoai cho', 'trong cho', 'gan cho', 'o cho', 'khu cho', 'cho dem',
  'quan ', 'tiem ', 'cong ty', 'nha may', 'ubnd', 'tru so',
  /* tiếng Anh */
  'at the', 'near the', 'in front of', 'next door', 'my street', 'my alley',
  'my neighbourhood', 'my neighborhood', 'the market', 'the school', 'address',
];

/* Dấu hiệu bà con có mô tả THỜI ĐIỂM */
const DAU_HIEU_NOI_LUC = [
  'hom qua', 'hom nay', 'sang nay', 'chieu nay', 'toi qua', 'dem qua', 'rang sang',
  'tuan truoc', 'thang truoc', 'moi day', 'vua roi', 'lau nay', 'nhieu ngay',
  'nhieu thang', 'thuong xuyen', 'moi toi', 'moi ngay', 'gio', 'ngay ',
  /* tiếng Anh */
  'yesterday', 'today', 'last night', 'this morning', 'last week', 'last month',
  'every night', 'every day', 'recently', 'since', 'for weeks', 'for months',
];

/* Dấu hiệu bà con có nói tới NGƯỜI hoặc SỰ VIỆC */
const DAU_HIEU_NOI_AI = [
  'co nguoi', 'mot nguoi', 'nhom nguoi', 'thanh nien', 'ong ', 'hang xom',
  /* KHÔNG dùng 'ba ' — khớp vào "bà con", cụm có trong gần như mọi đơn */
  'ba ay', 'ba ta', 'anh ta', 'chi ta', 'co ta', 'nha ben', 'can bo', 'cong an', 'chu quan', 'nguoi la',
  'toi bi', 'toi thay', 'toi phat hien', 'toi nghi', 'phat hien', 'chung kien',
  /* Bổ sung sau kiểm thử: bà con hay kể qua người thân, nhất là chuyện của
     trẻ em. Thiếu mấy cụm này thì tin bắt nạt học đường bị chặn oan. */
  'con toi', 'chau toi', 'me toi', 'cha toi', 'bo toi', 'vo toi', 'chong toi',
  'em toi', 'ban toi', 'nguoi than', 'gia dinh toi', 'nha toi',
  'bi ban', 'bat nat', 'trong lop', 'cung lop', 'di hoc',
  'my child', 'my son', 'my daughter', 'my family', 'my wife', 'my husband',
  /* tiếng Anh */
  'someone', 'a man', 'a woman', 'a group', 'my neighbour', 'my neighbor',
  'i saw', 'i found', 'i suspect', 'i witnessed', 'there is', 'there are',
];

/**
 * Nội dung đã đủ rõ để tiếp nhận chưa?
 *
 * @param {string} noiDung
 * @returns {{ duRo: boolean, lyDo: string, goiY: string[] }}
 */
/* Câu chỉ nói Ý ĐỊNH trình báo, chưa nói nội dung gì.
   Những câu này KHỚP từ khoá "tố giác chung" nên bị coi là đã hiểu, trong khi
   thực tế cán bộ đọc xong vẫn không biết việc gì. */
const CHI_NOI_Y_DINH = [
  'muon trinh bao', 'can trinh bao', 'xin trinh bao', 'muon to giac',
  'muon phan anh', 'muon khieu nai', 'can giup do', 'xin giup do',
  'cho hoi', 'xin hoi', 'hoi mot chut', 'co viec can', 'co chuyen can',
  'want to report', 'would like to report', 'need help', 'need to report',
  'have something to report', 'wish to report', 'can you help',
  /* Bổ sung sau kiểm thử: các câu MỞ ĐẦU ĐƠN THƯ. Bà con quen viết theo lối
     hành chính — chào hỏi, nêu nguyện vọng — rồi mới vào việc. Nếu dừng ở đó
     mà bấm tiếp thì cán bộ nhận được một lá đơn không có nội dung. */
  'kinh gui', 'kinh thua', 'kinh de nghi', 'toi co y kien', 'toi xin co y kien',
  'toi co chuyen', 'toi co viec', 'co chuyen can trinh bao', 'co viec can trinh bao',
  'mong cac dong chi', 'mong quy co quan', 'mong co quan', 'mong duoc giai quyet',
  'mong duoc xem xet', 'de nghi xem xet giup', 'xem xet giup toi', 'giai quyet giup toi',
  'toi viet don nay', 'toi lam don nay', 'toi xin trinh bay', 'toi xin phan anh',
  'viec nay rat nghiem trong', 'su viec rat nghiem trong', 'rat buc xuc',
  'dear sir', 'dear madam', 'to whom it may concern', 'i am writing to',
  'please look into this', 'please investigate', 'please help me',
];

/** Bỏ phần "ý định" đi thì còn lại gì không?
 *
 *  ⚠️ Bỏ theo TỪ NGUYÊN VẸN, không bỏ theo chuỗi con.
 *  Bản trước dùng split/join trên cả từ đệm một chữ cái ('a', 'i', 'me'), nên
 *  "phát hiện" bị cắt thành "ph t h en" — vẫn ra kết quả đúng nhờ may mắn về
 *  độ dài, nhưng chỉ cần đổi ngưỡng một chút là sai hàng loạt.
 */
function conLaiGiSauYDinh(t) {
  let con = t;
  /* Cụm nhiều từ: bỏ theo chuỗi vì chúng là cụm cố định */
  for (const y of CHI_NOI_Y_DINH) con = con.split(y).join(' ');
  /* Bỏ các từ đệm không mang thông tin */
  const dem = ['mot viec','mot chuyen','viec nay','chuyen nay','something','a case',
    'an incident','a matter','toi','minh','a','the','is','are','to','of','please',
    'duoc khong','a la','va','voi','cho','ve',
    /* Bổ sung: từ đệm hành chính, không mang thông tin sự việc */
    'cong an xa','cong an','xa','ap','khom','quy co quan','co quan','dong chi',
    'cac dong chi','rat','nghiem trong','buc xuc','gap','a','ah','a.','xin','kinh',
    'giup','giup do','giai quyet','xem xet','y kien','trinh bay','phan anh','don nay',
    'sir','madam','concern','writing','investigate','help','me','my','i','we','you'];
  /* Từ đệm: bỏ theo TỪ NGUYÊN VẸN. Tách ra thành mảng rồi lọc, thay vì
     cắt chuỗi con — như vậy 'a' không ăn mất chữ 'a' trong "phát". */
  const boTu = new Set(dem.filter((d) => !d.includes(' ')));
  for (const d of dem) if (d.includes(' ')) con = con.split(d).join(' ');
  con = con
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !boTu.has(w))
    .join(' ');
  return con.trim();
}

export function kiemTraDuRo(noiDung) {
  const goc = String(noiDung || '').trim();
  const t = bo_dau(goc);

  /* Quá ngắn thì biểu mẫu đã chặn ở chỗ khác, ở đây không xét lại */
  if (t.length < 10) return { duRo: true, lyDo: '', goiY: [] };

  const kq = phanLoaiNoiDung(goc);

  const coTuKhoa = Array.isArray(kq.keywords) && kq.keywords.length > 0;
  const coChuDe = Boolean(kq.detectedTopic);

  const noiChon = DAU_HIEU_NOI_CHON.some((d) => t.includes(d));
  const noiLuc = DAU_HIEU_NOI_LUC.some((d) => t.includes(d));
  const noiAi = DAU_HIEU_NOI_AI.some((d) => t.includes(d));
  const soYeuTo = [noiChon, noiLuc, noiAi].filter(Boolean).length;

  /* Trường hợp riêng: câu CHỈ NÓI Ý ĐỊNH.
     Ví dụ "tôi muốn trình báo một việc" — khớp từ khoá "tố giác chung" nên
     hai điều kiện đầu đều đạt, nhưng cán bộ đọc xong vẫn không biết việc gì.
     Bỏ phần ý định đi mà còn lại quá ít chữ thì coi như chưa nói gì. */
  const conLai = conLaiGiSauYDinh(t);
  /* Ngưỡng nâng từ 12 lên 16 ký tự: sau khi bỏ hết phần "ý định" và từ đệm,
     còn dưới 16 ký tự thì không đủ để mô tả một sự việc.
     Bỏ luôn điều kiện !noiChon && !noiLuc — câu "kính gửi công an xã" có chữ
     "xã" bị tính là NÓI CHỖ, nên thoát được vòng kiểm dù chẳng nói việc gì. */
  const chiCoYDinh = conLai.length < 16;

  /* Đủ rõ nếu: bắt được từ khoá, HOẶC nhận ra chủ đề,
     HOẶC có ít nhất 1 trong 3 yếu tố ở đâu / khi nào / ai */
  if (!chiCoYDinh && (coTuKhoa || coChuDe || soYeuTo >= 1)) {
    return { duRo: true, lyDo: '', goiY: [] };
  }

  /* Tới đây là không hiểu được gì. Gợi ý đúng thứ còn thiếu. */
  const goiY = [];
  if (!noiAi) goiY.push('Ai liên quan, hoặc chuyện gì đã xảy ra');
  if (!noiChon) goiY.push('Xảy ra ở đâu — ấp/khóm, tên đường, gần nhà ai');
  if (!noiLuc) goiY.push('Xảy ra khi nào — hôm qua, tối nay, hay kéo dài nhiều ngày');

  return {
    duRo: false,
    lyDo: 'Hệ thống chưa xác định được bà con đang trình báo việc gì.',
    goiY,
  };
}
