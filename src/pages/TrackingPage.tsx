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
import StatusTimeline from '../components/Tracking/StatusTimeline';
import Card from '../components/common/Card';
import { Spinner } from '../components/common/Loading';
import PageBackground from '../components/common/PageBackground';

// Tách thư viện quét QR khỏi bundle chính
const QRScanner = lazy(() => import('../components/Tracking/QRScanner'));

export default function TrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState<string | null>(null);
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
      <PageBackground video="bg-lang-noi.mp4" />
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
