/**
 * THẺ BẢN TIN — ba kiểu hiển thị
 * ============================================================================
 *
 *   'noi-bat'  Tin nổi bật. Ảnh lớn tràn khung, tiêu đề đặt ĐÈ LÊN ảnh.
 *              Dùng cho bài đầu tiên — thứ bà con nhìn thấy trước nhất.
 *
 *   'thuong'   Thẻ dọc thường, dùng cho lưới trên máy tính.
 *
 *   'gon'      Thẻ NGANG gọn: ảnh nhỏ bên trái, chữ bên phải.
 *              ⚠️ ĐÂY LÀ KIỂU MẶC ĐỊNH TRÊN ĐIỆN THOẠI.
 *
 * VÌ SAO CẦN KIỂU GỌN:
 * Thẻ dọc cũ cao khoảng 300px, màn hình điện thoại chỉ chứa được 2 tin. Bà con
 * muốn xem 10 tin phải lướt 5 lần. Thẻ ngang cao khoảng 96px — cùng màn hình
 * đó chứa được 6-7 tin, gấp ba lần.
 *
 * Đổi lại phải bỏ bớt: kiểu gọn không hiện đoạn tóm tắt, chỉ giữ tiêu đề, nhãn
 * chủ đề và ngày. Đó là đúng thứ bà con cần để quyết định có mở đọc hay không.
 * Tóm tắt chỉ hữu ích khi đã quan tâm — mà lúc đó họ mở bài rồi.
 */
import { useState } from 'react';
import { ExternalLink, Newspaper, Star } from 'lucide-react';
import type { NewsArticle } from '../../types/news';
import { NEWS_TAGS } from '../../utils/constants';
import { formatDate } from '../../utils/helpers';
import Badge from '../common/Badge';
import Card from '../common/Card';
import { Skeleton } from '../common/Loading';
import SpeakButton from '../common/SpeakButton';

export type KieuThe = 'noi-bat' | 'thuong' | 'gon';

interface Props {
  article: NewsArticle;
  kieu?: KieuThe;
}

