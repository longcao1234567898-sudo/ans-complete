/**
 * Trang "Giới thiệu": mục đích hệ thống, quy trình xử lý, cam kết bảo mật, liên hệ đơn vị.
 */
import { motion } from 'framer-motion';
import { Clock, Mail, MapPin, Phone, ShieldCheck, Siren, Sparkles, Workflow } from 'lucide-react';
import Card from '../components/common/Card';
import { UNIT } from '../utils/constants';
import PageBackground from '../components/common/PageBackground';

const PROCESS_STEPS = [
  {
    title: 'Tiếp nhận',
    desc: 'Công dân gửi ý kiến qua form trực tuyến, hệ thống cấp ngay mã tra cứu 6 ký tự.',
  },
  {
    title: 'AI phân tích & phân loại',
    desc: 'AI đọc hiểu nội dung, chuẩn hoá câu chữ và tự động phân vào 1 trong 4 nhóm xử lý.',
  },
  {
    title: 'Xử lý',
    desc: 'Cán bộ phụ trách theo từng nhóm tiếp nhận, xác minh và giải quyết theo quy định.',
  },
  {
    title: 'Phản hồi & lưu trữ',
    desc: 'Kết quả được cập nhật trên hệ thống tra cứu; thông tin liên hệ (nếu có) được dùng để phản hồi trực tiếp.',
  },
];

export default function AboutPage() {
  return (
    <>
      <PageBackground video="bg-nui-sam.mp4" />
      <div className="container-page max-w-3xl py-10 sm:py-14">
      <div className="mb-10 text-center">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-4 py-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
          <Sparkles className="h-3.5 w-3.5" /> Giới thiệu hệ thống
        </span>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">Hộp Thư An Ninh Số</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Là kênh tiếp nhận ý kiến, phản ánh, kiến nghị của công dân do {UNIT.name} triển khai, ứng dụng trí tuệ
          nhân tạo để tiếp nhận nhanh chóng, phân loại chính xác và minh bạch trong theo dõi tiến độ xử lý.
        </p>
      </div>

      {/* Quy trình xử lý */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <Workflow className="h-5 w-5 text-primary-600" /> Quy trình xử lý
        </h2>
        <div className="space-y-3">
          {PROCESS_STEPS.map((s, idx) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
            >
              <Card className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-sm font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {idx + 1}
                </span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{s.desc}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Cam kết bảo mật */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <ShieldCheck className="h-5 w-5 text-primary-600" /> Cam kết bảo mật
        </h2>
        <Card className="space-y-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <p>• Thông tin cá nhân của công dân được bảo mật tuyệt đối theo quy định pháp luật hiện hành.</p>
          <p>• Họ tên, số điện thoại chỉ dùng để xác minh và phản hồi kết quả xử lý; email là tuỳ chọn.</p>
          <p>• Danh tính người tố giác, tin báo được giữ bí mật trong suốt quá trình xác minh, xử lý.</p>
          <p>• Dữ liệu chỉ phục vụ công tác tiếp nhận, xử lý — không sử dụng cho mục đích khác.</p>
        </Card>
      </section>

      {/* Liên hệ */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <Phone className="h-5 w-5 text-primary-600" /> Thông tin liên hệ
        </h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <div>
              <p className="text-xs font-medium text-slate-400">Địa chỉ</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{UNIT.address}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <div>
              <p className="text-xs font-medium text-slate-400">Hotline</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{UNIT.hotline}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <div>
              <p className="text-xs font-medium text-slate-400">Email</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{UNIT.email}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <div>
              <p className="text-xs font-medium text-slate-400">Giờ làm việc</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">Thứ 2 – Thứ 6: 7:30–12:00, 13:30–17:00 (trực ban 24/24)</p>
            </div>
          </div>
        </Card>
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700 dark:bg-red-900/10 dark:text-red-300">
          <Siren className="h-5 w-5 shrink-0" />
          Tình huống khẩn cấp, đe doạ tính mạng, tài sản — gọi ngay {UNIT.emergency}
        </div>
      </section>
    </div>
    </>
  );
}
