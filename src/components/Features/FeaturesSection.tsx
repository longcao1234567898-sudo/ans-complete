/**
 * Khu vực giới thiệu 3 tính năng AI cốt lõi kèm demo trực quan cho từng tính năng.
 *
 * ============================================================================
 * BA THẺ KỂ MỘT CÂU CHUYỆN, KHÔNG PHẢI BA MẨU RỜI
 *
 * Cả ba thẻ nay bám theo ĐÚNG MỘT tin nhắn mẫu: câu bà con gõ vội không dấu ở
 * thẻ 1, được xếp vào nhóm nào ở thẻ 2, rồi đi qua các bước xử lý ở thẻ 3.
 *
 * Trước đây mỗi thẻ minh hoạ một thứ không liên quan: thẻ 2 chỉ liệt kê bốn
 * cái nhãn, thẻ 3 vẽ ba vòng tròn đứng im. Người xem đọc xong vẫn không hình
 * dung được ý kiến của mình sẽ đi đâu — mà đó mới là điều họ muốn biết trước
 * khi quyết định có gửi hay không.
 * ============================================================================
 */
import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { BrainCircuit, GitBranch, SearchCheck } from 'lucide-react';
import FeatureCard from './FeatureCard';
import Badge from '../common/Badge';
import { CATEGORIES, STATUS_MAP } from '../../utils/constants';
import { cn } from '../../utils/helpers';

const DEMO_INPUT = 'co nguoi danh nhau gan ben pha tan chau';
const DEMO_OUTPUT = 'Phản ánh vụ việc đánh nhau gần bến phà Tân Châu';
/** Nhóm mà câu mẫu trên sẽ rơi vào — dùng chung cho thẻ 2 */
const DEMO_CATEGORY = 'phan_anh';

/* ============================================================================
   DEMO CHỈ CHẠY KHI ĐÃ LỌT VÀO MÀN HÌNH

   ⚠️ Đây là lỗi cũ đáng kể: hiệu ứng gõ chữ chạy ngay lúc component dựng xong,
   mà khu vực này nằm tít dưới trang chủ. Đến khi bà con cuộn tới nơi thì chữ
   đã gõ xong từ lâu — thấy đúng một dòng chữ tĩnh với con trỏ nhấp nháy vô
   nghĩa. Công sức làm hiệu ứng đổ sông đổ biển vì không ai kịp nhìn.

   useInView đợi thẻ hiện ra rồi mới bắt đầu, nên ai cũng thấy từ đầu.
   ============================================================================ */

/** Demo hiệu ứng gõ chữ cho phần "Đọc hiểu nội dung" */
function TypingDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const daHien = useInView(ref, { margin: '-60px' });
  const itChuyenDong = useReducedMotion();
  const [shown, setShown] = useState('');

  useEffect(() => {
    /* Tôn trọng cài đặt "giảm chuyển động" của máy: hiện thẳng kết quả.
       Người nhạy cảm với chuyển động hoặc ánh sáng nhấp nháy đã bật cài đặt
       này ở hệ điều hành — chạy hiệu ứng đè lên là làm họ khó chịu thật, không
       phải chuyện nhỏ nhặt. */
    if (itChuyenDong) {
      setShown(DEMO_OUTPUT);
      return;
    }
    if (!daHien) return;

    let i = 0;
    setShown('');
    const timer = setInterval(() => {
      i += 1;
      setShown(DEMO_OUTPUT.slice(0, i));
      if (i >= DEMO_OUTPUT.length) clearInterval(timer);
    }, 45);
    return () => clearInterval(timer);
  }, [daHien, itChuyenDong]);

  const xong = shown.length >= DEMO_OUTPUT.length;

  return (
    <div ref={ref} className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
      <div>
        <span className="font-semibold text-slate-500">Công dân nhập:</span>
        <p className="mt-0.5 italic text-slate-500 dark:text-slate-400">“{DEMO_INPUT}”</p>
      </div>
      <div>
        <span className="font-semibold text-primary-600 dark:text-primary-400">Hệ thống hiểu:</span>
        {/* Chốt sẵn chiều cao hai dòng để lúc chữ chạy dài ra thì cả thẻ không
            giật xuống — trang nhảy trong khi đang đọc là thứ khó chịu nhất. */}
        <p className="mt-0.5 min-h-[2.5rem] font-medium text-slate-700 dark:text-slate-200">
          “{shown}
          {!xong && <span className="animate-pulse">|</span>}”
        </p>
      </div>
    </div>
  );
}

