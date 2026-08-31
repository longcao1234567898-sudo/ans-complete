/**
 * KHUNG KHU VỰC CÁN BỘ
 *
 * Ý ĐỒ THIẾT KẾ:
 * Bản trước xếp 9 mục thành một hàng cuộn ngang — mọi mục trông ngang nhau,
 * "Nhật ký" nhìn quan trọng như "Danh sách ý kiến". Cán bộ phải cuộn để tìm.
 *
 * Bản này nhóm theo ĐÚNG NHỊP LÀM VIỆC thật:
 *   1. XỬ LÝ    — việc hằng ngày (tổng quan, ý kiến, duyệt, thùng rác)
 *   2. TẠI QUẦY — công cụ khi có dân đến (ki-ốt, mã QR)
 *   3. THEO DÕI — nhìn lại, báo cáo (báo cáo, bản đồ, nhật ký)
 *
 * Máy tính: cột dọc bên trái, thấy hết không phải cuộn.
 * Điện thoại: hàng ngang cuộn được, giữ nguyên vị trí khi chuyển trang.
 */
import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Inbox, LogOut, ShieldCheck, BarChart3, Map, ScrollText,
  ShieldQuestion, QrCode, MonitorSmartphone, Trash2, ShieldOff } from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';

interface MucDieuHuong {
  to: string;
  label: string;
  Icon: LucideIcon;
  exact: boolean;
  /** Vai trò được phép xem. Không ghi = ai cũng xem được. */
  vaiTro?: string[];
}

/* Nhóm điều hướng — thứ tự phản ánh nhịp làm việc, không phải xếp bừa */
const NHOM: { ten: string; muc: MucDieuHuong[] }[] = [
  {
    ten: 'Xử lý',
    muc: [
      { to: '/quan-tri', label: 'Tổng quan', Icon: LayoutDashboard, exact: true },
      { to: '/quan-tri/y-kien', label: 'Danh sách ý kiến', Icon: Inbox, exact: false },
      { to: '/quan-tri/kiem-duyet', label: 'Chờ duyệt', Icon: ShieldQuestion, exact: false },
      { to: '/quan-tri/thung-rac', label: 'Thùng rác', Icon: Trash2, exact: false },
        /* Danh sách khoá thiết bị — đặt cạnh Thùng rác vì cùng nhóm việc
           xử lý tin rác. Chỉ admin và manager xem được, khớp với phân quyền
           ở máy chủ (authorize('admin','manager')). */
        { to: '/quan-tri/danh-sach-khoa', label: 'Danh sách khoá', Icon: ShieldOff, exact: false,
          vaiTro: ['admin', 'manager'] },
    ],
  },
  {
    ten: 'Tại quầy',
    muc: [
      { to: '/quan-tri/ki-ot', label: 'Ki-ốt tiếp dân', Icon: MonitorSmartphone, exact: false },
      { to: '/quan-tri/ma-qr', label: 'Mã QR', Icon: QrCode, exact: false },
    ],
  },
  {
    ten: 'Theo dõi',
    muc: [
      { to: '/quan-tri/bao-cao', label: 'Báo cáo', Icon: BarChart3, exact: false },
      { to: '/quan-tri/ban-do', label: 'Bản đồ điểm nóng', Icon: Map, exact: false },
      /* "vaiTro" = danh sách vai trò được xem mục này.
         Không ghi = ai cũng xem được.
         Phải KHỚP với authorize(...) ở máy chủ, nếu không cán bộ bấm vào sẽ
         nhận lỗi 403 — trang hiện thông báo lỗi khó hiểu, tưởng hệ thống hỏng. */
      { to: '/quan-tri/nhat-ky', label: 'Nhật ký', Icon: ScrollText, exact: false,
        vaiTro: ['admin', 'manager'] },
    ],
  },
];

