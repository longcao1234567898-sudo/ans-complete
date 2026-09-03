/**
 * MÀN HÌNH BÁO TẠM KHOÁ
 * ============================================================================
 *
 * Hiện thay cho biểu mẫu khi thiết bị đang bị khoá vì gửi tin rác.
 *
 * VĂN PHONG — ba nguyên tắc:
 *
 *   1. KHÔNG buộc tội. Máy ở tiệm net, điện thoại mượn của người thân đều có
 *      thể bị khoá oan. Viết "hệ thống tạm dừng nhận" chứ không viết "bạn đã
 *      spam" — nói chắc chắn về điều mình không chắc là xúc phạm người vô can.
 *
 *   2. NÓI RÕ THỜI GIAN. Không biết chờ bao lâu thì bà con hoặc bỏ luôn, hoặc
 *      thử lại liên tục. Cả hai đều không tốt.
 *
 *   3. LUÔN CHỪA LỐI RA. Việc gấp thì gọi 113 — khoá kênh này không được phép
 *      chặn đường cầu cứu của người đang gặp nguy.
 */
import { ShieldAlert, Clock, PhoneCall, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UNIT } from '../../utils/constants';
import KhieuNaiMoKhoa from './KhieuNaiMoKhoa';

interface Props {
  /** Số phút còn lại của lệnh khoá */
  conLaiPhut: number;
}

export default function ManHinhBiKhoa({ conLaiPhut }: Props) {
  const gio = Math.floor(conLaiPhut / 60);
  const phut = conLaiPhut % 60;

  /* Ghép chuỗi thời gian cho tự nhiên tiếng Việt: "2 giờ 15 phút", "45 phút",
     "3 giờ" — không viết "2 giờ 0 phút". */
  const chuoiThoiGian = gio > 0
    ? (phut > 0 ? `${gio} giờ ${phut} phút` : `${gio} giờ`)
    : `${phut} phút`;

  return (
    <div className="mx-auto max-w-xl">
      <div className="overflow-hidden rounded-3xl border-2 border-amber-300 bg-white shadow-soft dark:border-amber-800 dark:bg-slate-900">

        {/* Dải đầu — dùng màu hổ phách, KHÔNG dùng đỏ.
            Đỏ mang nghĩa nguy hiểm hoặc bị phạt nặng; đây chỉ là tạm dừng có
            thời hạn, dùng đỏ là doạ người vô can. */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <ShieldAlert className="h-6 w-6 text-white" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold leading-tight text-white">
              Tạm dừng tiếp nhận từ thiết bị này
            </h2>
            <p className="text-xs text-white/85">
              Biện pháp tự động, có thời hạn
            </p>
          </div>
        </div>

        <div className="px-5 py-5">
          {/* Đồng hồ đếm — thông tin quan trọng nhất, đặt trên cùng */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-800 dark:bg-amber-900/20">
            <Clock className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Bà con có thể gửi lại sau
              </p>
              <p className="text-xl font-extrabold leading-tight text-amber-900 dark:text-amber-200">
                {chuoiThoiGian}
              </p>
            </div>
          </div>

          <p className="mb-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            Hệ thống ghi nhận có nội dung không phù hợp được gửi từ thiết bị hoặc
            đường mạng này, nên tạm dừng tiếp nhận một thời gian ngắn. Đây là
            biện pháp tự động nhằm giữ cho hòm thư không bị quá tải, giúp cán bộ
            tập trung xử lý những tin báo thật của bà con.
          </p>

          {/* Nói rõ khả năng khoá oan — quan trọng để người vô can không thấy
              mình bị quy kết */}
          <p className="mb-4 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
            Nếu bà con không gửi nội dung nào như vậy, có thể máy này từng được
            người khác dùng — chẳng hạn máy ở tiệm dịch vụ, hoặc điện thoại mượn
            của người thân. Lệnh tạm dừng sẽ <b>tự hết hạn</b>, bà con không cần
            làm gì thêm.
          </p>

          {/* Lối ra cho việc gấp — KHÔNG được thiếu phần này */}
          <div className="mb-4 rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3.5 dark:border-rose-800 dark:bg-rose-900/20">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-rose-800 dark:text-rose-300">
              <PhoneCall className="h-4 w-4 shrink-0" />
              Nếu việc gấp, đừng chờ
            </p>
            <p className="text-xs leading-relaxed text-rose-800 dark:text-rose-300">
              Có nguy hiểm cần lực lượng đến ngay, bà con gọi{' '}
              <a href={`tel:${UNIT.emergency}`} className="font-extrabold underline">
                {UNIT.emergency}
              </a>
              {' '}hoặc số trực ban{' '}
              <a href={`tel:${UNIT.hotline.replace(/\s/g, '')}`} className="font-extrabold underline">
                {UNIT.hotline}
              </a>
              . Hai số này luôn có người nghe, không bị ảnh hưởng bởi lệnh tạm dừng.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Về trang chủ
            </Link>
            <Link
              to="/tra-cuu"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Tra cứu ý kiến đã gửi
            </Link>
          </div>

          {/* KHIẾU NẠI MỞ KHOÁ — đặt cuối, sau khi bà con đã đọc hết phần giải
              thích vì sao bị tạm dừng. Component tự ẩn nếu máy chủ báo không
              khiếu nại được (hết lượt, hoặc đơn trước đang chờ). */}
          <KhieuNaiMoKhoa />

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Bà con cho rằng đây là nhầm lẫn cần xử lý gấp thì liên hệ trực tiếp{' '}
            {UNIT.name} theo số {UNIT.hotline} để được hướng dẫn.
          </p>
        </div>
      </div>
    </div>
  );
}
