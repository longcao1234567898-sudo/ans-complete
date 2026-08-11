/**
 * Nền mờ cho các trang phụ (gửi ý kiến, tra cứu, tin tức, giới thiệu).
 *
 * ⚠️ ĐÃ BỎ NỀN VIDEO, CHUYỂN SANG ẢNH TĨNH.
 *
 * Lý do bỏ video:
 *   · Video chạy lặp liên tục làm máy nóng và tốn pin — bà con dùng điện thoại
 *     cũ, mở web mấy phút là máy nóng ran.
 *   · Tốn dung lượng 3G/4G mỗi lần vào trang, trong khi nền bị phủ trắng tới
 *     mức gần như không nhìn ra đang chuyển động.
 *   · Đây là trang để người dân tố giác tội phạm. Nền động làm loãng sự
 *     nghiêm túc mà một trang của cơ quan công an cần có.
 *
 * Ảnh .webp đã có sẵn cùng tên trong /public/media, nhẹ hơn nhiều lần và
 * hiện ra ngay không phải chờ tải.
 */
interface Props {
  /** Tên tệp ảnh nền trong /public/media, ví dụ 'bg-nui-sam.webp' */
  anh: string;
}

export default function PageBackground({ anh }: Props) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <img
        className="h-full w-full object-cover"
        src={`/media/${anh}`}
        alt=""
        loading="eager"
        decoding="async"
      />
      {/* ====================================================================
          LỚP PHỦ LÀM MỜ ẢNH NỀN

          ⚠️ DÙNG KIỂU NỘI TUYẾN, KHÔNG DÙNG LỚP TIỆN ÍCH.

          Trước đây viết from-white/94 ... to-white/97. Nhưng bảng độ mờ mặc
          định của Tailwind chỉ có tới /95 rồi nhảy thẳng lên /100 — các mức
          94, 96, 97 KHÔNG được sinh ra. Kết quả: gradient thiếu điểm dừng, lớp
          phủ gần như mất tác dụng, ảnh phong cảnh hiện nguyên bản đè lên chữ.

          Lỗi này không báo gì cả: mã dịch được, dựng được, chỉ có điều lớp CSS
          không tồn tại. Đã dựng thử bằng trình duyệt thật mới phát hiện ra.

          Viết thẳng rgba thì không phụ thuộc bảng giá trị nào, muốn bao nhiêu
          phần trăm cũng được.
          ==================================================================== */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            'linear-gradient(to bottom, rgba(255,255,255,.96) 0%, '
            + 'rgba(255,255,255,.955) 50%, rgba(255,255,255,.975) 100%)',
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            'linear-gradient(to bottom, rgba(2,6,23,.95) 0%, '
            + 'rgba(2,6,23,.93) 50%, rgba(2,6,23,.965) 100%)',
        }}
      />
    </div>
  );
}
