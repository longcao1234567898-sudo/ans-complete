/**
 * ScrollProgress — thanh mảnh chạy ngang trên cùng, cho biết đã cuộn tới đâu.
 *
 * Chi tiết nhỏ nhưng tạo cảm giác "web hiện đại" ngay lập tức.
 * Dùng useScroll của framer-motion -> chạy trên GPU, không giật.
 */
import { motion, useScroll, useSpring } from 'framer-motion';

export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();

  // Thêm độ nảy nhẹ -> thanh không chạy cứng nhắc mà "đuổi theo" mượt mà
  const width = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 32,
    restDelta: 0.001,
  });

  return (
    <motion.div
      style={{ scaleX: width }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-primary-600 via-accent-500 to-primary-500"
      aria-hidden
    />
  );
}
