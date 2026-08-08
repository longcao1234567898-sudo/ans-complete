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
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-secondary-500 text-white shadow-lg shadow-primary-900/20 sm:bottom-6 sm:right-6"
    >
      {/* 2 vòng lan so le nhau 1.5s → gợn sóng liên tục, êm dịu như nhịp thở */}
      {!open && (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary-400 will-change-transform" aria-hidden />
          <span
            className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary-400 will-change-transform"
            style={{ animationDelay: '1.5s' }}
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
