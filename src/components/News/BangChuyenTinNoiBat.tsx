/**
 * BangChuyenTinNoiBat — vài tin nổi bật lướt qua tự động.
 *
 * VÌ SAO LÀM: trước đây chỉ hiện MỘT tin nổi bật tĩnh. Bà con vào trang chỉ
 * thấy đúng một tin, các tin quan trọng khác nằm lẫn trong danh sách bên dưới
 * và dễ bị bỏ qua. Băng chuyền cho nhiều tin cùng có cơ hội được nhìn thấy.
 *
 * BA CÁCH CHUYỂN, để ai quen kiểu nào cũng dùng được:
 *   - Tự lướt sau mỗi 5 giây
 *   - Vuốt ngang bằng ngón tay (điện thoại)
 *   - Bấm chấm tròn bên dưới để nhảy tới tin muốn xem
 *
 * ⚠️ DỪNG TỰ LƯỚT khi người dùng đang tương tác: rê chuột vào, chạm vào, hoặc
 *    vừa bấm chọn tin. Tin đang đọc dở mà tự trôi mất là khó chịu nhất.
 *
 * ⚠️ TÔN TRỌNG NGƯỜI TẮT HIỆU ỨNG: máy nào bật chế độ giảm chuyển động thì
 *    KHÔNG tự lướt, chỉ chuyển khi người dùng chủ động bấm hoặc vuốt.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NewsArticle } from '../../types/news';
import NewsCard from './NewsCard';

interface Props {
  tin: NewsArticle[];
}

/** Khoảng nghỉ giữa hai lần tự lướt. 5 giây đủ để đọc tiêu đề và tóm tắt. */
const NHIP_MS = 5000;

export default function BangChuyenTinNoiBat({ tin }: Props) {
  const [chiSo, setChiSo] = useState(0);
  const [tamDung, setTamDung] = useState(false);
  /* Hướng chuyển để hiệu ứng trượt đi đúng chiều: 1 là sang phải, -1 sang trái. */
  const [huong, setHuong] = useState(1);
  const giamChuyenDong = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    giamChuyenDong.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  /* Tự lướt. Dừng khi đang tương tác, khi chỉ có một tin, hoặc khi người dùng
     tắt hiệu ứng chuyển động trong cài đặt máy. */
  useEffect(() => {
    if (tamDung || tin.length <= 1 || giamChuyenDong.current) return;
    const t = setInterval(() => {
      setHuong(1);
      setChiSo((i) => (i + 1) % tin.length);
    }, NHIP_MS);
    return () => clearInterval(t);
  }, [tamDung, tin.length]);

  if (tin.length === 0) return null;
  if (tin.length === 1) return <NewsCard article={tin[0]} kieu="noi-bat" />;

  function nhayToi(i: number) {
    setHuong(i > chiSo ? 1 : -1);
    setChiSo(i);
    /* Dừng tự lướt một nhịp sau khi người dùng chủ động chọn, để tin họ vừa
       chọn không bị trôi ngay. */
    setTamDung(true);
    setTimeout(() => setTamDung(false), NHIP_MS * 2);
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setTamDung(true)}
      onMouseLeave={() => setTamDung(false)}
    >
      <div className="overflow-hidden rounded-2xl">
        <AnimatePresence mode="wait" custom={huong}>
          <motion.div
            key={tin[chiSo].id}
            custom={huong}
            initial={{ opacity: 0, x: huong * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: huong * -40 }}
            transition={{ duration: 0.3 }}
            /* Vuốt ngang để chuyển tin. Chỉ cho kéo theo trục x, và kéo xong
               tự về chỗ cũ — phần chuyển tin do onDragEnd lo. */
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragStart={() => setTamDung(true)}
            onDragEnd={(_, info) => {
              /* Vuốt đủ mạnh (quá 60px hoặc nhanh) mới chuyển, tránh chuyển
                 nhầm khi bà con chỉ chạm nhẹ vào màn hình. */
              const du = Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 400;
              if (du) {
                const sang = info.offset.x < 0 ? 1 : -1;
                setHuong(sang);
                setChiSo((i) => (i + sang + tin.length) % tin.length);
              }
              setTimeout(() => setTamDung(false), NHIP_MS);
            }}
          >
            <NewsCard article={tin[chiSo]} kieu="noi-bat" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Chấm tròn chỉ vị trí, bấm được để nhảy tới tin muốn xem.
          Vùng bấm rộng 44px cho vừa ngón tay, dù chấm nhìn nhỏ. */}
      <div className="mt-3 flex items-center justify-center gap-1">
        {tin.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => nhayToi(i)}
            aria-label={`Xem tin nổi bật thứ ${i + 1} trên ${tin.length}`}
            aria-current={i === chiSo}
            className="flex h-11 w-8 items-center justify-center"
          >
            <span
              className={`block h-1.5 rounded-full transition-all ${
                i === chiSo
                  ? 'w-6 bg-primary-600 dark:bg-primary-400'
                  : 'w-1.5 bg-slate-300 dark:bg-slate-600'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
