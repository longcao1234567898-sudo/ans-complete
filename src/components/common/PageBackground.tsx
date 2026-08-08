/**
 * Nền ẢNH tĩnh cho các trang phụ (gửi ý kiến, tra cứu, tin tức, giới thiệu).
 * Dùng ảnh WebP nét (~155-180KB) thay cho video: nhẹ hơn, sắc nét hơn, không giật.
 * Lớp phủ trắng NHẠT: ảnh vẫn hiện rõ, chỉ được làm sáng/nhạt tông để chữ đọc được.
 */
interface Props {
  /** Tên file ảnh trong /public/media, ví dụ 'bg-nui-sam.webp' */
  image: string;
}

export default function PageBackground({ image }: Props) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <img
        src={`/media/${image}`}
        alt=""
        className="h-full w-full object-cover"
        loading="eager"
        decoding="async"
      />
      {/* Lớp phủ trắng nhạt — ảnh vẫn thấy rõ, chỉ nhạt đi để chữ nổi lên */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/55 to-white/70 dark:from-slate-950/75 dark:via-slate-950/70 dark:to-slate-950/80" />
    </div>
  );
}
