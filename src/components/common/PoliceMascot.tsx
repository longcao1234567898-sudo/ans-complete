/**
 * Bộ nhân vật "chú công an chibi" phiên bản HOẠT HÌNH:
 * - Viền đậm quanh mọi mảng hình (đặc trưng phim hoạt hình, hết cảm giác "búp bê")
 * - Miệng cười mở có lưỡi, mắt to long lanh biết chớp, lông mày biểu cảm
 * - Mũ kê-pi có vệt bóng, tay vẫy chuyển động
 * Toàn bộ là SVG thuần + transform CSS nên vẫn cực nhẹ với máy yếu.
 */

interface MascotProps {
  className?: string;
}

/* Bảng màu nhân vật */
const OUT = '#3D3A36'; // màu viền hoạt hình
const SKIN = '#FFE0BD';
const HAIR = '#5D4037';
const CAP = '#4E7F3A';
const CAP_DARK = '#2F5D24';
const SHIRT = '#62914A';
const SHIRT_DARK = '#4F7A3C';
const PANTS = '#55823F';
const RED = '#C62828';
const GOLD = '#FDD835';

/** Phần đầu hoạt hình dùng chung */
function Head() {
  return (
    <>
      {/* Mặt + tai có viền */}
      <ellipse cx="64" cy="74" rx="30" ry="28" fill={SKIN} stroke={OUT} strokeWidth="2.5" />
      <circle cx="33" cy="76" r="5" fill={SKIN} stroke={OUT} strokeWidth="2" />
      <circle cx="95" cy="76" r="5" fill={SKIN} stroke={OUT} strokeWidth="2" />
      {/* Tóc mái nâu ló dưới vành mũ */}
      <path d="M36 63 Q44 50 64 50 Q84 50 92 63 Q78 56 64 57 Q50 56 36 63 Z" fill={HAIR} />
      <rect x="33.5" y="62" width="4" height="9" rx="2" fill={HAIR} />
      <rect x="90.5" y="62" width="4" height="9" rx="2" fill={HAIR} />
      {/* Mũ kê-pi có viền + vệt bóng */}
      <path d="M30 54 Q31 24 64 22 Q97 24 98 54 Q64 42 30 54 Z" fill={CAP} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M40 33 Q48 25 60 24" stroke="#fff" strokeWidth="3" opacity=".35" strokeLinecap="round" fill="none" />
      <circle cx="64" cy="23" r="2" fill={CAP_DARK} />
      <path d="M30 54 Q64 42 98 54 L98 63 Q64 51 30 63 Z" fill={RED} stroke={OUT} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M36 62 Q64 72 92 62" stroke={GOLD} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M34 64 Q64 78 94 64 L94 70 Q64 84 34 70 Z" fill={CAP_DARK} stroke={OUT} strokeWidth="2" strokeLinejoin="round" />
      {/* Quốc huy cách điệu */}
      <path d="M52 52 Q47 40 57 33" stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M76 52 Q81 40 71 33" stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="64" cy="42" r="7" fill={RED} stroke={GOLD} strokeWidth="1.5" />
      <path d="M64 37.2 l1.5 3.1 3.4 .5 -2.5 2.4 .6 3.4 -3 -1.6 -3 1.6 .6 -3.4 -2.5 -2.4 3.4 -.5 Z" fill={GOLD} />
      {/* Lông mày biểu cảm (nhướn vui) */}
      <path d="M44 66 Q52 62 59 66" stroke={HAIR} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M69 66 Q76 62 84 66" stroke={HAIR} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* Mắt to long lanh, chớp định kỳ */}
      <g className="animate-blink" style={{ transformOrigin: '64px 78px' }}>
        <ellipse cx="52" cy="78" rx="6" ry="6.5" fill="#4E342E" />
        <ellipse cx="76" cy="78" rx="6" ry="6.5" fill="#4E342E" />
        <circle cx="52" cy="79.5" r="3" fill="#2B1B12" />
        <circle cx="76" cy="79.5" r="3" fill="#2B1B12" />
        <circle cx="49.6" cy="75.4" r="2.4" fill="#fff" />
        <circle cx="73.6" cy="75.4" r="2.4" fill="#fff" />
        <circle cx="54.4" cy="81" r="1.1" fill="#fff" opacity=".9" />
        <circle cx="78.4" cy="81" r="1.1" fill="#fff" opacity=".9" />
      </g>
      {/* Mũi + má hồng */}
      <circle cx="64" cy="85" r="1.5" fill="#F0B48A" />
      <circle cx="40" cy="86" r="5" fill="#FFAB91" opacity=".55" />
      <circle cx="88" cy="86" r="5" fill="#FFAB91" opacity=".55" />
      {/* Miệng cười MỞ có lưỡi — nét hoạt hình vui tươi */}
      <path d="M55 89 Q64 101 73 89 Q64 93.5 55 89 Z" fill="#6D3327" stroke={OUT} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M59.5 93.5 Q64 97.5 68.5 93.5 Q64 95.5 59.5 93.5 Z" fill="#F4837D" />
    </>
  );
}

