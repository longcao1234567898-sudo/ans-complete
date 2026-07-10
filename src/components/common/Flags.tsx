/**
 * Cờ Tổ quốc và cờ Đảng tung bay — vẽ SVG thuần, phất cờ bằng transform skew
 * (chạy trên GPU, không tốn hiệu năng). Dùng trang trí trang chủ cho trang trọng.
 */

interface FlagProps {
  className?: string;
  /** Trễ nhịp phất để 2 lá cờ không bay cùng pha */
  delay?: string;
}

/** Cột cờ + đầu cột vàng */
function Pole() {
  return (
    <>
      <rect x="6" y="6" width="3" height="112" rx="1.5" fill="#C9A24B" />
      <circle cx="7.5" cy="5" r="3.2" fill="#FDD835" />
    </>
  );
}

/** Lá cờ dạng gợn sóng — phóng to chiếm gần trọn cột cờ cho bề thế */
const FLAG_SHAPE = 'M9 10 Q29 5 49 10 T79 10 L79 56 Q59 61 39 56 T9 56 Z';

/** Cờ Tổ quốc — nền đỏ sao vàng */
export function NationalFlag({ className, delay = '0s' }: FlagProps) {
  return (
    <svg viewBox="0 0 82 120" className={className} aria-hidden>
      <Pole />
      <g className="animate-flag-wave" style={{ transformOrigin: '9px 31px', animationDelay: delay }}>
        <path d={FLAG_SHAPE} fill="#DA251D" />
        <path
          transform="translate(44 33) scale(1.55)"
          d="M0 -10 L2.94 -3.09 L9.51 -3.09 L4.76 1.18 L5.88 8.09 L0 4 L-5.88 8.09 L-4.76 1.18 L-9.51 -3.09 L-2.94 -3.09 Z"
          fill="#FFDE00"
        />
      </g>
    </svg>
  );
}

/** Cờ Đảng — nền đỏ búa liềm vàng (cách điệu) */
export function PartyFlag({ className, delay = '0s' }: FlagProps) {
  return (
    <svg viewBox="0 0 82 120" className={className} aria-hidden>
      <Pole />
      <g className="animate-flag-wave" style={{ transformOrigin: '9px 31px', animationDelay: delay }}>
        <path d={FLAG_SHAPE} fill="#DA251D" />
        <g fill="#FFDE00" transform="translate(44 33) scale(1.25) translate(-40 -29)">
          {/* Liềm */}
          <path d="M48 20 a12 12 0 1 0 4 16 a9 9 0 1 1 -4 -16 Z" />
          <rect x="49" y="36" width="4" height="10" rx="1.8" transform="rotate(-38 51 38)" />
          {/* Búa */}
          <g transform="rotate(45 38 30)">
            <rect x="32.5" y="21" width="11" height="4.5" rx="1" />
            <rect x="36.4" y="21" width="3.2" height="17" rx="1.5" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Cặp cờ Đảng – cờ Tổ quốc đứng cạnh nhau theo nghi thức */
export function FlagPair({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="flex items-end">
        <PartyFlag className="h-full w-auto" />
        <NationalFlag className="-ml-5 h-full w-auto" delay="0.8s" />
      </div>
    </div>
  );
}
