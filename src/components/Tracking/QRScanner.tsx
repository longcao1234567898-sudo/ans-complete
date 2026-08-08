/**
 * Modal quét mã QR: dùng camera HOẶC chọn ảnh QR có sẵn trong máy (html5-qrcode).
 */
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff, ImageUp } from 'lucide-react';
import Modal from '../common/Modal';
import { Spinner } from '../common/Loading';

interface QRScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

const REGION_ID = 'qr-reader-region';
const CODE_PATTERN = /[A-Z0-9]{6}/;

export default function QRScanner({ open, onClose, onDetected }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    const scanner = new Html5Qrcode(REGION_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decodedText) => {
          const match = decodedText.toUpperCase().match(CODE_PATTERN);
          if (match) onDetected(match[0]);
        },
        () => {
          /* Bỏ qua lỗi decode từng khung hình — bình thường khi chưa thấy mã */
        }
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Không truy cập được camera. Bà con có thể chọn ảnh QR từ máy bên dưới hoặc nhập mã thủ công.');
          setStarting(false);
        }
      });

    return () => {
      cancelled = true;
      scannerRef.current
        ?.stop()
        .catch(() => {
          /* camera đã dừng hoặc chưa từng khởi động — bỏ qua */
        });
    };
  }, [open, onDetected]);

  /** Đọc mã QR từ ảnh người dùng chọn trong máy */
  const handlePickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const scanner = scannerRef.current;
    if (!file || !scanner) return;

    setReading(true);
    setError(null);

    // Dừng camera trước khi quét tệp (yêu cầu của thư viện)
    try {
      await scanner.stop();
    } catch {
      /* camera chưa chạy — bỏ qua */
    }

    try {
      const result = await scanner.scanFileV2(file, false);
      const match = result.decodedText.toUpperCase().match(CODE_PATTERN);
      if (match) {
        onDetected(match[0]);
      } else {
        setError('Ảnh có mã QR nhưng không chứa mã tra cứu hợp lệ (6 ký tự).');
      }
    } catch {
      setError('Không đọc được mã QR trong ảnh. Bà con thử ảnh rõ nét, đủ sáng hơn nhé.');
    } finally {
      setReading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quét mã QR" size="sm">
      <div className="overflow-hidden rounded-xl bg-slate-900">
        {starting && <Spinner label="Đang khởi động camera..." className="py-14 text-slate-300" />}
        {reading && <Spinner label="Đang đọc mã QR trong ảnh..." className="py-14 text-slate-300" />}
        {error && !reading ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-slate-300">
            <CameraOff className="h-8 w-8 text-slate-400" />
            {error}
          </div>
        ) : (
          <div id={REGION_ID} className="w-full" />
        )}
      </div>

      {/* Chọn ảnh QR từ máy */}
      <div className="mt-4">
        <div className="mb-3 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          hoặc
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={reading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary-300 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 disabled:opacity-60 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300"
        >
          <ImageUp className="h-4 w-4" />
          Chọn ảnh QR từ máy
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePickFile} className="hidden" aria-hidden />
      </div>

      <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
        Đưa mã QR trên phiếu vào khung hình, hoặc chọn ảnh QR đã tải về khi gửi ý kiến
      </p>
    </Modal>
  );
}
