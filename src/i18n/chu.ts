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

  /* ---------- Tra cứu ---------- */
  'track.title': 'Tra cứu kết quả',
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
  'home.badge.247': 'Open around the clock',
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

  'track.title': 'Check your report',
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

  'lang.switchToEn': 'English',
  'lang.switchToVi': 'Tiếng Việt',
  'lang.label': 'Change language',
};

/** Lấy chữ theo ngôn ngữ. Thiếu bản dịch thì rơi về tiếng Việt. */
export function layChu(ngonNgu: NgonNgu, khoa: KhoaChu): string {
  if (ngonNgu === 'en') return EN[khoa] ?? VI[khoa];
  return VI[khoa];
}