/** Thân hoạt hình có viền: áo xanh lá mạ túi ngực, cầu vai đỏ, thắt lưng, quần, giày */
function Body() {
  return (
    <>
      <rect x="46" y="102" width="36" height="34" rx="10" fill={SHIRT} stroke={OUT} strokeWidth="2.5" />
      <path d="M58 102 L64 111 L70 102 Z" fill="#F5F5F0" />
      <path d="M51 102 L58 102 L54 110 Z" fill={SHIRT_DARK} />
      <path d="M77 102 L70 102 L74 110 Z" fill={SHIRT_DARK} />
      <path d="M53 103 l3.6 0 -2.4 4.4 Z" fill={RED} />
      <path d="M75 103 l-3.6 0 2.4 4.4 Z" fill={RED} />
      <line x1="64" y1="111" x2="64" y2="134" stroke={SHIRT_DARK} strokeWidth="1.5" />
      <circle cx="64" cy="116" r="1.6" fill={GOLD} />
      <circle cx="64" cy="123" r="1.6" fill={GOLD} />
      <circle cx="64" cy="130" r="1.6" fill={GOLD} />
      <rect x="50" y="115" width="10" height="8" rx="1.5" fill={SHIRT} stroke={SHIRT_DARK} strokeWidth="1.2" />
      <line x1="50" y1="118.4" x2="60" y2="118.4" stroke={SHIRT_DARK} strokeWidth="1.2" />
      <circle cx="55" cy="120.5" r="1" fill={GOLD} />
      <rect x="68" y="115" width="10" height="8" rx="1.5" fill={SHIRT} stroke={SHIRT_DARK} strokeWidth="1.2" />
      <line x1="68" y1="118.4" x2="78" y2="118.4" stroke={SHIRT_DARK} strokeWidth="1.2" />
      <circle cx="73" cy="120.5" r="1" fill={GOLD} />
      <rect x="44.5" y="101" width="9" height="4" rx="1.5" fill={RED} stroke={GOLD} strokeWidth="0.8" />
      <rect x="74.5" y="101" width="9" height="4" rx="1.5" fill={RED} stroke={GOLD} strokeWidth="0.8" />
      <rect x="46" y="132" width="36" height="6" fill="#3E5A2E" />
      <rect x="60.5" y="133" width="7" height="4" rx="1" fill={GOLD} />
      <rect x="51" y="138" width="11" height="20" rx="5" fill={PANTS} stroke={OUT} strokeWidth="2" />
      <rect x="66" y="138" width="11" height="20" rx="5" fill={PANTS} stroke={OUT} strokeWidth="2" />
      <ellipse cx="55.5" cy="160" rx="9" ry="4.8" fill="#263238" stroke={OUT} strokeWidth="2" />
      <ellipse cx="72.5" cy="160" rx="9" ry="4.8" fill="#263238" stroke={OUT} strokeWidth="2" />
    </>
  );
}

/** Ống tay hoạt hình: vẽ 2 lớp để có viền đậm quanh cánh tay cong */
function ArmTube({ d }: { d: string }) {
  return (
    <>
      <path d={d} stroke={OUT} strokeWidth="13.5" strokeLinecap="round" fill="none" />
      <path d={d} stroke={SHIRT} strokeWidth="9.5" strokeLinecap="round" fill="none" />
    </>
  );
}

