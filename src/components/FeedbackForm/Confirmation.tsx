/**
 * Bước 5: Xác nhận thông tin trước khi gửi; sau khi gửi thành công hiển thị
 * mã tra cứu 6 ký tự kèm mã QR, nút sao chép mã và nút TẢI QR VỀ MÁY (PNG).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Download, Search } from 'lucide-react';
import { MascotCheer } from '../common/PoliceMascot';
import toast from 'react-hot-toast';
import type { FeedbackDraft, FeedbackSubmission } from '../../types/feedback';
import { CATEGORY_MAP } from '../../utils/constants';
import { downloadReceipt } from '../../utils/receipt';
import Button from '../common/Button';
import Badge from '../common/Badge';

interface ConfirmationProps {
  draft: FeedbackDraft;
  submission: FeedbackSubmission | null;
  isSubmitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
  onReset: () => void;
}

export default function Confirmation({ draft, submission, isSubmitting, onSubmit, onBack, onReset }: ConfirmationProps) {
  const [agreed, setAgreed] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState(false);
  const autoSaved = useRef(false);

  /* TỰ ĐỘNG TẢI PHIẾU MÃ TRA CỨU ngay khi gửi thành công.
     Bà con hay quên bấm nút lưu rồi tắt trình duyệt là mất mã.
     Tải sẵn về máy -> ảnh nằm trong thư viện, mở lại lúc nào cũng được. */
  useEffect(() => {
    if (!submission || autoSaved.current) return;
    autoSaved.current = true;
    const t = setTimeout(() => {
      try {
        downloadReceipt({ trackingCode: submission.trackingCode, category: submission.category });
        setSavedReceipt(true);
      } catch { /* trình duyệt chặn tải tự động -> bà con bấm nút thủ công */ }
    }, 900); // chờ chút cho màn hình hiện xong rồi mới tải
    return () => clearTimeout(t);
  }, [submission]);
  const [copied, setCopied] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    if (!submission) return;
    try {
      await navigator.clipboard.writeText(submission.trackingCode);
      setCopied(true);
      toast.success('Đã sao chép mã tra cứu');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Không thể sao chép, vui lòng thử lại');
    }
  };

  /** Chuyển SVG mã QR thành ảnh PNG 512px nền trắng và tải về máy */
  const handleDownloadQR = () => {
    const svg = qrWrapRef.current?.querySelector('svg');
    if (!svg || !submission) return;

    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();

    img.onload = () => {
      const size = 512;
      const pad = 40;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size + 56; // chừa chỗ in mã bên dưới
      const ctx = canvas.getContext('2d');
      if (!ctx) return toast.error('Trình duyệt không hỗ trợ tải QR');

      // Nền trắng + mã QR + dòng mã tra cứu
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
      ctx.fillStyle = '#1B5E20';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(submission.trackingCode.split('').join(' '), size / 2, size + 26);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `ma-tra-cuu-${submission.trackingCode}.png`;
      a.click();
      toast.success('Đã tải mã QR về máy');
    };
    img.onerror = () => toast.error('Không tạo được ảnh QR, vui lòng thử lại');
    img.src = `data:image/svg+xml;base64,${svg64}`;
  };

  // ---------- Đã gửi thành công ----------
  if (submission) {
    const qrValue = `${window.location.origin}/tra-cuu?ma=${submission.trackingCode}`;
    return (
      <div className="text-center">
        <MascotCheer className="mx-auto mb-3 h-36 w-auto" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Gửi ý kiến thành công!</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cảm ơn bà con đã đóng góp ý kiến. Vui lòng lưu lại mã tra cứu bên dưới.
        </p>

        <div className="mx-auto mt-5 max-w-xs rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50 p-5 dark:border-primary-800 dark:bg-primary-900/10">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Mã tra cứu của bà con</p>
          <p className="my-2 font-mono text-3xl font-extrabold tracking-[0.3em] text-primary-700 dark:text-primary-300">
            {submission.trackingCode}
          </p>

          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 shadow-sm transition hover:bg-primary-100 dark:bg-slate-800 dark:text-primary-300"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Đã sao chép' : 'Sao chép mã'}
            </button>
            <button
              onClick={() => {
                downloadReceipt({ trackingCode: submission.trackingCode, category: submission.category });
                setSavedReceipt(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700"
            >
              <Download className="h-3.5 w-3.5" />
              Tải phiếu về máy
            </button>
            <button
              onClick={handleDownloadQR}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 shadow-sm transition hover:bg-primary-100 dark:bg-slate-800 dark:text-primary-300"
            >
              <Download className="h-3.5 w-3.5" />
              Tải QR
            </button>
          </div>

          {savedReceipt && (
            <p className="mb-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Đã lưu phiếu mã tra cứu vào máy của bà con
            </p>
          )}

          <div ref={qrWrapRef} className="flex justify-center rounded-xl bg-white p-3 dark:bg-slate-100">
            <QRCodeSVG value={qrValue} size={140} fgColor="#1B5E20" />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Lưu ảnh QR để tra cứu nhanh: vào mục Tra cứu → biểu tượng QR → chọn ảnh từ máy
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <Link
            to={`/tra-cuu?ma=${submission.trackingCode}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-secondary-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-secondary-600 sm:w-auto"
          >
            <Search className="h-4 w-4" /> Xem tiến độ ngay
          </Link>
          <Button variant="outline" onClick={onReset}>
            Gửi ý kiến khác
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Xem lại trước khi gửi ----------
  const category = draft.category ? CATEGORY_MAP[draft.category] : null;
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">Xác nhận thông tin trước khi gửi</h3>

      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Nội dung (đã AI chuẩn hoá)</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {draft.analysis?.normalizedContent ?? draft.content}
          </p>
        </div>

        {draft.images.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Ảnh minh chứng ({draft.images.length})
            </p>
            <div className="flex gap-2">
              {draft.images.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`Ảnh minh chứng ${idx + 1}`}
                  className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                />
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Nhóm xử lý</p>
          {category && <Badge colorClass={category.colorClass}>{category.label}</Badge>}
        </div>

        <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Thông tin liên hệ</p>
          <ul className="space-y-0.5 text-slate-700 dark:text-slate-200">
            {draft.contact.isAnonymous && (
              <>
                <li className="font-semibold">🕶️ Gửi ẩn danh — không cung cấp danh tính</li>
                <li className="text-amber-700 dark:text-amber-400">Tin báo ẩn danh sẽ được cán bộ kiểm duyệt trước khi đưa vào xử lý</li>
              </>
            )}
            {draft.contact.fullName && <li>{draft.contact.fullName}</li>}
            {draft.contact.phone && <li>{draft.contact.phone}</li>}
            {draft.contact.email && <li>{draft.contact.email}</li>}
          </ul>
        </div>
      </div>

      {/* Đồng ý điều khoản — bắt buộc tick trước khi gửi */}
      <label className="mt-6 flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
        />
        <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Tôi xác nhận thông tin cung cấp là đúng sự thật và đồng ý để Công an tiếp nhận, xử lý ý kiến này
          theo{' '}
          <a href="/chinh-sach-bao-mat" target="_blank" className="font-semibold text-primary-600 underline dark:text-primary-400">
            Chính sách bảo mật
          </a>
          . Tôi hiểu rằng việc cố ý tố giác sai sự thật có thể bị xử lý theo quy định pháp luật.
        </span>
      </label>

      <div className="mt-4 flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
          Quay lại
        </Button>
        <Button onClick={onSubmit} loading={isSubmitting} disabled={!agreed}>
          Gửi ý kiến
        </Button>
      </div>
    </div>
  );
}
