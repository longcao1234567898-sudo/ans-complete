/**
 * THANH CHỨC NĂNG DƯỚI ĐÁY MÀN HÌNH — CHỈ HIỆN TRÊN ĐIỆN THOẠI
 * ============================================================================
 *
 * VÌ SAO CẦN:
 * Trên điện thoại, muốn chuyển trang phải cuộn ngược lên đầu, bấm nút ba gạch,
 * chờ menu mở ra, rồi mới chọn được. Ở trang dài như Tin tức thì rất mệt.
 *
 * Đáy màn hình lại là chỗ ngón cái với tới dễ nhất khi cầm điện thoại một tay —
 * đúng cách phần lớn bà con dùng máy.
 *
 * CÁCH HOẠT ĐỘNG:
 *   · Cuộn LÊN   -> thanh trượt ra (bà con đang tìm đường đi chỗ khác)
 *   · Cuộn XUỐNG -> thanh thu lại (bà con đang đọc, đừng che nội dung)
 *   · Ở đầu trang -> luôn hiện, vì đó là lúc bắt đầu chọn chỗ muốn tới
 *
 * TRÁNH ĐÈ LÊN NÚT KHÁC:
 * Đáy màn hình đã có nút SOS (trái) và nút trợ lý (phải). Khi thanh này hiện,
 * hai nút đó được đẩy lên qua biến CSS --tab-bar-h, không bị che.
 */
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Send, Search, Newspaper, MapPin } from 'lucide-react';
import { cn } from '../../utils/helpers';

const TABS = [
  /* NĂM MỤC LÀ TỐI ĐA cho thanh dưới trên điện thoại. Màn hình hẹp 360px chia
     sáu mục thì mỗi ô còn 60px — chữ bị cắt, ngón tay bấm nhầm sang ô bên cạnh.

     Thứ tự theo mức độ bà con dùng: gửi ý kiến và tra cứu là việc chính, tin
     tức và bản đồ là xem tình hình. "Giới thiệu" bỏ khỏi thanh dưới vì ít khi
     mở — vẫn còn trong menu ba gạch ở đầu trang, không mất đường vào. */
  { to: '/', label: 'Trang chủ', Icon: Home, cuoi: true },
  { to: '/gui-y-kien', label: 'Gửi ý kiến', Icon: Send },
  { to: '/tra-cuu', label: 'Tra cứu', Icon: Search },
  { to: '/tin-tuc', label: 'Tin tức', Icon: Newspaper },
  { to: '/ban-do', label: 'Bản đồ', Icon: MapPin },
];

export default function MobileTabBar() {
  const [hien, setHien] = useState(true);
  const viTriTruoc = useRef(0);

  useEffect(() => {
    viTriTruoc.current = window.scrollY;

    const khiCuon = () => {
      const y = window.scrollY;
      const chenhLech = y - viTriTruoc.current;

      // Bỏ qua rung lắc nhỏ dưới 6px — nếu không thanh sẽ nhấp nháy liên tục
      if (Math.abs(chenhLech) < 6) return;

      if (y < 80) {
        setHien(true);            // gần đầu trang: luôn hiện
      } else if (chenhLech < 0) {
        setHien(true);            // cuộn lên: hiện ra
      } else {
        setHien(false);           // cuộn xuống: thu lại, nhường chỗ cho nội dung
      }
      viTriTruoc.current = y;
    };

    window.addEventListener('scroll', khiCuon, { passive: true });
    return () => window.removeEventListener('scroll', khiCuon);
  }, []);

  /* Báo cho phần còn lại của trang biết thanh đang chiếm bao nhiêu chỗ,
     để nút SOS và nút trợ lý tự đẩy lên. Chỉ áp dụng ở cỡ màn hình nhỏ. */
  useEffect(() => {
    const dat = () => {
      const dienThoai = window.matchMedia('(max-width: 767px)').matches;
      document.documentElement.style.setProperty(
        '--tab-bar-h',
        dienThoai && hien ? '4.25rem' : '0rem'
      );
    };
    dat();
    window.addEventListener('resize', dat);
    return () => window.removeEventListener('resize', dat);
  }, [hien]);

  return (
    <nav
      aria-label="Điều hướng nhanh"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        'border-t border-slate-200 bg-white/95 backdrop-blur',
        'dark:border-slate-700 dark:bg-slate-900/95',
        'transition-transform duration-300 ease-out',
        // Trượt xuống khuất hẳn khi ẩn, cộng thêm phần lề an toàn của máy
        hien ? 'translate-y-0' : 'translate-y-[calc(100%+env(safe-area-inset-bottom))]'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch">
        {TABS.map(({ to, label, Icon, cuoi }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={cuoi}
              className={({ isActive }) =>
                cn(
                  // Cao 60px: vượt ngưỡng 44px tối thiểu cho vùng bấm bằng ngón tay.
                  // "relative" là BẮT BUỘC: vạch báo mục đang chọn dùng absolute,
                  // thiếu nó thì vạch bám vào cả thanh và luôn nằm ở góc trái
                  // thay vì nằm trên đúng mục.
                  'relative flex h-[60px] flex-col items-center justify-center gap-0.5 px-1',
                  'text-[10px] font-semibold leading-tight transition-colors',
                  isActive
                    ? 'text-primary-700 dark:text-primary-300'
                    : 'text-slate-500 dark:text-slate-400'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Vạch nhỏ phía trên báo đang ở mục nào — rõ hơn là chỉ đổi màu chữ */}
                  <span
                    className={cn(
                      'absolute top-0 h-0.5 w-8 rounded-b-full transition-colors',
                      isActive ? 'bg-primary-600' : 'bg-transparent'
                    )}
                  />
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.9} />
                  <span className="text-center">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
