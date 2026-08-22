/**
 * Footer: thông tin đơn vị, liên kết nhanh, liên hệ, mạng xã hội.
 */
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { Facebook, Globe, Mail, MapPin, Phone, Shield, ShieldCheck, LayoutDashboard, MessageCircle, ExternalLink } from 'lucide-react';
import { NAV_LINKS, UNIT } from '../../utils/constants';

/* ============================================================================
   KHỐI NHÓM ZALO Ở CHÂN TRANG

   Tách thành component riêng cho gọn: khối này có ba lớp thông tin (nhận diện,
   mã QR, lối bấm) nên nhét thẳng vào Footer sẽ che mất bố cục bốn cột.

   Bọc cả khối trong thẻ <a> khi có đường dẫn mời, lùi về thẻ <div> khi không.
   KHÔNG lồng <a> trong <a>: nút "Mở nhóm trên Zalo" bên trong nay chỉ là một
   <span> mang dáng nút, vì cả khối đã bấm được rồi. Lồng hai thẻ liên kết là
   HTML sai chuẩn, trình duyệt tự tách ra và bố cục vỡ.
   ============================================================================ */
function ZaloBlock() {
  const coLink = Boolean(UNIT.zaloJoinUrl);

  const noiDung = (
    <>
      {/* Hàng nhận diện: LOGO + TÊN NHÓM + TÊN ĐƠN VỊ CHỦ QUẢN.

          Thiếu logo thì khối chỉ là một ô vuông đen trắng lạ mắt — bà con
          không biết quét vào đâu, mà mã QR thì trông giống hệt nhau cả. Dấu
          hiệu màu quen thuộc nói ngay "đây là Zalo" trước khi đọc tới chữ.

          Tên đơn vị đặt ngay dưới tên nhóm để thấy rõ nhóm này do Công an lập,
          không phải nhóm tự phát ai đó mạo danh — đúng thứ cần khẳng định khi
          bảo bà con quét một mã QR. */}
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0068FF] shadow-md">
          <MessageCircle className="h-5 w-5 text-white" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold leading-tight text-white">
            {UNIT.zaloGroupName}
          </span>
          {/* KHÔNG dùng truncate: tên đơn vị dài, cắt mất chữ đúng ngay chỗ
              cần khẳng định nhóm này của ai. Cho xuống dòng. */}
          <span className="block text-[11px] leading-snug text-slate-400">
            Do {UNIT.name} quản lý
          </span>
        </span>
      </div>

      {/* Cột chân trang chỉ rộng chừng 250px. Xếp mã QR nằm cạnh đoạn chữ thì
          chữ bị vắt thành từng dòng hai ba chữ, đọc rất mệt. Xếp dọc: mã ở
          giữa cho cân, chữ chạy hết bề ngang bên dưới. */}
      <span className="mt-1 flex justify-center rounded-xl bg-white p-2">
        <img
          src={UNIT.zaloQrImage}
          alt={`Mã QR ${UNIT.zaloGroupName} — ${UNIT.name}`}
          /* object-CONTAIN, không phải object-cover. Ảnh mã QR bị cắt xén là
             hỏng hẳn: mất một ô vuông định vị ở góc thì camera không dò ra
             mã nữa. Thà chừa viền trắng còn hơn cắt. */
          className="h-32 w-32 rounded-lg object-contain"
          loading="lazy"
        />
      </span>

      <p className="mt-2.5 text-xs leading-relaxed text-white/80">
        Quét mã bằng camera điện thoại để vào nhóm — nơi {UNIT.name} thông báo
        tình hình an ninh trật tự và nhắc bà con cảnh giác thủ đoạn lừa đảo mới.
      </p>

      {coLink && (
        <span className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-[#0068FF] px-3 py-2 text-xs font-bold text-white transition group-hover:bg-[#0055D4]">
          Mở nhóm trên Zalo
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
    </>
  );

  const lop = 'group mt-5 block rounded-2xl border border-white/15 bg-white/[0.07] p-3';

  if (!coLink) return <div className={lop}>{noiDung}</div>;

  return (
    <a
      href={UNIT.zaloJoinUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${lop} transition hover:border-[#0068FF] hover:bg-white/[0.12]`}
    >
      {noiDung}
    </a>
  );
}

export default function Footer() {
  const { staff } = useAdminAuth();
  return (
    <div className="relative z-10">
      {/* Dải cảnh quan An Giang thu nhỏ nối liền nội dung với footer */}
      <div className="relative z-10 mt-16" aria-hidden>
        <svg viewBox="0 0 1440 70" preserveAspectRatio="none" className="block h-14 w-full">
          <path
            d="M0 70 L0 46 Q140 18 300 42 Q420 22 560 44 Q700 16 860 42 Q1000 22 1140 44 Q1280 24 1440 46 L1440 70 Z"
            fill="rgba(27,94,32,0.10)"
          />
          <path
            d="M0 70 L0 56 Q180 38 360 54 Q540 36 720 54 Q900 38 1080 54 Q1260 40 1440 56 L1440 70 Z"
            fill="rgba(30,58,95,0.12)"
          />
        </svg>
      </div>
      <footer
      /* CHỪA CHỖ CHO THANH CHỨC NĂNG DƯỚI CHÂN MÀN HÌNH ĐIỆN THOẠI.
         Thanh nằm đè lên trang (fixed), nên không chừa thì nó che mất dòng
         cuối của chân trang — thường là dòng bản quyền và đường dây nóng.
         Biến --tab-bar-h bằng 0 khi thanh ẩn hoặc trên máy tính, nên không
         thừa khoảng trắng ở những chỗ đó. */
      style={{ paddingBottom: 'var(--tab-bar-h, 0rem)' }}
      className="relative z-10 border-t border-slate-200 bg-secondary-500 text-slate-200 dark:border-slate-800">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* Đơn vị */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
              <Shield className="h-4 w-4 text-accent-500" aria-hidden />
            </span>
            <span className="block py-0.5 text-[17px] font-bold leading-[1.5] text-white">Hộp Thư An Ninh Số</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-300">
            Nền tảng tiếp nhận, phân loại và xử lý ý kiến công dân của {UNIT.name}.
          </p>

          {/* ==================================================================
              NHÓM ZALO ĐỊA BÀN

              Chuyển từ cột "Liên hệ" sang đây. Cột đó vốn đã dài (địa chỉ, hai
              số điện thoại, email, rồi ba thẻ kênh chính thức) nên nhồi thêm mã
              QR là tràn hẳn xuống, trong khi cột này chỉ có một đoạn giới thiệu
              ngắn rồi bỏ trống gần hết chiều cao. Đặt vào chỗ trống đó thì hai
              cột cân nhau, mắt không phải nhảy.

              CẢ KHỐI LÀ MỘT ĐƯỜNG DẪN, không riêng cái nút bên dưới. Người xem
              trên máy tính không quét được mã hiện trên chính màn hình mình,
              nên phản xạ tự nhiên là bấm thẳng vào mã — bấm mà không có gì xảy
              ra thì tưởng trang hỏng.
              ================================================================== */}
          {UNIT.zaloQrImage && (
            <ZaloBlock />
          )}
        </div>

        {/* Liên kết nhanh */}
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase leading-[1.5] tracking-wider text-white">Liên kết nhanh</h3>
          <ul className="space-y-2 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="link-underline text-slate-300 transition hover:text-accent-500">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Chính sách */}
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase leading-[1.5] tracking-wider text-white">Thông tin</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/chinh-sach-bao-mat" className="text-slate-300 transition hover:text-accent-500">
                Chính sách bảo mật
              </Link>
            </li>
            <li>
              <Link to="/gioi-thieu" className="text-slate-300 transition hover:text-accent-500">
                Hướng dẫn sử dụng
              </Link>
            </li>
            <li>
              <Link to="/gioi-thieu" className="text-slate-300 transition hover:text-accent-500">
                Liên hệ
              </Link>
            </li>
          </ul>
        </div>

        {/* Liên hệ */}
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase leading-[1.5] tracking-wider text-white">Liên hệ</h3>
          <ul className="space-y-2.5 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" aria-hidden />
              {UNIT.address}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-accent-500" aria-hidden />
              {UNIT.hotline} — Khẩn cấp: {UNIT.emergency}
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-accent-500" aria-hidden />
              {UNIT.email}
            </li>
          </ul>
          

          {/* Kênh chính thức — thẻ lớn, có chữ, dễ bấm trên điện thoại */}
          <div className="mt-5 space-y-2.5">
            {/* ==============================================================
                MÃ QR NHÓM ZALO ĐỊA BÀN

                Đặt ở chân trang vì đây là kênh phụ — bà con vào đây sau khi
                đã xem xong nội dung chính. Hiện thẳng ảnh mã thay vì để một
                đường dẫn: quét bằng camera nhanh hơn nhiều so với bấm link
                rồi chờ mở ứng dụng.

                Nền trắng quanh mã là bắt buộc — dán mã sát viền tối thì nhiều
                điện thoại quét mãi không ra.
                ============================================================== */}
            <a
              href={UNIT.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#1877F2]/60 hover:bg-[#1877F2]/20 hover:shadow-lg hover:shadow-[#1877F2]/20"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1877F2] shadow-md transition-transform duration-300 group-hover:scale-110">
                <Facebook className="h-5 w-5 text-white" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight text-white">
                  Fanpage Công an thị xã Tân Châu
                </span>
                <span className="block truncate text-xs text-slate-400 transition group-hover:text-slate-200">
                  Theo dõi thông báo, cảnh báo mới nhất
                </span>
              </span>
            </a>

            <a
              href={UNIT.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-500/70 hover:bg-accent-500/15 hover:shadow-lg hover:shadow-accent-500/20"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-amber-600 shadow-md transition-transform duration-300 group-hover:scale-110">
                <Globe className="h-5 w-5 text-white" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight text-white">
                  Cổng TTĐT Công an tỉnh An Giang
                </span>
                <span className="block truncate text-xs text-slate-400 transition group-hover:text-slate-200">
                  congan.angiang.gov.vn — kênh chính thức
                </span>
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* KHU VỰC CÁN BỘ — nút bấm rõ ràng, nối thẳng vào hệ thống quản trị */}
      <div className="border-t border-white/10 py-6">
        <div className="container-page flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-slate-400">
            Dành cho cán bộ Công an được cấp tài khoản
          </p>

          {staff ? (
            <Link
              to="/quan-tri"
              className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-bold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-accent-600"
            >
              <LayoutDashboard className="h-4 w-4" />
              Vào trang quản trị ({staff.name})
            </Link>
          ) : (
            <Link
              to="/dang-nhap"
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:border-accent-500 hover:bg-accent-500"
            >
              <ShieldCheck className="h-4 w-4" />
              Đăng nhập cán bộ
            </Link>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {UNIT.name}. Dữ liệu công dân được bảo mật theo quy định pháp luật.
      </div>
    </footer>
    </div>
  );
}
