/**
 * KhuThongKe — số liệu hoạt động của hệ thống, hiện ở trang chủ.
 *
 * VÌ SAO CÓ: bà con vào một trang web của cơ quan nhà nước thường e ngại "gửi
 * vào đây có ai đọc không". Con số ý kiến đã tiếp nhận và đã giải quyết trả lời
 * đúng câu hỏi đó — đây là kênh có người dùng thật, có người xử lý thật.
 *
 * ⚠️ TỰ ẨN khi chưa có dữ liệu. Hiện "0 ý kiến đã tiếp nhận" thì phản tác dụng,
 *    làm bà con tưởng không ai dùng. Thà không hiện gì.
 */
import { useQuery } from '@tanstack/react-query';
import { Inbox, CheckCircle2, Eye, CalendarDays } from 'lucide-react';
import { fetchThongKe } from '../../services/thongKeService';

export default function KhuThongKe() {
  const { data } = useQuery({
    queryKey: ['thong-ke-he-thong'],
    queryFn: fetchThongKe,
    staleTime: 5 * 60_000,
    retry: false,
  });

  /* Chưa có số hoặc chưa có ý kiến nào -> ẩn hẳn. */
  if (!data || data.tongYKien === 0) return null;

  const o = [
    { so: data.tongYKien, nhan: 'ý kiến đã tiếp nhận', Icon: Inbox, mau: 'text-primary-600 dark:text-primary-400' },
    { so: data.yKienDaXuLy, nhan: 'ý kiến đã giải quyết', Icon: CheckCircle2, mau: 'text-emerald-600 dark:text-emerald-400' },
    { so: data.luotTruyCap, nhan: 'lượt bà con truy cập', Icon: Eye, mau: 'text-sky-600 dark:text-sky-400' },
    { so: data.ngayHoatDong, nhan: 'ngày phục vụ liên tục', Icon: CalendarDays, mau: 'text-amber-600 dark:text-amber-400' },
  ].filter((x) => x.so > 0);   // bỏ ô nào chưa có số, khỏi hiện số 0

  if (o.length === 0) return null;

  return (
    <section className="container-page py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-4 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">
          Hệ thống đang phục vụ bà con
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {o.map(({ so, nhan, Icon, mau }) => (
            <div key={nhan} className="text-center">
              <Icon className={`mx-auto mb-1 h-5 w-5 ${mau}`} />
              <p className={`text-2xl font-extrabold ${mau}`}>
                {so.toLocaleString('vi-VN')}
              </p>
              <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">{nhan}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
