/**
 * Hằng số dùng chung toàn ứng dụng.
 * >>> Khi triển khai cho xã/phường khác: chỉ cần sửa hằng số UNIT bên dưới. <<<
 */
import type { CategoryInfo, FeedbackCategory } from '../types/feedback';
import type { StatusInfo, TrackingStatus } from '../types/tracking';
import type { NewsTag } from '../types/news';

/** Thông tin đơn vị vận hành hệ thống */
/* --------------------------------------------------------------------------
   BẬT/TẮT XÁC THỰC EMAIL

   Đặt false: bà con gửi ý kiến có danh tính KHÔNG phải chờ mã gửi về email.
   Toàn bộ mã xử lý OTP vẫn còn nguyên trong hệ thống — cả giao diện lẫn máy
   chủ — chỉ là không chạy tới. Muốn bật lại sau này thì đổi thành true, không
   phải viết lại gì.

   Vì sao tắt: khâu này thêm một bước chờ đợi, mà nhiều bà con lớn tuổi không
   quen mở hộp thư trên điện thoại. Chống người máy đã có Turnstile lo, chống
   spam đã có chặn theo thiết bị.
   -------------------------------------------------------------------------- */
export const BAT_XAC_THUC_EMAIL = false;

export const UNIT = {
  name: 'Công an thị xã Tân Châu',
  /** Tên rút gọn — dùng ở chỗ hẹp: nút gọi khẩn cấp, chân phiếu mã tra cứu */
  shortName: 'Công an thị xã Tân Châu',
  communeName: 'thị xã Tân Châu',
  province: 'tỉnh An Giang',
  address: 'Số 16 Phạm Hùng, khóm Long Thị D, phường Long Thạnh, thị xã Tân Châu, tỉnh An Giang',
  hotline: '0296 3822 154',
  emergency: '113',
  email: 'congan.tanchau@angiang.gov.vn',
  facebookUrl: 'https://www.facebook.com/conganthixatanchauangiang',
  websiteUrl: 'https://congan.angiang.gov.vn',
  /* ==========================================================================
     NHÓM ZALO CỦA ĐỊA BÀN — ba trường, một nguồn duy nhất

       zaloQrImage — ảnh mã QR để bà con quét vào nhóm
       zaloGroupName — tên nhóm, hiện phía trên mã
       zaloJoinUrl — đường dẫn mời; có thì khối thành nút bấm được, tiện cho
                     người xem trên máy tính vì không giơ camera lên màn hình
                     của chính mình được. Để rỗng thì khối chỉ hiện mã QR.

     ⚠️ TRƯỚC ĐÂY CÓ HAI BỘ TRƯỜNG SONG SONG cho cùng một nhóm Zalo:
     zaloQrImage/zaloGroupName (chân trang dùng) và zaloQrUrl/zaloName/
     zaloJoinUrl (không nơi nào dùng) — di chứng của khối Zalo bị nhân đôi.
     Hai bộ trỏ về HAI đường dẫn ảnh KHÁC NHAU, nên ai sửa nhầm bộ không dùng
     thì trang vẫn hiện mã cũ mà không hiểu vì sao. Nay gộp còn một bộ.

     ⚠️⚠️ ĐANG DÙNG ẢNH GIỮ CHỖ — PHẢI THAY TRƯỚC KHI BÀN GIAO.

     Đường dẫn cũ là 'https://i.ibb.co/LhQPys0h/zalo-qr.jpg'. Kiểm tra thực tế
     ngày đóng gói: nó KHÔNG trả về mã QR mà trả về một tấm ảnh chân dung
     người lạ 83x83. Cả hai đường dẫn cũ (zalo-qr.jpg và zalo-nhom.jpg) đều ra
     đúng tấm ảnh đó, vì ibb.co bỏ qua phần tên tệp và chỉ đọc mã LhQPys0h.

     Nghĩa là chân trang một trang web của Công an đang hiện ảnh mặt một người
     lạ ở đúng chỗ ghi "quét mã để vào nhóm". Đây chính là rủi ro mà chú thích
     bên dưới cảnh báo, và nó đã xảy ra thật.

     CÁCH THAY:
       1. Mở nhóm Zalo -> Tuỳ chọn -> Mã QR nhóm -> lưu ảnh về máy.
       2. Đặt ảnh vào public/media/ (ví dụ: zalo-qr.png).
       3. Đổi dòng zaloQrImage bên dưới thành '/media/zalo-qr.png'.

     ⚠️ PHẢI LÀ ĐƯỜNG DẪN ẢNH TRỰC TIẾP nếu vẫn muốn dùng link ngoài.
       Đúng : https://i.ibb.co/xxxxxxx/ten-anh.jpg   (mở ra thấy MỖI ảnh)
       Sai  : https://ibb.co/LhQPys0h                (trang có nút tải, quảng cáo)

     ⚠️ Mã QR nhóm Zalo THƯỜNG CÓ HẠN (khoảng 30 ngày). Hết hạn thì quét ra
     trang báo lỗi — bà con tưởng nhóm giải tán. Đơn vị nên đặt lịch xem lại
     hằng tháng, tạo mã mới rồi thay ảnh ở đây.

     ⚠️ Ảnh đặt trong public/media/ an toàn hơn hẳn link ngoài: trang chia sẻ
     ảnh miễn phí có thể đổi nội dung hoặc xoá ảnh bất cứ lúc nào mà không ai
     hay biết — đúng như trường hợp vừa gặp.

     Để rỗng zaloQrImage thì cả khối tự ẩn, không hiện ô trống.
     ========================================================================== */
  zaloQrImage: '/media/zalo-qr-chua-cap-nhat.svg',
  zaloGroupName: 'Nhóm Zalo An ninh trật tự',
  zaloJoinUrl: '',
};

