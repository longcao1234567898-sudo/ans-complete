/**
 * Trang chủ: Hero + 3 tính năng AI + xem trước tin tức + dải CTA.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MascotWave } from '../components/common/PoliceMascot';
import HeroSection from '../components/Hero/HeroSection';
import FeaturesSection from '../components/Features/FeaturesSection';
import NewsGrid from '../components/News/NewsGrid';
import { fetchNews } from '../services/newsService';

export default function HomePage() {
  const { data: news, isLoading } = useQuery({
    queryKey: ['news', 'preview'],
    queryFn: () => fetchNews(undefined, 3),
  });

  return (
    <div>
      <HeroSection />
      <FeaturesSection />

      {/* Xem trước tin tức */}
      <section className="container-page py-12" aria-labelledby="news-preview-title">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 id="news-preview-title" className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
              Tin tức &amp; Pháp luật
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Cập nhật an ninh trật tự tại địa phương</p>
          </div>
          <Link
            to="/tin-tuc"
            className="hidden items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 sm:flex"
          >
            Xem tất cả <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <NewsGrid articles={news ?? []} isLoading={isLoading} />
        <div className="mt-6 text-center sm:hidden">
          <Link to="/tin-tuc" className="text-sm font-semibold text-primary-600 dark:text-primary-400">
            Xem tất cả tin tức →
          </Link>
        </div>
      </section>

      {/* Dải CTA */}
      <section className="container-page pb-16">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 px-6 py-8 text-center text-white sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <MascotWave className="hidden h-24 w-auto shrink-0 sm:block" aria-hidden />
            <div>
              <p className="font-bold">Có thắc mắc cần giải đáp ngay?</p>
              <p className="text-sm text-white/85">Trợ lý AI ở góc phải màn hình luôn sẵn sàng hỗ trợ bà con.</p>
            </div>
          </div>
          <Link
            to="/gui-y-kien"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            Gửi ý kiến ngay
          </Link>
        </div>
      </section>
    </div>
  );
}