/** Demo 4 nhóm phân loại, làm nổi nhóm mà câu mẫu rơi vào */
function CategoryDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const daHien = useInView(ref, { margin: '-60px' });
  const itChuyenDong = useReducedMotion();
  const [daChon, setDaChon] = useState(false);

  useEffect(() => {
    if (itChuyenDong) {
      setDaChon(true);
      return;
    }
    if (!daHien) return;
    /* Chờ một nhịp rồi mới làm nổi nhóm trúng: người xem kịp nhìn thấy CÓ BỐN
       nhóm để chọn, rồi mới thấy hệ thống chọn nhóm nào. Làm nổi ngay từ đầu
       thì ba nhóm kia chỉ như trang trí, mất luôn ý "phân loại". */
    const t = setTimeout(() => setDaChon(true), 900);
    return () => clearTimeout(t);
  }, [daHien, itChuyenDong]);

  const nhomTrung = CATEGORIES.find((c) => c.id === DEMO_CATEGORY);

  return (
    <div ref={ref} className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const trung = c.id === DEMO_CATEGORY;
          return (
            <span
              key={c.id}
              className={cn(
                'inline-block rounded-full transition-all duration-500',
                daChon && trung && 'scale-105 ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900',
                daChon && !trung && 'opacity-40 grayscale'
              )}
            >
              <Badge colorClass={c.colorClass}>{c.label}</Badge>
            </span>
          );
        })}
      </div>
      {/* Nối thẳng về câu mẫu ở thẻ bên cạnh — không thì người xem không biết
          "nhóm trúng" này là trúng cho cái gì. */}
      <p
        className={cn(
          'text-[11px] leading-relaxed text-slate-500 transition-opacity duration-500 dark:text-slate-400',
          daChon ? 'opacity-100' : 'opacity-0'
        )}
      >
        Tin nhắn ở thẻ bên vào nhóm{' '}
        <b className="text-primary-600 dark:text-primary-400">{nhomTrung?.label}</b> — chuyển thẳng
        tới cán bộ phụ trách địa bàn.
      </p>
    </div>
  );
}

/** Demo thanh tiến độ 3 trạng thái, chạy lần lượt qua từng bước */
function ProgressDemo() {
  const stages = [STATUS_MAP.received, STATUS_MAP.processing, STATUS_MAP.resolved];
  const soBuoc = stages.length;
  const ref = useRef<HTMLDivElement>(null);
  const daHien = useInView(ref, { margin: '-60px' });
  const itChuyenDong = useReducedMotion();
  const [buoc, setBuoc] = useState(0);

  useEffect(() => {
    /* ⚠️ Bản cũ ghi cứng idx === 0, nên thanh tiến độ lúc nào cũng dừng ở bước
       1. Thẻ mang tên "Theo dõi tiến độ" mà minh hoạ lại là một tiến độ đứng
       im — nhìn dễ tưởng hồ sơ gửi vào rồi nằm đó, phản tác dụng hoàn toàn. */
    if (itChuyenDong) {
      setBuoc(soBuoc - 1);
      return;
    }
    if (!daHien) return;
    const timer = setInterval(() => {
      setBuoc((b) => (b + 1) % soBuoc);
    }, 1400);
    return () => clearInterval(timer);
  }, [daHien, itChuyenDong, soBuoc]);

  return (
    <div ref={ref} className="flex items-center">
      {stages.map((s, idx) => {
        const dat = idx <= buoc;
        return (
          <div key={s.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-500',
                  dat
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                  idx === buoc && 'scale-110 shadow-glow'
                )}
              >
                {idx + 1}
              </span>
              <span
                className={cn(
                  'text-center text-[10px] leading-tight transition-colors duration-500',
                  dat
                    ? 'font-semibold text-primary-600 dark:text-primary-400'
                    : 'text-slate-500 dark:text-slate-400'
                )}
              >
                {s.label}
              </span>
            </div>
            {idx < soBuoc - 1 && (
              /* Đoạn nối cũng chạy màu theo — mắt bắt được hướng đi từ trái sang
                 phải, không chỉ thấy ba chấm tròn rời nhau. */
              <span className="mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <span
                  className={cn(
                    'block h-full rounded-full bg-primary-600 transition-all duration-700',
                    idx < buoc ? 'w-full' : 'w-0'
                  )}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FeaturesSection() {
  return (
    <section className="container-page py-16" aria-labelledby="features-title">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 id="features-title" className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
          Công nghệ đồng hành cùng bà con
        </h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Theo chân một tin nhắn: bà con gõ vội mấy chữ không dấu, hệ thống đọc hiểu, xếp đúng
          nhóm và mở đường cho bà con theo dõi tới lúc xong việc.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={<BrainCircuit className="h-6 w-6" aria-hidden />}
          title="Đọc hiểu nội dung"
          description="Hệ thống tự động nhận diện và diễn đạt lại nội dung rõ ràng, kể cả khi bà con viết thiếu dấu hay chưa đúng chính tả."
          delay={0}
        >
          <TypingDemo />
        </FeatureCard>

        <FeatureCard
          icon={<GitBranch className="h-6 w-6" aria-hidden />}
          title="Phân loại thông minh"
          description="Tự động phân vào 1 trong 4 nhóm xử lý để chuyển đến đúng bộ phận phụ trách, rút ngắn thời gian tiếp nhận."
          accentClass="bg-secondary-100 text-secondary-500 dark:bg-secondary-500/20 dark:text-secondary-400"
          delay={0.1}
        >
          <CategoryDemo />
        </FeatureCard>

        <FeatureCard
          icon={<SearchCheck className="h-6 w-6" aria-hidden />}
          title="Theo dõi tiến độ"
          description="Mỗi ý kiến được cấp mã 6 ký tự để bà con tra cứu trạng thái xử lý mọi lúc, mọi nơi."
          accentClass="bg-accent-100 text-accent-600 dark:bg-accent-500/20 dark:text-accent-500"
          delay={0.2}
        >
          <ProgressDemo />
        </FeatureCard>
      </div>
    </section>
  );
}