/** Bàn tay có viền */
function Hand({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r="4.8" fill={SKIN} stroke={OUT} strokeWidth="2" />;
}

/** Cánh tay buông kèm băng trực ban đỏ */
function RestArm({ side }: { side: 'left' | 'right' }) {
  const x = side === 'left' ? 36 : 82.5;
  const handX = side === 'left' ? 40.8 : 87.3;
  return (
    <>
      <rect x={x} y="106" width="9.5" height="26" rx="4.75" fill={SHIRT} stroke={OUT} strokeWidth="2" />
      <rect x={x - 1} y="112" width="11.5" height="6" rx="1" fill={RED} stroke={GOLD} strokeWidth="0.9" />
      <Hand cx={handX} cy={134} />
    </>
  );
}

/** Ngôi sao lấp lánh trang trí */
function Sparkle({ x, y, delay = '0s' }: { x: number; y: number; delay?: string }) {
  return (
    <path
      d={`M${x} ${y} l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 Z`}
      fill={GOLD}
      className="animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}

/** Chú công an chào điều lệnh */
export function MascotSalute({ className }: MascotProps) {
  return (
    <svg viewBox="0 0 128 168" className={className} aria-hidden>
      <RestArm side="left" />
      <Body />
      <ArmTube d="M84 108 Q102 98 94 70" />
      <Hand cx={93} cy={66} />
      <Head />
    </svg>
  );
}

/** Chú công an vẫy tay chào */
export function MascotWave({ className }: MascotProps) {
  return (
    <svg viewBox="0 0 128 168" className={className} aria-hidden>
      <RestArm side="left" />
      <Body />
      <Head />
      <g className="animate-wave-hand" style={{ transformOrigin: '86px 108px' }}>
        <ArmTube d="M86 108 Q106 94 110 76" />
        <Hand cx={110} cy={72} />
      </g>
    </svg>
  );
}

/** Chú công an cầm kính lúp */
export function MascotSearch({ className }: MascotProps) {
  return (
    <svg viewBox="0 0 132 168" className={className} aria-hidden>
      <RestArm side="left" />
      <Body />
      <Head />
      <ArmTube d="M84 110 Q96 116 102 111" />
      <Hand cx={103} cy={111} />
      <line x1="106" y1="107" x2="111" y2="100" stroke="#455A64" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="116" cy="94" r="9" fill="#E3F2FD" fillOpacity=".85" stroke="#455A64" strokeWidth="3" />
      <path d="M111 90 Q114 87 118 88" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Chú công an giơ hai tay ăn mừng */
export function MascotCheer({ className }: MascotProps) {
  return (
    <svg viewBox="0 0 128 168" className={className} aria-hidden>
      <Body />
      <ArmTube d="M46 108 Q30 98 28 82" />
      <Hand cx={28} cy={78} />
      <ArmTube d="M82 108 Q98 98 100 82" />
      <Hand cx={100} cy={78} />
      <Head />
      <Sparkle x={14} y={52} />
      <Sparkle x={106} y={46} delay="0.6s" />
      <Sparkle x={64} y={4} delay="1.1s" />
    </svg>
  );
}

/** Thân nữ: áo như nam nhưng mặc VÁY, tóc dài hai bên */
function BodyFemale() {
  return (
    <>
      {/* Tóc dài xoã hai vai (vẽ sau lưng thân) */}
      <path d="M33 72 Q28 98 34 110 Q41 106 41 84 Z" fill={HAIR} />
      <path d="M95 72 Q100 98 94 110 Q87 106 87 84 Z" fill={HAIR} />
      <rect x="46" y="102" width="36" height="30" rx="10" fill={SHIRT} stroke={OUT} strokeWidth="2.5" />
      <path d="M58 102 L64 111 L70 102 Z" fill="#F5F5F0" />
      <path d="M51 102 L58 102 L54 110 Z" fill={SHIRT_DARK} />
      <path d="M77 102 L70 102 L74 110 Z" fill={SHIRT_DARK} />
      <path d="M53 103 l3.6 0 -2.4 4.4 Z" fill={RED} />
      <path d="M75 103 l-3.6 0 2.4 4.4 Z" fill={RED} />
      <line x1="64" y1="111" x2="64" y2="130" stroke={SHIRT_DARK} strokeWidth="1.5" />
      <circle cx="64" cy="116" r="1.6" fill={GOLD} />
      <circle cx="64" cy="123" r="1.6" fill={GOLD} />
      <rect x="44.5" y="101" width="9" height="4" rx="1.5" fill={RED} stroke={GOLD} strokeWidth="0.8" />
      <rect x="74.5" y="101" width="9" height="4" rx="1.5" fill={RED} stroke={GOLD} strokeWidth="0.8" />
      {/* Váy chữ A */}
      <path d="M46 130 L82 130 L90 152 L38 152 Z" fill={PANTS} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="46" y="128" width="36" height="5" fill="#3E5A2E" />
      {/* Chân + giày */}
      <rect x="52" y="152" width="8" height="9" rx="4" fill={SKIN} />
      <rect x="68" y="152" width="8" height="9" rx="4" fill={SKIN} />
      <ellipse cx="56" cy="163" rx="8" ry="4.2" fill="#263238" stroke={OUT} strokeWidth="2" />
      <ellipse cx="72" cy="163" rx="8" ry="4.2" fill="#263238" stroke={OUT} strokeWidth="2" />
    </>
  );
}

/** Nữ công an cầm máy tính bảng (hỗ trợ chuyển đổi số) */
export function MascotFemale({ className }: MascotProps) {
  return (
    <svg viewBox="0 0 128 172" className={className} aria-hidden>
      <BodyFemale />
      {/* Hai tay đưa ra trước ôm máy tính bảng */}
      <ArmTube d="M48 106 Q40 116 52 122" />
      <ArmTube d="M80 106 Q88 116 76 122" />
      {/* Máy tính bảng */}
      <rect x="47" y="114" width="34" height="23" rx="3" fill="#90A4AE" stroke={OUT} strokeWidth="2" />
      <rect x="50" y="117" width="28" height="17" rx="1.5" fill="#D6ECFF" />
      <line x1="53" y1="121" x2="72" y2="121" stroke="#7FB3D5" strokeWidth="2" strokeLinecap="round" />
      <line x1="53" y1="126" x2="66" y2="126" stroke="#7FB3D5" strokeWidth="2" strokeLinecap="round" />
      <Hand cx={52} cy={122} />
      <Hand cx={76} cy={122} />
      <Head />
    </svg>
  );
}

/** Robot trợ lý AI nhỏ đáng yêu */
export function RobotBuddy({ className }: MascotProps) {
  return (
    <svg viewBox="0 0 80 98" className={className} aria-hidden>
      {/* Ăng-ten */}
      <line x1="40" y1="12" x2="40" y2="4" stroke={OUT} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="40" cy="3.5" r="3" fill="#34D399" stroke={OUT} strokeWidth="1.5" />
      {/* Đầu + màn hình mặt */}
      <rect x="16" y="12" width="48" height="32" rx="15" fill="#F5F7FA" stroke={OUT} strokeWidth="2.5" />
      <rect x="23" y="18" width="34" height="20" rx="9" fill="#263238" />
      <circle cx="33" cy="28" r="4" fill="#34D399" className="animate-pulse" />
      <circle cx="47" cy="28" r="4" fill="#34D399" className="animate-pulse" />
      {/* Tay */}
      <rect x="8" y="52" width="8" height="18" rx="4" fill="#F5F7FA" stroke={OUT} strokeWidth="2" />
      <rect x="64" y="52" width="8" height="18" rx="4" fill="#F5F7FA" stroke={OUT} strokeWidth="2" />
      {/* Thân + đèn ngực */}
      <rect x="20" y="46" width="40" height="34" rx="13" fill="#F5F7FA" stroke={OUT} strokeWidth="2.5" />
      <circle cx="40" cy="62" r="6.5" fill="#E8FFF5" stroke="#34D399" strokeWidth="2.5" />
      <circle cx="40" cy="62" r="2.5" fill="#34D399" />
      {/* Chân */}
      <rect x="27" y="80" width="10" height="9" rx="4" fill="#CFD8DC" stroke={OUT} strokeWidth="2" />
      <rect x="43" y="80" width="10" height="9" rx="4" fill="#CFD8DC" stroke={OUT} strokeWidth="2" />
    </svg>
  );
}

/** Riêng phần đầu — avatar trợ lý AI */
export function MascotHead({ className }: MascotProps) {
  return (
    <svg viewBox="26 18 76 88" className={className} aria-hidden>
      <Head />
    </svg>
  );
}
