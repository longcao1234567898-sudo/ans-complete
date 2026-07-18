/**
 * Trang "Tra cứu": nhập mã hoặc quét QR, hiển thị timeline trạng thái xử lý.
 * QRScanner được lazy-load: thư viện quét QR (~300KB) chỉ tải khi người dùng
 * thật sự bấm nút quét — giúp trang khởi động nhanh và nhẹ hơn hẳn.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MascotSearch } from '../components/common/PoliceMascot';
import { useTracking } from '../hooks/useTracking';
import TrackingForm from '../components/Tracking/TrackingForm';
import { useTrackingHistory } from '../hooks/useTrackingHistory';
import StatusTimeline from '../components/Tracking/StatusTimeline';
import Card from '../components/common/Card';
import { Spinner } from '../components/common/Loading';
import PageBackground from '../components/common/PageBackground';
import Reveal from '../components/common/Reveal';
import { History as HistoryIcon, X } from 'lucide-react';

// Tách thư viện quét QR khỏi bundle chính
const QRScanner = lazy(() => import('../components/Tracking/QRScanner'));

export default function TrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState<string | null>(null);
  const history = useTrackingHistory();
  const [scannerOpen, setScannerOpen] = useState(false);

  const { data, isLoading, isError, error, isFetching } = useTracking(code);

  // Tự động tra cứu nếu URL có sẵn ?ma=... (ví dụ từ mã QR)
  useEffect(() => {
    const fromUrl = searchParams.get('ma');
    if (fromUrl && fromUrl.trim().length >= 6) setCode(fromUrl.trim().toUpperCase());
  }, [searchParams]);

  const handleSubmit = (newCode: string) => {
    setCode(newCode);
    setSearchParams({ ma: newCode });
  };

  const handleDetected = (detectedCode: string) => {
    setScannerOpen(false);
    handleSubmit(detectedCode);
  };

  return (
    <>
      <PageBackground image="bg-lang-noi.webp" />
      <div className="container-page max-w-2xl py-10 sm:py-14">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">Tra cứu tiến độ</h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Nhập mã 6 ký tự trên phiếu tiếp nhận hoặc quét mã QR để xem trạng thái xử lý.
        </p>
      </div>

      <Card>
        <TrackingForm
          initialCode={searchParams.get('ma') ?? ''}
          onSubmit={handleSubmit}
          onOpenScanner={() => setScannerOpen(true)}
          isLoading={isLoading || isFetching}
        />
        <p className="mt-3 text-center text-xs text-slate-400">
          Thử ngay với mã demo: <span className="font-mono font-semibold">DEMO01</span>,{' '}
          <span className="font-mono font-semibold">DEMO02</span>,{' '}
          <span className="font-mono font-semibold">DEMO03</span>,{' '}
          <span className="font-mono font-semibold">DEMO04</span>
        </p>
      </Card>

      {/* MÃ ĐÃ GỬI TỪ THIẾT BỊ NÀY — tra lại không cần nhớ mã, không cần đăng nhập */}
      {history.items.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <HistoryIcon className="h-4 w-4 text-primary-600" /> Mã bà con đã gửi từ máy này
            </h2>
            <button
              onClick={() => { if (confirm('Xoá toàn bộ lịch sử mã trên máy này?')) history.clearAll(); }}
              className="text-xs text-slate-400 underline hover:text-red-500"
            >
              Xoá hết
            </button>
          </div>
          <ul className="space-y-2">
            {history.items.map((it) => (
              <li
                key={it.code}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60"
              >
                <button
                  onClick={() => { setCode(it.code); setSearchParams({ ma: it.code }); }}
                  className="flex min-h-[40px] flex-1 items-center gap-3 text-left"
                >
                  <span className="font-mono text-sm font-bold text-primary-600 dark:text-primary-300">{it.code}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(it.savedAt).toLocaleDateString('vi-VN')}
                  </span>
                </button>
                <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">Xem →</span>
                <button
                  onClick={() => history.removeCode(it.code)}
                  aria-label="Xoá mã này"
                  className="ml-1 rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Danh sách này chỉ lưu trên máy của bà con, không ai khác xem được.
            Nếu dùng máy chung, bà con nên bấm "Xoá hết" sau khi tra cứu xong.
          </p>
        </div>
      )}

      {(isLoading || isFetching) && <Spinner label="Đang tra cứu mã..." />}

      {isError && (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-red-100 bg-red-50 p-6 text-center dark:border-red-900/40 dark:bg-red-900/10">
          <MascotSearch className="h-32 w-auto" />
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Không tìm thấy mã tra cứu.'}
          </p>
        </div>
      )}

      {data && !isLoading && !isFetching && <StatusTimeline result={data} />}

      {/* Chỉ mount + tải thư viện quét QR khi người dùng bấm nút quét */}
      {scannerOpen && (
        <Suspense fallback={null}>
          <QRScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleDetected} />
        </Suspense>
      )}
    </div>
    </>
  );
}
