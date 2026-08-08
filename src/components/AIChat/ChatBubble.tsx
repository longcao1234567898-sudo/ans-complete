/**
 * Nút nổi (floating action button) để mở/đóng widget chat AI — có vòng ping thu hút chú ý.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import PoliceAvatar from '../common/PoliceAvatar';

interface ChatBubbleProps {
  open: boolean;
  onClick: () => void;
}

export default function ChatBubble({ open, onClick }: ChatBubbleProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}
      className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-900/20 transition-[bottom] duration-300 sm:right-6"
      /* Tự đẩy lên khi thanh chức năng đáy hiện ra, khỏi bị che */
      style={{ bottom: 'calc(1.25rem + var(--tab-bar-h, 0rem))' }}
    >
      {/* HAI VÒNG LAN so le 1,5 giây → gợn sóng êm như nhịp thở.

          LỖI ĐÃ SỬA: vòng thứ hai có animation-delay 1.5s, nhưng trong
          khoảng chờ đó trình duyệt CHƯA áp hiệu ứng nên phần tử hiện ở
          trạng thái CSS gốc — một khối tròn xanh ĐẶC che kín nút, rồi
          biến mất đột ngột khi hiệu ứng bắt đầu.

          Cách sửa: animation-fill-mode: backwards → trong lúc chờ dùng
          luôn trạng thái 0% của hiệu ứng (mờ 0.3), không còn nhấp nháy. */}
      {!open && (
        <>
          <span
            className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary-400 will-change-transform"
            style={{ animationFillMode: 'backwards' }}
            aria-hidden
          />
          <span
            className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary-400 will-change-transform"
            style={{ animationDelay: '1.5s', animationFillMode: 'backwards' }}
            aria-hidden
          />
        </>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={open ? 'close' : 'open'}
          initial={{ opacity: 0, rotate: -45 }}
          animate={{ opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, rotate: 45 }}
          transition={{ duration: 0.15 }}
          className="relative"
        >
          {open ? <X className="h-6 w-6" /> : <PoliceAvatar className="h-11 w-11" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
