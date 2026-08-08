/**
 * Nền video mờ cho các trang phụ (gửi ý kiến, tra cứu, tin tức, giới thiệu).
 * Video chạy lặp, phủ lớp trắng/tối mờ để nội dung phía trên luôn đọc rõ.
 * Video rất nhẹ (~130-200KB) nên không ảnh hưởng hiệu năng.
 */
interface Props {
  /** Tên file video trong /public/media, ví dụ 'bg-nui-sam.mp4' */
  video: string;
}

export default function PageBackground({ video }: Props) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <video
        className="h-full w-full object-cover"
        src={`/media/${video}`}
        autoPlay
        muted
        loop
        playsInline
      />
      {/* Lớp phủ để chữ đọc rõ trên mọi khung hình */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/92 via-white/88 to-white/95 dark:from-slate-950/92 dark:via-slate-950/90 dark:to-slate-950/95" />
    </div>
  );
}