/** Menu điều hướng chính */
export const NAV_LINKS = [
  { to: '/', label: 'Trang chủ' },
  { to: '/gui-y-kien', label: 'Gửi ý kiến' },
  { to: '/tra-cuu', label: 'Tra cứu' },
  { to: '/tin-tuc', label: 'Tin tức' },
  { to: '/gioi-thieu', label: 'Giới thiệu' },
];

/** 4 nhóm phân loại ý kiến */
export const CATEGORIES: CategoryInfo[] = [
  {
    id: 'to_giac',
    label: 'Tố giác tin báo',
    description: 'Tố giác, tin báo về tội phạm và hành vi vi phạm pháp luật',
    colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  {
    id: 'khieu_nai',
    label: 'Khiếu nại, tố cáo',
    description: 'Khiếu nại, tố cáo liên quan đến cán bộ, quy trình, thủ tục',
    colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  {
    id: 'phan_anh',
    label: 'Phản ánh, kiến nghị',
    description: 'Phản ánh tình hình an ninh trật tự, kiến nghị tại địa phương',
    colorClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  {
    id: 'de_xuat',
    label: 'Đề xuất, thắc mắc',
    description: 'Đề xuất giải pháp, thắc mắc về thủ tục hành chính',
    colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
];

/** Tra nhanh CategoryInfo theo id */
export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<FeedbackCategory, CategoryInfo>;

/** Thông tin hiển thị các trạng thái xử lý */
export const STATUS_MAP: Record<TrackingStatus, StatusInfo> = {
  pending_review: {
    id: 'pending_review',
    label: 'Chờ kiểm duyệt',
    description: 'Tin báo ẩn danh đang được cán bộ sàng lọc trước khi đưa vào xử lý',
    colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  spam: {
    id: 'spam',
    label: 'Không tiếp nhận',
    description: 'Nội dung không đủ căn cứ để thụ lý',
    colorClass: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  received: {
    id: 'received',
    label: 'Đã tiếp nhận',
    description: 'Hệ thống đã ghi nhận ý kiến và cấp mã tra cứu',
    colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  processing: {
    id: 'processing',
    label: 'Đang xử lý',
    description: 'Cán bộ phụ trách đang xác minh, giải quyết',
    colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  resolved: {
    id: 'resolved',
    label: 'Đã giải quyết',
    description: 'Ý kiến đã được giải quyết và có kết quả trả lời',
    colorClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  rejected: {
    id: 'rejected',
    label: 'Từ chối',
    description: 'Ý kiến không đủ điều kiện thụ lý (kèm lý do cụ thể)',
    colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
};

/** Nhãn + màu cho các tag tin tức */
export const NEWS_TAGS: Record<NewsTag, { label: string; colorClass: string }> = {
  an_ninh: { label: 'Tin an ninh', colorClass: 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' },
  canh_giac: { label: 'Cảnh giác', colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  thu_tuc: { label: 'Hướng dẫn thủ tục', colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  van_ban: { label: 'Văn bản mới', colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

/** Khoá localStorage */
export const STORAGE_KEYS = {
  submissions: 'htans_submissions',
  theme: 'htans_theme',
  chat: 'htans_chat_history',
  submitTimes: 'htans_submit_times',
};

/** Độ dài mã tra cứu */
export const TRACKING_CODE_LENGTH = 6;

/** Số ảnh minh chứng tối đa đính kèm mỗi ý kiến */
export const MAX_FEEDBACK_IMAGES = 3;

/** Cấu hình chống spam gửi ý kiến liên tục (áp dụng theo từng trình duyệt) */
export const ANTI_SPAM = {
  /** Thời gian chờ tối thiểu giữa 2 lần gửi */
  cooldownMs: 2 * 60_000,
  /** Số ý kiến tối đa trong 1 giờ */
  maxPerHour: 5,
  /** Khoảng thời gian chặn nội dung trùng lặp */
  duplicateWindowMs: 60 * 60_000,
};
