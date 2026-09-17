/**
 * ĐA NGỮ — Tiếng Việt và English cho phần dành cho người dân.
 * ============================================================================
 *
 * VÌ SAO CÓ: địa bàn có người nước ngoài sinh sống và làm việc. Họ cũng có
 * quyền báo tin cho công an, nhưng trang toàn tiếng Việt thì không dùng được.
 *
 * ⚠️ CHỈ DỊCH PHẦN CỦA NGƯỜI DÂN. Trang quản trị giữ nguyên tiếng Việt: cán bộ
 *    là người Việt, dịch trang quản trị chỉ tốn công mà không ai dùng, lại
 *    thêm chỗ sai sót trong nghiệp vụ.
 *
 * ⚠️ TIẾNG VIỆT LÀ GỐC. Thiếu bản dịch tiếng Anh thì rơi về tiếng Việt chứ
 *    KHÔNG hiện mã khoá trơ trọi — người nước ngoài thấy chữ Việt còn đoán
 *    được, thấy "home.hero.title" thì chịu.
 *
 * CÁCH THÊM CHỮ MỚI: thêm một dòng vào cả hai bảng bên dưới, rồi dùng t('khoá')
 * trong component. Quên bản tiếng Anh thì tự rơi về tiếng Việt, không vỡ trang.
 */

export type NgonNgu = 'vi' | 'en';

