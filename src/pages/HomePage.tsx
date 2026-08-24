/**
 * Trang chủ: Hero + 3 tính năng AI + xem trước tin tức + dải CTA.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MascotWave } from '../components/common/PoliceMascot';
import PoliceAvatar from '../components/common/PoliceAvatar';
import HeroSection from '../components/Hero/HeroSection';
import FeaturesSection from '../components/Features/FeaturesSection';
import CanhGiacLuaDao from '../components/Hero/CanhGiacLuaDao';
import Reveal from '../components/common/Reveal';
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
      <CanhGiacLuaDao />
      <Reveal><FeaturesSection /></Reveal>

      {/* Xem trước tin tức */}
      <Reveal delay={0.05}>
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
        {/* Trang chủ chỉ giới thiệu, KHÔNG liệt kê hết.
            Điện thoại: 1 tin nổi bật + 6 tin gọn.
              Trước để 4 tin vì mỗi thẻ cao 108px. Nay thẻ gọn đã thu còn 84px
              nên thêm 2 tin vẫn vừa khoảng chỗ cũ — bà con thấy được nhiều tin
              hơn mà không phải lướt thêm.
            Máy tính: 1 nổi bật + 6 thẻ dọc (2 hàng 3 cột) cho cân bố cục. */}
        <div className="sm:hidden">
          <NewsGrid articles={(news ?? []).slice(0, 7)} isLoading={isLoading} />
        </div>
        <div className="hidden sm:block">
          <NewsGrid articles={(news ?? []).slice(0, 7)} isLoading={isLoading} />
        </div>
        <div className="mt-6 text-center sm:hidden">
          <Link to="/tin-tuc" className="text-sm font-semibold text-primary-600 dark:text-primary-400">
            Xem tất cả tin tức →
          </Link>
        </div>
      </section>
      </Reveal>

      {/* Dải CTA */}
      <Reveal delay={0.05}>
      <section className="container-page pb-16">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 px-6 py-8 text-center text-white sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            {/* Dùng CHUNG hình công an với nút trợ lý ở góc màn hình.
                Trước đây dải này dùng một hình khác (MascotWave) — bà con thấy
                hai nhân vật khác nhau cùng nói về một trợ lý, dễ tưởng là hai
                thứ riêng biệt. Dùng chung một hình thì nhìn là biết ngay dải
                này đang trỏ tới nút tròn ở góc. */}
            <span className="hidden h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/30 sm:flex">
              <PoliceAvatar className="h-16 w-16" />
            </span>
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
      </Reveal>
    </div>
  );
}
