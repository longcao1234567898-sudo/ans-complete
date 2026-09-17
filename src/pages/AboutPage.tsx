/**
 * Trang "Giới thiệu": mục đích hệ thống, quy trình xử lý, cam kết bảo mật, liên hệ đơn vị.
 */
import { motion } from 'framer-motion';
import { Clock, Mail, MapPin, Phone, ShieldCheck, Siren, Sparkles, Workflow, PlayCircle } from 'lucide-react';
import { useNgonNgu } from '../i18n/useNgonNgu';
import Card from '../components/common/Card';
import { UNIT } from '../utils/constants';
import PageBackground from '../components/common/PageBackground';
import Reveal from '../components/common/Reveal';

const PROCESS_STEPS = [
  {
    khoaT: 'ab.p1t' as const,
    khoaD: 'ab.p1d' as const,
  },
  {
    khoaT: 'ab.p2t' as const,
    khoaD: 'ab.p2d' as const,
  },
  {
    khoaT: 'ab.p3t' as const,
    khoaD: 'ab.p3d' as const,
  },
  {
    khoaT: 'ab.p4t' as const,
    khoaD: 'ab.p4d' as const,
  },
];

export default function AboutPage() {
  const { t } = useNgonNgu();
  return (
    <>
      <PageBackground anh="bg-nui-sam.webp" />
      <div className="container-page max-w-3xl py-10 sm:py-14">
      <div className="mb-10 text-center">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-4 py-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
          <Sparkles className="h-3.5 w-3.5" /> {t('ab.gioiThieuHeThong')}
        </span>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">{t('ab.diemChamAnNinh')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {t('ab.laKenhTiepNhan').replace('{don_vi}', UNIT.name)}
        </p>

        {/* XEM LẠI HƯỚNG DẪN — cho người lỡ bỏ qua vòng hướng dẫn lần đầu.

            Hướng dẫn chỉ tự hiện một lần rồi thôi, nên phải có đường quay lại.
            Bỏ hẳn mà không có chỗ mở lại là cụt đường của người cần nó nhất. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('ans:mo-huong-dan'))}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-primary-300 px-4 py-2.5 text-sm font-bold text-primary-700 transition hover:bg-primary-50 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-900/20"
        >
          <PlayCircle className="h-4 w-4" />
          {t('about.replayGuide')}
        </button>
      </div>

      {/* Quy trình xử lý */}
      <Reveal>
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <Workflow className="h-5 w-5 text-primary-600" /> {t('about.process')}
        </h2>
        <div className="space-y-3">
          {PROCESS_STEPS.map((s, idx) => (
            <motion.div
              key={s.khoaT}
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
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{t(s.khoaT)}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t(s.khoaD)}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>
      </Reveal>

      {/* Cam kết bảo mật */}
      <Reveal delay={0.06}>
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <ShieldCheck className="h-5 w-5 text-primary-600" /> {t('ab.camKetBaoMat')}
        </h2>
        <Card className="space-y-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <p>{t('ab.thongTinCaNhan')}</p>
          <p>{t('ab.hoTenSoDien')}</p>
          <p>{t('ab.danhTinhNguoiTo')}</p>
          <p>{t('ab.duLieuChiPhuc')}</p>
        </Card>
      </section>
      </Reveal>

      {/* Liên hệ */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <Phone className="h-5 w-5 text-primary-600" /> {t('ab.thongTinLienHe')}
        </h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <div>
              <p className="text-xs font-medium text-slate-400">{t('ab.diaChi')}</p>
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
              <p className="text-xs font-medium text-slate-400">{t('ab.gioLamViec')}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{t('ab.thu2Thu6')}</p>
            </div>
          </div>
        </Card>
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700 dark:bg-red-900/10 dark:text-red-300">
          <Siren className="h-5 w-5 shrink-0" />
          {t('ab.khanCap113').replace('113', UNIT.emergency)}
        </div>
      </section>
    </div>
    </>
  );
}
