/**
 * KhuTepDinhKem — hiện ảnh và video đính kèm, bấm vào mở to xem được.
 *
 * VÌ SAO CẦN: trước đây mọi tệp đều vẽ bằng thẻ ảnh cỡ 96px. Hậu quả:
 *   - VIDEO KHÔNG HIỆN RA GÌ — thẻ ảnh không phát được video, cán bộ chỉ thấy
 *     một ô trống, tưởng bà con không gửi gì.
 *   - Ảnh quá nhỏ để nhìn ra biển số xe hay đặc điểm nhận dạng, mà bấm vào
 *     cũng không phóng to được.
 *
 * Với hồ sơ nghiệp vụ, xem rõ được bằng chứng là việc tối thiểu.
 */
import { useState } from 'react';
import { X, Play, Image as ImageIcon, AlertTriangle, Download } from 'lucide-react';

export interface TepDinhKem {
  image_url: string;
  mime_type: string;
  moderation_status: string;
}

interface Props {
  tep: TepDinhKem[];
}

/** Video hay ảnh? Dựa vào kiểu tệp, thiếu thì đoán theo đuôi đường dẫn. */
function laVideo(t: TepDinhKem): boolean {
  if (t.mime_type?.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(t.image_url || '');
}

export default function KhuTepDinhKem({ tep }: Props) {
  const [dangMo, setDangMo] = useState<TepDinhKem | null>(null);

  if (!tep || tep.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {tep.map((t, i) => {
          const video = laVideo(t);
          const nghiNgo = t.moderation_status === 'suspicious';
          return (
            <button
              key={i}
              type="button"
              onClick={() => setDangMo(t)}
              aria-label={video ? `Mở video ${i + 1}` : `Mở ảnh ${i + 1}`}
              className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 transition hover:border-primary-400 dark:border-slate-700"
            >
              {video ? (
                /* Video: hiện khung đen kèm nút phát. KHÔNG dùng thẻ ảnh —
                   thẻ ảnh không vẽ được video, chỉ ra ô trống. */
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-800 text-white">
                  <Play className="h-6 w-6" />
                  <span className="text-[10px] font-semibold">Video</span>
                </span>
              ) : (
                <img
                  src={t.image_url}
                  alt={`Ảnh minh chứng ${i + 1}`}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              )}

              {/* Nhãn nhắc cán bộ xem kỹ trước khi dùng làm căn cứ. */}
              {nghiNgo && (
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-amber-500/90 py-0.5 text-[9px] font-bold text-white">
                  <AlertTriangle className="h-2.5 w-2.5" /> Cần xem kỹ
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============ MỞ TO XEM ============ */}
      {dangMo && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/90 p-4"
          onClick={() => setDangMo(null)}
        >
          <button
            type="button"
            onClick={() => setDangMo(null)}
            aria-label="Đóng"
            className="absolute right-4 top-4 rounded-xl bg-white/15 p-2 text-white transition hover:bg-white/25"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Chặn bấm xuyên: bấm vào chính ảnh hay video thì không đóng, để cán
              bộ tua video hoặc phóng ảnh mà không bị tắt ngang. */}
          <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {laVideo(dangMo) ? (
              <video
                src={dangMo.image_url}
                controls
                autoPlay
                className="max-h-[80vh] w-full rounded-xl bg-black"
              />
            ) : (
              <img
                src={dangMo.image_url}
                alt="Xem đầy đủ"
                className="max-h-[80vh] w-auto rounded-xl object-contain"
              />
            )}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <a
                href={dangMo.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
              >
                <ImageIcon className="h-4 w-4" /> Mở ở tab mới
              </a>
              <a
                href={dangMo.image_url}
                download
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
              >
                <Download className="h-4 w-4" /> Tải về máy
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
