/**
 * Avatar trợ lý AI dùng ẢNH THẬT chú công an (public/media/police-avatar.png).
 * Thay cho hình SVG tự vẽ trước đây.
 */
interface Props {
  className?: string;
}

export default function PoliceAvatar({ className }: Props) {
  return (
    <img
      src="/media/police-avatar.png"
      alt="Trợ lý Công an thị xã Tân Châu"
      /* ⚠️ draggable={false} và pointer-events-none là BẮT BUỘC.

         Trình duyệt cho kéo thẻ ảnh sẵn. Ảnh này nằm trong nút nổi trợ lý —
         nút đó cho bà con kéo thả trên điện thoại. Nếu để nguyên, khi bà con
         giữ và kéo thì trình duyệt khởi động thao tác kéo ẢNH của nó và nuốt
         mất cử chỉ kéo nút: nút đứng im, tưởng chức năng hỏng.

         pointer-events-none đẩy mọi sự kiện chuột và chạm xuống thẻ cha, nên
         phần kéo và phần bấm đều do nút xử lý. */
      draggable={false}
      className={`pointer-events-none select-none rounded-full object-cover ${className ?? ''}`}
      loading="lazy"
      decoding="async"
    />
  );
}
