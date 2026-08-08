/**
 * Reveal — bọc bất kỳ khối nào để nó HIỆN DẦN + TRƯỢT NHẸ LÊN khi người dùng
 * cuộn tới. Dùng framer-motion (đã có sẵn trong dự án).
 *
 * Cách dùng:
 *   <Reveal><SectionA /></Reveal>
 *   <Reveal delay={0.15}><SectionB /></Reveal>   // hiện trễ hơn một nhịp
 *
 * Tôn trọng người dùng bật "giảm chuyển động" trong hệ điều hành
 * (framer-motion tự xử lý qua useReducedMotion).
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Trễ bao nhiêu giây trước khi hiện (để các khối hiện lần lượt) */
  delay?: number;
  /** Trượt lên từ khoảng cách bao nhiêu px */
  distance?: number;
  className?: string;
}

export default function Reveal({ children, delay = 0, distance = 28, className }: RevealProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.21, 0.65, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
