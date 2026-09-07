/**
 * Nút nổi mở trợ lý AI — có vòng ping thu hút chú ý.
 *
 * TRÊN ĐIỆN THOẠI: kéo thả tự do được. Vì sao cần: màn hình hẹp, nút nổi cố
 * định ở góc phải dưới thường che mất nút bấm hoặc chữ bên dưới — nhất là ở
 * trang gửi ý kiến có nhiều ô nhập, và trang tin tức khi cuộn. Cho bà con kéo
 * nút sang chỗ trống là hết vướng.
 *
 * TRÊN MÁY TÍNH: giữ cố định. Màn hình rộng nên nút không che gì, mà kéo được
 * lại dễ bấm nhầm thành kéo khi người dùng chỉ muốn bấm.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import PoliceAvatar from '../common/PoliceAvatar';

interface ChatBubbleProps {
  open: boolean;
  onClick: () => void;
}

/** Dưới mốc này coi là điện thoại — khớp mốc sm của Tailwind. */
const MOC_DIEN_THOAI = 640;

export default function ChatBubble({ open, onClick }: ChatBubbleProps) {
  const [laDienThoai, setLaDienThoai] = useState(false);
  /* Đổi khoá này là dựng lại nút, đưa về vị trí mặc định. Dùng khi xoay ngang
     máy hoặc đổi cỡ cửa sổ — chỗ đã kéo có thể nằm ngoài màn hình mới. */
  const [khoaDungLai, setKhoaDungLai] = useState(0);
  /* Phân biệt KÉO với BẤM: nếu ngón tay di chuyển quá vài pixel thì coi là
     kéo, không kích hoạt mở chat. Không có cờ này thì mỗi lần kéo xong nút
     lại tự mở chat — rất khó chịu. */
  const daKeo = useRef(false);

  useEffect(() => {
    const doKichThuoc = () => setLaDienThoai(window.innerWidth < MOC_DIEN_THOAI);
    doKichThuoc();
    window.addEventListener('resize', doKichThuoc);
    return () => window.removeEventListener('resize', doKichThuoc);
  }, []);

  /* Xoay ngang máy hoặc đổi cỡ cửa sổ có thể đẩy nút ra ngoài màn hình.
     Đưa về vị trí mặc định cho chắc — thà mất chỗ đã kéo còn hơn mất nút. */
  useEffect(() => {
    setKhoaDungLai((k) => k + 1);
  }, [laDienThoai]);

  const chung = (
    <>
      {!open && (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary-400 will-change-transform" aria-hidden />
          <span
            className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary-400 will-change-transform"
            style={{ animationDelay: '1.5s' }}
            aria-hidden
          />
        </>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={open ? 'close' : 'open'}
          initial={{ opacity: 0, rotate: -45 }}
          animate={{ opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, rotate: 45 }}
          transition={{ duration: 0.15 }}
          className="relative"
        >
          {open ? <X className="h-6 w-6" /> : <PoliceAvatar className="h-11 w-11" />}
        </motion.span>
      </AnimatePresence>
    </>
  );

  const lopChung =
    'fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full '
    + 'bg-gradient-to-br from-primary-600 to-secondary-500 text-white '
    + 'shadow-lg shadow-primary-900/20 sm:bottom-6 sm:right-6';

  /* Đẩy lên cùng nhịp với nút SOS khi thanh chức năng dưới hiện ra. */
  const viTriMacDinh = {
    bottom: 'calc(1.25rem + var(--tab-bar-h, 0rem))',
    transition: 'bottom .3s',
  };

  /* ---------- MÁY TÍNH: nút cố định như cũ ---------- */
  if (!laDienThoai) {
    return (
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}
        className={lopChung}
        style={viTriMacDinh}
      >
        {chung}
      </motion.button>
    );
  }

  /* ---------- ĐIỆN THOẠI: kéo thả tự do ---------- */
  return (
    /* ⚠️ DÙNG motion.div, KHÔNG dùng motion.button.

       Thư viện kéo hoạt động không ổn định trên thẻ <button> vì trình duyệt tự
       xử lý sự kiện con trỏ của nút, nuốt mất cử chỉ kéo — thử trên máy thấy
       nút đứng im, transform không đổi.

       Đổi sang div kèm role="button" và bắt phím Enter/Space để vẫn dùng được
       bằng bàn phím và trình đọc màn hình, đúng như một nút thật. */
    <motion.div
      key={khoaDungLai}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      /* drag của framer-motion lo phần kéo; dragMomentum tắt để nút dừng ngay
         chỗ nhả tay, không trượt thêm — người lớn tuổi khó canh nếu nút trôi. */
      drag
      dragMomentum={false}
      /* Giữ nút trong màn hình, chừa mép 8px để không dính sát cạnh. */
      dragConstraints={{
        top: -(typeof window !== 'undefined' ? window.innerHeight - 140 : 500),
        bottom: 8,
        left: -(typeof window !== 'undefined' ? window.innerWidth - 76 : 300),
        right: 8,
      }}
      dragElastic={0.05}
      onDragStart={() => { daKeo.current = true; }}
      onDragEnd={() => {
        /* Chờ một nhịp rồi mới bỏ cờ, để sự kiện bấm sinh ra sau khi nhả tay
           không lọt qua và mở chat ngoài ý muốn. */
        setTimeout(() => { daKeo.current = false; }, 80);
      }}
      onClick={() => { if (!daKeo.current) onClick(); }}
      whileTap={{ scale: 0.94 }}
      aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI (giữ và kéo để chuyển chỗ)'}
      className={`${lopChung} touch-none cursor-pointer select-none`}
      /* ⚠️ KHÔNG đặt x/y trong style.

         framer-motion tự giữ vị trí sau khi kéo bằng transform nội bộ. Nếu ta
         cũng đặt x/y ở đây thì hai bên tranh nhau: giá trị trong style là giá
         trị CHỐT, nên vừa nhả tay là nút bị ép về đúng chỗ cũ — kéo trông như
         không ăn. Để thư viện tự lo, ta chỉ cần dựng lại nút khi đổi hướng màn
         hình (qua khoá key bên dưới). */
      style={viTriMacDinh}
    >
      {chung}
    </motion.div>
  );
}