/** Bảng chữ tiếng Việt — bản GỐC, luôn đầy đủ. */
export const VI = {
  /* ---------- Thanh menu ---------- */
  'nav.home': 'Trang chủ',
  'nav.send': 'Gửi ý kiến',
  'nav.track': 'Tra cứu',
  'nav.news': 'Tin tức',
  'nav.map': 'Bản đồ',
  'nav.blackspot': 'Điểm đen',
  'nav.about': 'Giới thiệu',
  'nav.admin': 'Quản trị',

  /* ---------- Trang chủ ---------- */
  'home.title': 'ĐIỂM CHẠM AN NINH',
  'home.subtitle': 'Tiếp nhận ý kiến công dân trực tuyến — gửi trong 1 phút, theo dõi tiến độ mọi lúc.',
  'home.cta.send': 'Gửi ý kiến ngay',
  'home.cta.sendSub': 'Gửi phản ánh, kiến nghị',
  'home.cta.track': 'Tra cứu kết quả',
  'home.cta.trackSub': 'Theo dõi tiến độ xử lý',
  'home.badge.247t': '24/7',
  'home.badge.247': 'Tiếp nhận trực tuyến',
  'home.badge.auto': 'Tự động phân loại',
  'home.badge.autoSub': 'Nhanh, giải thích rõ',
  'home.badge.fast': '1 phút',
  'home.badge.fastSub': 'Gửi ý kiến nhanh gọn',
  'home.badge.secure': 'Bảo mật',
  'home.badge.secureSub': 'Thông tin được bảo vệ',

  /* ---------- Cảnh giác lừa đảo ---------- */
  'fraud.title': 'Cảnh giác lừa đảo mạo danh công an',
  'fraud.body': 'Công an KHÔNG BAO GIỜ gọi điện hay nhắn tin hỏi mật khẩu, mã OTP, số tài khoản, '
              + 'hay bắt chuyển tiền để "chứng minh trong sạch". Ai làm vậy là kẻ lừa đảo — bà con '
              + 'hãy tắt máy và báo ngay cho công an.',

  /* ---------- Chung ---------- */
  'common.listen': 'Nghe',
  'common.back': 'Quay lại',
  'common.next': 'Tiếp tục',
  'common.skip': 'Bỏ qua',
  'common.close': 'Đóng',
  'common.loading': 'Đang tải…',
  'common.notRequired': 'không bắt buộc',
  'common.search': 'Tìm kiếm',

  /* ---------- Gửi ý kiến ---------- */
  'send.title': 'Gửi ý kiến',
  'send.subtitle': 'Chia sẻ tự nhiên — hệ thống giúp bà con diễn đạt rõ ràng và chuyển đến đúng bộ phận xử lý.',
  'send.step1': 'Nội dung',
  'send.step2': 'Phân tích',
  'send.step3': 'Chọn nhóm',
  'send.step4': 'Liên hệ',
  'send.step5': 'Xác nhận',


  /* ---------- Bước 1: kể sự việc ---------- */
  'f.stepOf': 'Bước {n} trên 5',
  'f1.title': 'Bước 1 trên 5 — Kể sự việc',
  'f1.hint': 'Bà con kể xem muốn báo chuyện gì. Có thể bấm nút micro để nói thay vì gõ, và bấm nút chụp ảnh nếu có hình.',
  'f1.anonTitle': 'Bà con sợ bị lộ danh tính?',
  'f1.anonBody': 'Với tố giác tin báo tội phạm, ở bước điền thông tin bà con có thể bật "Gửi ẩn danh" — không cần họ tên, số điện thoại hay email. Cán bộ không thể xem danh tính người gửi ẩn danh.',
  'f1.anonNote': 'Lưu ý: gửi ẩn danh thì cán bộ không liên hệ lại được để hỏi thêm. Bà con hãy viết thật đầy đủ ngay từ bây giờ (tối thiểu 50 chữ), kèm ảnh nếu có.',
  'f1.contentLabel': 'Nội dung ý kiến của bà con',
  'f1.tips': 'Bà con nên nêu rõ 4 điều sau',
  'f1.tipWhen': 'Thời gian',
  'f1.tipWhenD': 'ngày giờ xảy ra (hoặc "khoảng 8 giờ tối qua")',
  'f1.tipWhere': 'Địa điểm',
  'f1.tipWhereD': 'càng cụ thể càng tốt — số nhà, ấp/khóm, gần chỗ nào',
  'f1.tipWhat': 'Sự việc',
  'f1.tipWhatD': 'chuyện gì đã xảy ra, diễn biến ra sao',
  'f1.tipWho': 'Người liên quan',
  'f1.tipWhoD': 'đặc điểm nhận dạng, biển số xe (nếu biết)',
  'f1.placeholder': 'Bà con cứ chia sẻ tự nhiên, không cần đúng chính tả hay dấu câu — hệ thống sẽ tự hiểu. Ví dụ: co nguoi danh nhau gan ben pha tan chau...',
  'f1.noSpelling': 'Không bắt buộc đúng chính tả, dấu câu',
  'f1.voice': 'Nói thay vì gõ',
  'f1.images': 'Ảnh minh chứng',
  'f1.imagesGps': 'Ảnh tự động xoá vị trí GPS trước khi gửi',
  'f1.maxImages': 'ảnh tối đa, không bắt buộc',
  'f1.addImage': 'Thêm ảnh',
  'f1.camera': 'Chụp ảnh',
  'f1.video': 'Video minh chứng',
  'f1.videoWarn': 'Video giữ nguyên vị trí quay, khác với ảnh',
  'f1.recordVideo': 'Quay video',
  'f1.pickVideo': 'Chọn video',
  'f1.location': 'Vị trí xảy ra vụ việc',
  'f1.sendLocation': 'Gửi vị trí nơi xảy ra vụ việc',
  'f1.urgency': 'Mức độ khẩn cấp',

  /* ---------- Bước 2 ---------- */
  'f2.title': 'Bước 2 trên 5 — Máy xem lại',
  'f2.hint': 'Máy đọc lại lời bà con vừa kể và sắp xếp cho rõ ràng. Bà con xem có đúng ý không.',

  /* ---------- Bước 3 ---------- */
  'f3.title': 'Bước 3 trên 5 — Chọn loại việc',
  'f3.hint': 'Chọn nhóm việc phù hợp. Máy đã gợi ý sẵn, nếu đúng thì bấm đi tiếp.',

  /* ---------- Bước 4 ---------- */
  'f4.title': 'Bước 4 trên 5 — Cách liên hệ',
  'f4.hint': 'Bà con điền tên và số điện thoại, hoặc chọn gửi kín không cần cho tên.',
  'f4.name': 'Họ và tên',
  'f4.phone': 'Số điện thoại',
  'f4.email': 'Email',
  'f4.ward': 'Địa bàn xảy ra vụ việc',
  'f4.anonymous': 'Gửi ẩn danh — không cung cấp danh tính',

  /* ---------- Bước 5 ---------- */
  'f5.title': 'Bước 5 trên 5 — Kiểm lại và gửi',
  'f5.hint': 'Bà con đọc lại lần cuối rồi bấm gửi. Xong sẽ có mã tra cứu.',
  'f5.submit': 'Gửi ý kiến',

  /* ---------- Tra cứu ---------- */
  'track.title': 'Tra cứu tiến độ',
  'track.placeholder': 'Nhập mã tra cứu 6 ký tự',
  'track.button': 'Tra cứu',

  /* ---------- Tin tức ---------- */
  'news.title': 'Tin tức & Pháp luật',
  'news.all': 'Tất cả',
  'news.today': 'Hôm nay',
  'news.week': 'Trong tuần',

  /* ---------- Bản đồ ---------- */
  'map.title': 'Bản đồ an ninh địa bàn',
  'map.7days': '7 ngày qua',
  'map.30days': '30 ngày qua',
  'map.90days': '3 tháng qua',

  /* ---------- Điểm đen giao thông ---------- */
  'blackspot.title': 'Cảnh báo điểm đen giao thông',
  'blackspot.cases': 'vụ tai nạn',
  'blackspot.deaths': 'người tử vong',
  'blackspot.injured': 'người bị thương',

  /* ---------- Trang giới thiệu ---------- */
  'about.process': 'Quy trình xử lý',
  'about.commitment': 'Cam kết bảo mật',
  'about.replayGuide': 'Xem lại hướng dẫn sử dụng',

  /* ---------- Nút đổi ngôn ngữ ---------- */
  'lang.switchToEn': 'English',
  'lang.switchToVi': 'Tiếng Việt',
  'lang.label': 'Đổi ngôn ngữ',
} as const;

