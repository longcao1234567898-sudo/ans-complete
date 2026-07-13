/**
 * Magnetic — bọc bất kỳ nút nào để nó "HÚT" nhẹ về phía con trỏ khi rê chuột tới gần.
 *
 * Cảm giác nút có từ tính, sống động. Đây là hiệu ứng hay gặp trên các
 * trang web đoạt giải thiết kế (Awwwards).
 *
 * Nguyên lý: tính khoảng lệch giữa con trỏ và tâm nút, dịch nút đi một
 * phần nhỏ của khoảng lệch đó (strength). Rời chuột -> nút bật về chỗ cũ
 * với hiệu ứng lò xo.
 *
 * Tự TẮT trên thiết bị cảm ứng (điện thoại không có con trỏ).
 */
import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

interface MagneticProps {
  children: ReactNode;
  /** Độ hút: 0.1 = nhẹ nhàng, 0.4 = bám mạnh */
  strength?: number;
  className?: string;
}

export default function Magnetic({ children, strength = 0.22, className }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Lò xo -> nút không dịch cứng nhắc mà "đuổi theo" con trỏ rồi bật về
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * strength);
    y.set((e.clientY - cy) * strength);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x: sx, y: sy }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
