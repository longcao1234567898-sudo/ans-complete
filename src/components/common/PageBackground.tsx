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
      {/*
        LỚP PHỦ TRẮNG — nâng từ 88-95% lên 94-97%.

        Vì sao nâng: ở mức cũ, ảnh phong cảnh còn hiện rõ đường nét, mắt bị hút
        vào nền thay vì vào nội dung. Nâng lên thì ảnh chỉ còn là sắc nền rất
        nhạt, hoà vào giao diện — nhìn như một tấm nền thiết kế sẵn chứ không
        phải ảnh chụp dán vào.

        Cũng giúp chữ đọc rõ trên MỌI vùng của ảnh, kể cả chỗ sáng nhất.
      */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/95 via-white/94 to-white/97 dark:from-slate-950/94 dark:via-slate-950/92 dark:to-slate-950/96" />
    </div>
  );
}
