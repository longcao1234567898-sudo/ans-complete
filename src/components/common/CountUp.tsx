/**
 * CountUp — số đếm TĂNG DẦN từ 0 khi người dùng cuộn tới.
 *
 * Dùng cho các con số thống kê (số ý kiến đã xử lý, tỉ lệ hài lòng...).
 * Tạo cảm giác "sống", chuyên nghiệp hơn hẳn con số đứng yên.
 *
 * Cách dùng:
 *   <CountUp to={1250} />
 *   <CountUp to={98} suffix="%" />
 *   <CountUp to={19.74} decimals={2} suffix="%" />
 */
import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

interface CountUpProps {
  to: number;
  duration?: number;   // giây
  decimals?: number;   // số chữ số thập phân
  prefix?: string;
  suffix?: string;
  className?: string;
}

export default function CountUp({
  to,
  duration = 1.6,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;

    // Người dùng bật "giảm chuyển động" -> hiện luôn số cuối
    if (reduce) {
      setValue(to);
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min((now - start) / (duration * 1000), 1);
      // easeOutExpo: chạy nhanh lúc đầu, chậm dần về cuối -> cảm giác mượt
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString('vi-VN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