function tenVaiTro(role: string) {
  if (role === 'admin') return 'Quản trị viên';
  if (role === 'manager') return 'Cán bộ quản lý';
  return 'Cán bộ xử lý';
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { staff, logout } = useAdminAuth();
  const location = useLocation();
  const navRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  /* Trên điện thoại: đưa mục đang chọn vào giữa tầm nhìn của thanh mục ngang.

     ⚠️ ĐẶT VỊ TRÍ TỨC THÌ, KHÔNG DÙNG HIỆU ỨNG TRƯỢT.

     Lý do: mỗi trang quản trị TỰ BỌC AdminLayout, nên chuyển trang là layout cũ
     bị huỷ và layout mới được dựng lại từ đầu. Thanh mục là phần tử DOM hoàn
     toàn mới, vị trí cuộn khởi đầu bằng 0. Nếu dùng 'smooth', người dùng thấy
     thanh mục trượt từ đầu danh sách rồi mới bò tới mục đang chọn — vừa chậm
     vừa khó chịu, mỗi lần chuyển mục lại phải xem một lần.

     Đặt tức thì thì mục đang chọn đã nằm sẵn đúng chỗ ngay khi trang hiện ra,
     người dùng không thấy chuyển động nào cả — đúng như mong đợi.

     Sửa gốc rễ hơn là đưa AdminLayout thành layout dùng chung ở phần khai báo
     đường dẫn (React Router Outlet) để nó không bị dựng lại. Việc đó đụng vào
     cả 12 trang nên để dành khi có thời gian rà kỹ; cách hiện tại đã hết hẳn
     triệu chứng. */
  useEffect(() => {
    const nav = navRef.current;
    const item = activeRef.current;
    if (!nav || !item) return;

    const khungNav = nav.getBoundingClientRect();
    const khungMuc = item.getBoundingClientRect();
    const bikhuat = khungMuc.left < khungNav.left || khungMuc.right > khungNav.right;

    if (bikhuat) {
      /* GÁN THẲNG scrollLeft, không dùng scrollTo.
         scrollTo với behavior:'instant' cũng được, nhưng gán thẳng thì chắc
         chắn tức thì trên mọi trình duyệt, không phụ thuộc vào việc trình duyệt
         có hiểu giá trị 'instant' hay không, và không bị CSS scroll-behavior
         can thiệp. */
      nav.scrollLeft = item.offsetLeft - nav.clientWidth / 2 + item.clientWidth / 2;
    }
  }, [location.pathname]);

  if (!staff) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;

  const dangChon = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  /* ---------------------------------------------------------------------
     LỌC THANH ĐIỀU HƯỚNG THEO VAI TRÒ

     Vì sao cần: máy chủ chặn một số đường dẫn theo vai trò (ví dụ Nhật ký
     chỉ cho admin và manager). Nhưng thanh điều hướng lại hiện đủ mọi mục
     cho mọi người. Cán bộ handler bấm vào là nhận lỗi 403, màn hình hiện
     thông báo lỗi kỹ thuật khó hiểu — tưởng hệ thống hỏng, gọi báo lung tung.

     Ẩn hẳn mục không có quyền thì rõ ràng hơn nhiều: không thấy thì không bấm.

     ⚠️ Đây chỉ là việc dọn giao diện cho gọn, KHÔNG PHẢI biện pháp bảo mật.
     Chặn thật vẫn nằm ở máy chủ. Ai gõ thẳng địa chỉ vẫn bị 403 như thường.
     --------------------------------------------------------------------- */
  const NHOM_HIEN = NHOM
    .map((nhom) => ({
      ...nhom,
      muc: nhom.muc.filter((m) => !m.vaiTro || m.vaiTro.includes(staff.role)),
    }))
    .filter((nhom) => nhom.muc.length > 0);   // bỏ luôn nhóm rỗng

  return (
    <div className="container-page py-5">
      {/* ===== THANH TRỰC BAN =====
          Lấy cảm hứng từ bảng phân công trực ban ở trụ sở: ai đang trực,
          giữ chức vụ gì, và lời nhắc mọi thao tác đều để lại vết. */}
      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <ShieldCheck className="h-6 w-6 text-white" />
            </span>
            <div className="leading-tight text-white">
              <p className="text-[15px] font-extrabold tracking-tight">Khu vực cán bộ</p>
              <p className="text-[11px] text-white/70">Mọi thao tác đều được ghi nhật ký</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[13px] font-bold text-white">{staff.name}</p>
              <p className="text-[11px] text-white/70">{tenVaiTro(staff.role)}</p>
            </div>
            <button
              onClick={logout}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/15 px-3.5 text-[13px] font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/25"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>

      <div className="lg:flex lg:gap-5">
        {/* ===== ĐIỀU HƯỚNG — CỘT DỌC TRÊN MÁY TÍNH ===== */}
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <nav className="sticky top-20 space-y-5">
            {NHOM_HIEN.map((nhom) => (
              <div key={nhom.ten}>
                <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  {nhom.ten}
                </p>
                <div className="space-y-0.5">
                  {nhom.muc.map(({ to, label, Icon, exact }) => {
                    const chon = dangChon(to, exact);
                    return (
                      <Link
                        key={to}
                        to={to}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition ${
                          chon
                            ? 'bg-primary-600 text-white shadow-soft'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* ===== ĐIỀU HƯỚNG — HÀNG NGANG TRÊN ĐIỆN THOẠI ===== */}
        <nav
          ref={navRef}
          className="scrollbar-thin mb-5 flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-soft dark:bg-slate-900 lg:hidden"
        >
          {/* Dùng NHOM_HIEN (đã lọc theo vai trò), KHÔNG dùng NHOM.
              Trước đây chỗ này dùng NHOM nên trên điện thoại cán bộ thấy đủ mọi
              mục kể cả mục mình không có quyền — bấm vào nhận lỗi 403 khó hiểu.
              Bản trên máy tính đã lọc đúng, chỉ bản điện thoại bị sót. */}
          {NHOM_HIEN.flatMap((n) => n.muc).map(({ to, label, Icon, exact }) => {
            const chon = dangChon(to, exact);
            return (
              <Link
                key={to}
                to={to}
                ref={chon ? activeRef : undefined}
                className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold transition ${
                  chon
                    ? 'bg-primary-600 text-white shadow-soft'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* ===== NỘI DUNG ===== */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
