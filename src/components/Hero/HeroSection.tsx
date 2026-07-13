/**
 * Hero với NỀN VIDEO chuyển động. Giữ lại các khung nội dung (banner đơn vị,
 * tiêu đề + nhãn AI, 2 nút CTA, dải 4 thẻ tính năng, huy hiệu bảo mật, thẻ QR,
 * dải cam kết). Đã bỏ toàn bộ nhân vật SVG và cảnh sông nước.
 */
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Bot, Clock3, Mail, QrCode, Search, ShieldCheck, Zap } from 'lucide-react';

/** 4 thẻ tính năng nổi bật */
const STATS = [
  { Icon: Clock3, title: '24/7', sub: 'Tiếp nhận trực tuyến', color: 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300' },
  { Icon: Bot, title: 'AI phân loại', sub: 'Tự động, chính xác', color: 'bg-secondary-100 text-secondary-500 dark:bg-secondary-500/20 dark:text-secondary-400' },
  { Icon: Zap, title: '1 phút', sub: 'Gửi ý kiến nhanh gọn', color: 'bg-accent-100 text-accent-600 dark:bg-accent-500/20 dark:text-accent-500' },
  { Icon: ShieldCheck, title: 'Bảo mật', sub: 'Thông tin được bảo vệ', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' },
];

/** Dải cam kết dưới cùng */
const TRUST_ITEMS = [
  'Mọi phản ánh đều được bảo mật',
  'Được tiếp nhận bởi Công an thị xã Tân Châu',
  'Vì một Tân Châu bình yên và phát triển',
];

/** Quốc huy cách điệu vàng của đơn vị */
function UnitEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M32 3 L57 11 v17 c0 15 -10 26 -25 30 C17 54 7 43 7 28 V11 Z" fill="#F5C542" stroke="#B8891B" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 22 Q10 34 18 44" stroke="#B8891B" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M51 22 Q54 34 46 44" stroke="#B8891B" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="28" r="13" fill="#C62828" stroke="#B8891B" strokeWidth="2" />
      <path d="M32 18.5 l3 6.1 6.7 1 -4.9 4.7 1.2 6.7 -6 -3.2 -6 3.2 1.2 -6.7 -4.9 -4.7 6.7 -1 Z" fill="#FDD835" />
    </svg>
  );
}

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      {/* NỀN VIDEO chuyển động */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/media/hero-bg.mp4"
        autoPlay
        muted
        loop
        playsInline
        poster="/media/police-assistant.png"
        aria-hidden
      />
      {/* Lớp phủ gradient để chữ luôn đọc rõ trên mọi khung hình video */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/85 via-white/70 to-white/90 dark:from-slate-950/85 dark:via-slate-950/70 dark:to-slate-950/90" aria-hidden />

      {/* Huy hiệu Bảo mật góc trái */}
      <div className="glass absolute left-4 top-4 z-10 hidden items-center gap-2 rounded-2xl px-3 py-2 md:flex" aria-hidden>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span className="text-[10px] font-extrabold leading-tight text-primary-700 dark:text-primary-300">
          BẢO MẬT<br />TUYỆT ĐỐI
        </span>
      </div>

      {/* Thẻ QR góc phải */}
      <Link
        to="/tra-cuu"
        className="glass absolute right-4 top-4 z-10 hidden flex-col items-center gap-1 rounded-2xl px-3.5 py-2.5 transition-transform will-change-transform hover:-translate-y-0.5 md:flex"
        aria-label="Đi đến trang quét mã tra cứu"
      >
        <QrCode className="h-9 w-9 text-primary-600 dark:text-primary-300" />
        <span className="text-[10px] font-extrabold text-primary-700 dark:text-primary-300">QUÉT MÃ TRA CỨU</span>
      </Link>

      <div className="container-page relative z-[1] pb-24 pt-8 text-center sm:pb-28 sm:pt-10">
        {/* Banner đơn vị + quốc huy */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mb-7 flex items-center justify-center gap-3">
          <UnitEmblem className="h-12 w-12 sm:h-14 sm:w-14" />
          <div className="text-left leading-tight">
            <p className="text-lg font-extrabold tracking-wide text-primary-700 dark:text-primary-300 sm:text-xl">CÔNG AN THỊ XÃ TÂN CHÂU</p>
            <p className="text-xs italic text-slate-600 dark:text-slate-400">Vì nước quên thân, vì dân phục vụ</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <h1 id="hero-title" className="mx-auto max-w-4xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            <span className="text-gradient">HỘP THƯ AN NINH SỐ</span>
            <span className="ml-3 inline-flex -translate-y-1.5 items-center rounded-xl border-2 border-primary-500 bg-white/80 px-2.5 py-0.5 align-middle text-base font-black text-primary-600 dark:bg-slate-800 dark:text-primary-300 sm:-translate-y-3 sm:text-xl">AI</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base font-medium text-slate-700 dark:text-slate-200 sm:text-lg">
            Tiếp nhận ý kiến công dân thông minh với AI — gửi trong 1 phút, theo dõi tiến độ mọi lúc.
          </p>

          {/* 2 nút CTA 2 dòng */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/gui-y-kien" className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-500 px-6 py-3 text-left text-white shadow-soft transition-transform will-change-transform hover:-translate-y-0.5 sm:w-auto">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><Mail className="h-5 w-5" aria-hidden /></span>
              <span>
                <span className="block text-base font-bold leading-tight">Gửi ý kiến ngay</span>
                <span className="block text-[11px] text-white/85">Gửi phản ánh, kiến nghị</span>
              </span>
            </Link>
            <Link to="/tra-cuu" className="btn-shine group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-secondary-500 to-secondary-600 px-6 py-3 text-left text-white shadow-soft transition-transform will-change-transform hover:-translate-y-0.5 sm:w-auto">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><Search className="h-5 w-5" aria-hidden /></span>
              <span>
                <span className="block text-base font-bold leading-tight">Tra cứu kết quả</span>
                <span className="block text-[11px] text-white/85">Theo dõi tiến độ xử lý</span>
              </span>
            </Link>
          </div>

          {/* Dải 4 thẻ tính năng */}
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 lg:grid-cols-4">
            {STATS.map(({ Icon, title, sub, color }, idx) => (
              <motion.div key={title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + idx * 0.1 }} className="flex items-center gap-3 rounded-2xl bg-white/90 p-3.5 text-left shadow-soft dark:bg-slate-900/90">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" aria-hidden /></span>
                <span>
                  <span className="block text-sm font-extrabold text-slate-800 dark:text-slate-100">{title}</span>
                  <span className="block text-[11px] leading-tight text-slate-500 dark:text-slate-400">{sub}</span>
                </span>
              </motion.div>
            ))}
          </div>

          {/* Dải cam kết */}
          <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap">
            {TRUST_ITEMS.map((item) => (
              <span key={item} className="glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
