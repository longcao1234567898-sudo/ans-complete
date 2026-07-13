/**
 * SpotlightCard — vệt sáng ĐI THEO CON TRỎ bên trong thẻ.
 *
 * Kỹ thuật: theo dõi vị trí chuột, đặt vào biến CSS (--mx, --my),
 * rồi vẽ một vầng sáng radial ở đúng chỗ đó. Chỉ tính toán khi rê chuột
 * vào thẻ nên không tốn hiệu năng.
 *
 * Đây là hiệu ứng hay gặp trên các web công nghệ hiện đại (Vercel, Linear).
 */
import { useRef, type ReactNode } from 'react';
import { cn } from '../../utils/helpers';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Màu vệt sáng (mặc định: xanh lá chủ đạo) */
  glow?: string;
}

export default function SpotlightCard({
  children,
  className,
  glow = 'rgba(27, 94, 32, 0.16)',
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={cn('group/spot relative overflow-hidden', className)}
    >
      {/* Vầng sáng đi theo con trỏ */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background: `radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), ${glow}, transparent 65%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