export default function NewsCard({ article, kieu = 'thuong' }: Props) {
  const [loaded, setLoaded] = useState(false);
  const tag = NEWS_TAGS[article.tag];

  const chungLienKet =
    'group block rounded-2xl focus:outline-none focus-visible:ring-2 '
    + 'focus-visible:ring-primary-500 focus-visible:ring-offset-2';

  /* =======================================================================
     KIỂU GỌN — thẻ ngang, dùng trên điện thoại
     ======================================================================= */
  if (kieu === 'gon') {
    return (
      <a
        href={article.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Đọc bài: ${article.title}`}
        className={chungLienKet}
      >
        {/* ==================================================================
            THẺ GỌN CHO ĐIỆN THOẠI — THU NHỎ ĐỂ CHỨA ĐƯỢC NHIỀU TIN HƠN

            Trước: ảnh 96px + tiêu đề 3 dòng + khoảng cách 12px  ≈ 108px/tin
            Nay  : ảnh 76px + tiêu đề 2 dòng + khoảng cách 8px   ≈  84px/tin

            Một màn hình điện thoại chứa được thêm khoảng 2 tin — bà con đỡ
            phải lướt, quét mắt qua tiêu đề nhanh hơn.

            Đổi từ thẻ rời sang hàng liền có đường kẻ ngăn: bỏ được viền và
            bóng đổ của từng thẻ, vừa gọn vừa nhìn ra ngay đây là DANH SÁCH
            chứ không phải các khối rời rạc.
            ================================================================== */}
        <div className="flex items-stretch gap-2.5 overflow-hidden rounded-xl px-1 py-2 transition active:scale-[0.99] active:bg-slate-50 dark:active:bg-slate-800/60">
          <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
            {article.thumbnail ? (
              <img
                src={article.thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
                onLoad={() => setLoaded(true)}
                className={`h-full w-full object-cover transition duration-300 ${
                  loaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ) : (
              /* Không có ảnh thì hiện biểu tượng, KHÔNG để ô trắng —
                 ô trắng nhìn như ảnh hỏng */
              <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                <Newspaper className="h-6 w-6" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center pr-1">
            {/* Tiêu đề LÊN TRƯỚC nhãn — mắt bà con quét tiêu đề để chọn bài,
                nhãn và ngày chỉ là thông tin phụ. Trước đây nhãn đứng trên nên
                mỗi lần lướt phải bỏ qua một dòng thừa mới tới nội dung. */}
            <h3 className="mb-1 line-clamp-2 text-[13.5px] font-bold leading-snug text-slate-800 transition group-hover:text-primary-600 dark:text-slate-100 dark:group-hover:text-primary-400">
              {article.title}
            </h3>
            <div className="flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-px text-[9.5px] font-bold ${tag.colorClass}`}>
                {tag.label}
              </span>
              <span className="text-[10px] text-slate-400">
                {formatDate(article.publishedAt, false)}
              </span>
            </div>
          </div>
        </div>
      </a>
    );
  }

  /* =======================================================================
     KIỂU NỔI BẬT — ảnh lớn, tiêu đề đè lên ảnh
     ======================================================================= */
  if (kieu === 'noi-bat') {
    return (
      <a
        href={article.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Đọc bài nổi bật: ${article.title}`}
        className={chungLienKet + ' overflow-hidden'}
      >
        {/* Tỉ lệ ảnh theo màn hình:
              điện thoại 16/10 — đủ lớn để ra dáng tin chủ đạo, mà vẫn chừa chỗ
                                 cho 3-4 tin gọn ngay bên dưới trong cùng màn hình.
                                 Đã thử 4/3: ảnh đẹp hơn nhưng cao thêm 44px,
                                 đẩy mất một tin xuống dưới — ngược với mục tiêu
                                 cho bà con thấy nhiều tin mà đỡ phải lướt.
              máy tính  21/9   — dải ngang rộng, ra dáng tin chủ đạo của trang */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-slate-200 shadow-soft dark:bg-slate-800 sm:aspect-[21/9]">
          {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
          {article.thumbnail && (
            <img
              src={article.thumbnail}
              alt=""
              /* Tin nổi bật nằm ngay đầu trang -> tải NGAY, không lười tải.
                 Lười tải ở đây làm ảnh hiện chậm, người dùng thấy ô xám. */
              loading="eager"
              decoding="async"
              onLoad={() => setLoaded(true)}
              className={`h-full w-full object-cover transition duration-700 group-hover:scale-105 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {/* Lớp phủ tối dần từ dưới lên — để chữ trắng đọc rõ trên MỌI ảnh,
              kể cả ảnh sáng. Không có lớp này thì gặp ảnh trời nắng là mất chữ. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">
                <Star className="h-3 w-3 fill-current" />
                Tin nổi bật
              </span>
              <Badge colorClass={tag.colorClass}>{tag.label}</Badge>
              <span className="text-[11px] font-medium text-white/80">
                {formatDate(article.publishedAt, false)}
              </span>
            </div>

            <h3 className="mb-1.5 line-clamp-3 text-lg font-extrabold leading-tight text-white sm:text-2xl drop-shadow sm:text-2xl">
              {article.title}
            </h3>

            {/* Tóm tắt chỉ hiện trên màn hình rộng — trên điện thoại nó đẩy
                tiêu đề lên quá cao, che mất phần ảnh có nội dung */}
            <p className="hidden line-clamp-2 text-sm leading-relaxed text-white/85 sm:block">
              {article.summary}
            </p>

            <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-white transition group-hover:gap-2.5">
              Đọc tại {article.source} <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </a>
    );
  }

  /* =======================================================================
     KIỂU THƯỜNG — thẻ dọc cho lưới trên máy tính
     ======================================================================= */
  return (
    <a
      href={article.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Đọc bài: ${article.title}`}
      className={chungLienKet + ' h-full'}
    >
      <Card className="flex h-full flex-col overflow-hidden !p-0 transition hover:-translate-y-0.5 hover:shadow-lg">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
          {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
          {article.thumbnail ? (
            <img
              src={article.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
              <Newspaper className="h-10 w-10" />
            </div>
          )}
          <Badge colorClass={tag.colorClass} className="absolute left-3 top-3 shadow-sm">
            {tag.label}
          </Badge>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="mb-1.5 text-xs text-slate-400">
            {formatDate(article.publishedAt, false)}
          </p>

          <h3 className="mb-2 line-clamp-2 text-sm font-bold leading-snug text-slate-800 transition group-hover:text-primary-600 dark:text-slate-100 dark:group-hover:text-primary-400">
            {article.title}
          </h3>

          <p className="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {article.summary}
          </p>

          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 transition group-hover:gap-2.5 dark:text-primary-400">
              Đọc tại {article.source} <ExternalLink className="h-3 w-3" />
            </span>
            <SpeakButton text={`${article.title}. ${article.summary}`} label="Nghe" />
          </div>
        </div>
      </Card>
    </a>
  );
}
