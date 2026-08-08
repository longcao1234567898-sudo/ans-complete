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
      className={`rounded-full object-cover ${className ?? ''}`}
      loading="lazy"
      decoding="async"
    />
  );
}