export type KhoaChu = keyof typeof VI;

/** Bảng chữ tiếng Anh. Thiếu dòng nào thì tự rơi về tiếng Việt. */
export const EN: Partial<Record<KhoaChu, string>> = {
  'nav.home': 'Home',
  'nav.send': 'Submit report',
  'nav.track': 'Track',
  'nav.news': 'News',
  'nav.map': 'Map',
  'nav.blackspot': 'Blackspots',
  'nav.about': 'About',
  'nav.admin': 'Admin',

  'home.title': 'SECURITY TOUCHPOINT',
  'home.subtitle': 'Report to your local police online — takes one minute, track progress anytime.',
  'home.cta.send': 'Submit a report',
  'home.cta.sendSub': 'Reports and suggestions',
  'home.cta.track': 'Check your report',
  'home.cta.trackSub': 'Track processing status',
  'home.badge.247t': '24/7',
  'home.badge.247': 'Online reception',
  'home.badge.auto': 'Automatic sorting',
  'home.badge.autoSub': 'Fast, with clear reasons',
  'home.badge.fast': '1 minute',
  'home.badge.fastSub': 'Quick and simple',
  'home.badge.secure': 'Confidential',
  'home.badge.secureSub': 'Your details are protected',

  'fraud.title': 'Beware of police impersonation scams',
  'fraud.body': 'Police will NEVER call or text you asking for passwords, OTP codes, bank account '
              + 'numbers, or demand money to "prove your innocence". Anyone doing so is a scammer — '
              + 'hang up and report it to the police.',

  'common.listen': 'Listen',
  'common.back': 'Back',
  'common.next': 'Continue',
  'common.skip': 'Skip',
  'common.close': 'Close',
  'common.loading': 'Loading…',
  'common.notRequired': 'optional',
  'common.search': 'Search',

  'send.title': 'Submit a report',
  'send.subtitle': 'Tell us in your own words — the system helps make it clear and routes it to the right unit.',
  'send.step1': 'Content',
  'send.step2': 'Review',
  'send.step3': 'Category',
  'send.step4': 'Contact',
  'send.step5': 'Confirm',


  'f.stepOf': 'Step {n} of 5',
  'f1.title': 'Step 1 of 5 — Tell us what happened',
  'f1.hint': 'Describe what you want to report. You can tap the microphone to speak instead of typing, or tap the camera button to add a photo.',
  'f1.anonTitle': 'Worried about revealing your identity?',
  'f1.anonBody': 'For crime reports, you can turn on "Report anonymously" at the contact step — no name, phone number or email needed. Officers cannot see who filed an anonymous report.',
  'f1.anonNote': 'Note: if you report anonymously, officers cannot contact you for follow-up questions. Please write as fully as you can now (at least 50 words) and add photos if you have them.',
  'f1.contentLabel': 'What you want to report',
  'f1.tips': 'Please try to include these 4 things',
  'f1.tipWhen': 'When',
  'f1.tipWhenD': 'date and time (or "around 8 last night")',
  'f1.tipWhere': 'Where',
  'f1.tipWhereD': 'as specific as possible — house number, hamlet, nearby landmark',
  'f1.tipWhat': 'What happened',
  'f1.tipWhatD': 'what took place and how it unfolded',
  'f1.tipWho': 'People involved',
  'f1.tipWhoD': 'appearance, vehicle plate number (if known)',
  'f1.placeholder': 'Just describe it naturally — spelling and punctuation do not matter, the system will understand. For example: people fighting near the Tan Chau ferry...',
  'f1.noSpelling': 'Spelling and punctuation do not need to be perfect',
  'f1.voice': 'Speak instead of typing',
  'f1.images': 'Photo evidence',
  'f1.imagesGps': 'GPS location is automatically removed from photos before sending',
  'f1.maxImages': 'photos max, optional',
  'f1.addImage': 'Add photo',
  'f1.camera': 'Take photo',
  'f1.video': 'Video evidence',
  'f1.videoWarn': 'Unlike photos, videos keep their recording location',
  'f1.recordVideo': 'Record video',
  'f1.pickVideo': 'Choose video',
  'f1.location': 'Where it happened',
  'f1.sendLocation': 'Send the location where it happened',
  'f1.urgency': 'Urgency level',

  'f2.title': 'Step 2 of 5 — Review',
  'f2.hint': 'The system rewrites what you said more clearly. Please check it says what you meant.',

  'f3.title': 'Step 3 of 5 — Choose a category',
  'f3.hint': 'Pick the category that fits. One is already suggested — if it looks right, just continue.',

  'f4.title': 'Step 4 of 5 — How to reach you',
  'f4.hint': 'Enter your name and phone number, or choose to report anonymously.',
  'f4.name': 'Full name',
  'f4.phone': 'Phone number',
  'f4.email': 'Email',
  'f4.ward': 'Ward where it happened',
  'f4.anonymous': 'Report anonymously — no personal details',

  'f5.title': 'Step 5 of 5 — Review and send',
  'f5.hint': 'Read it over one last time, then send. You will get a tracking code.',
  'f5.submit': 'Send report',

  'track.title': 'Track your report',
  'track.placeholder': 'Enter your 6-character tracking code',
  'track.button': 'Check',

  'news.title': 'News & Law',
  'news.all': 'All',
  'news.today': 'Today',
  'news.week': 'This week',

  'map.title': 'Local security map',
  'map.7days': 'Last 7 days',
  'map.30days': 'Last 30 days',
  'map.90days': 'Last 3 months',

  'blackspot.title': 'Traffic accident blackspots',
  'blackspot.cases': 'accidents',
  'blackspot.deaths': 'deaths',
  'blackspot.injured': 'injured',

  'about.process': 'How reports are handled',
  'about.commitment': 'Our privacy commitment',
  'about.replayGuide': 'Replay the walkthrough',
  'lang.switchToEn': 'English',
  'lang.switchToVi': 'Tiếng Việt',
  'lang.label': 'Change language',
};

/** Lấy chữ theo ngôn ngữ. Thiếu bản dịch thì rơi về tiếng Việt. */
export function layChu(ngonNgu: NgonNgu, khoa: KhoaChu): string {
  if (ngonNgu === 'en') return EN[khoa] ?? VI[khoa];
  return VI[khoa];
}
