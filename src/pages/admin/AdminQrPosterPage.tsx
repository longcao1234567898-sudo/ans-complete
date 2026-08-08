/**
 * TRANG TẠO MÃ QR TUYÊN TRUYỀN — kết nối online với thực địa (O2O).
 *
 * Cán bộ tạo tấm áp phích có mã QR -> tải PNG -> in ra dán tại
 * nhà văn hoá, quán cà phê, tiệm tạp hoá, bảng tin ấp/khóm.
 * Người dân quét là vào thẳng trang gửi ý kiến — không cần nhớ địa chỉ web.
 *
 * QR sinh ngay trên máy cán bộ (thư viện qrcode, client-side) — không gọi
 * dịch vụ ngoài, không lộ gì ra bên thứ ba.
 *
 * ⚠️ ĐỪNG NHẦM VỚI AdminQrPage.tsx ("Điểm QR"). Hai trang khác hẳn nhau:
 *   · Trang này  — áp phích TUYÊN TRUYỀN chung, QR trỏ tới trang chủ / gửi ý
 *                  kiến / tra cứu. Không gắn với địa bàn nào cả.
 *   · AdminQrPage — quản lý ĐIỂM QR có mã riêng lưu ở bảng `qr_points`, quét
 *                  xong form tự điền sẵn phường/xã của đúng điểm đó.
 * Trước đây file này tên "AdminQRPage.tsx" nên trên Windows (không phân biệt
 * hoa/thường) bị "AdminQrPage.tsx" ghi đè mất — đổi tên để hai trang cùng sống.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, QrCode, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import AdminLayout from '../../components/admin/AdminLayout';
import { UNIT } from '../../utils/constants';

const TARGETS = [
  { id: 'home', label: 'Trang chủ', path: '/' },
  { id: 'send', label: 'Gửi ý kiến (khuyên dùng)', path: '/gui-y-kien' },
  { id: 'track', label: 'Tra cứu kết quả', path: '/tra-cuu' },
];

export default function AdminQrPosterPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [target, setTarget] = useState('send');
  const [note, setNote] = useState('Quét để phản ánh tình hình an ninh trật tự');

  const url = window.location.origin + (TARGETS.find((t) => t.id === target)?.path ?? '/');

  // Vẽ áp phích: khung + tiêu đề + QR + ghi chú
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = 800, H = 1000;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    (async () => {
      // Nền trắng + viền xanh công an
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#1B5E20';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, W - 14, H - 14);

      // Dải tiêu đề
      ctx.fillStyle = '#1B5E20';
      ctx.fillRect(7, 7, W - 14, 130);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px "Be Vietnam Pro", sans-serif';
      ctx.fillText('HỘP THƯ SỐ — ĐIỂM CHẠM AN NINH', W / 2, 65);
      ctx.font = '24px "Be Vietnam Pro", sans-serif';
      ctx.fillText(UNIT.name, W / 2, 108);

      // Mã QR ở giữa
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, url, {
        width: 520,
        margin: 2,
        color: { dark: '#1B5E20', light: '#ffffff' },
        errorCorrectionLevel: 'H', // in ra giấy, dễ trầy xước -> mức sửa lỗi cao nhất
      });
      ctx.drawImage(qrCanvas, (W - 520) / 2, 190);

      // Ghi chú
      ctx.fillStyle = '#1B5E20';
      ctx.font = 'bold 32px "Be Vietnam Pro", sans-serif';
      const words = note.split(' ');
      let line = '', y = 790;
      for (const w2 of words) {
        if (ctx.measureText(line + w2).width > W - 120) {
          ctx.fillText(line.trim(), W / 2, y);
          line = w2 + ' ';
          y += 44;
        } else line += w2 + ' ';
      }
      ctx.fillText(line.trim(), W / 2, y);

      // Địa chỉ web + hotline
      ctx.fillStyle = '#475569';
      ctx.font = '24px "Be Vietnam Pro", sans-serif';
      ctx.fillText(window.location.host, W / 2, y + 60);
      if (UNIT.hotline) {
        ctx.font = 'bold 26px "Be Vietnam Pro", sans-serif';
        ctx.fillStyle = '#B91C1C';
        ctx.fillText(`Khẩn cấp: 113 · Trực ban: ${UNIT.hotline}`, W / 2, y + 105);
      }
    })();
  }, [url, note]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `QR-hop-thu-an-ninh-so-${target}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function printPoster() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<img src="${canvas.toDataURL('image/png')}" style="width:100%" onload="window.print()">`);
    win.document.close();
  }

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <QrCode className="h-5 w-5 text-primary-600" /> Mã QR tuyên truyền
      </h1>
      <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Tạo áp phích có mã QR để in, dán tại nhà văn hoá, quán cà phê, tiệm tạp hoá, bảng tin ấp/khóm.
        Bà con quét là vào thẳng trang gửi ý kiến — không cần nhớ địa chỉ web.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Quét QR sẽ mở trang
            </label>
            <div className="space-y-2">
              {TARGETS.map((t) => (
                <label key={t.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 transition has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50 dark:border-slate-700 dark:bg-slate-800/60 dark:has-[:checked]:bg-primary-900/20">
                  <input
                    type="radio"
                    name="target"
                    checked={target === t.id}
                    onChange={() => setTarget(t.id)}
                    className="h-4 w-4 accent-primary-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Dòng chữ trên áp phích
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 90))}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base sm:text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={download}
              className="btn-shine flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-primary-700"
            >
              <Download className="h-4 w-4" /> Tải ảnh PNG (in khổ A4/A5)
            </button>
            <button
              onClick={printPoster}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-primary-300 px-6 py-3 text-sm font-bold text-primary-700 transition hover:bg-primary-50 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-900/20"
            >
              <Printer className="h-4 w-4" /> In ngay
            </button>
          </div>

          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <b>Gợi ý dán:</b> nhà văn hoá ấp/khóm, quán cà phê, tiệm tạp hoá, chợ, cổng trường,
            bến phà. Ảnh cũng chia sẻ được lên nhóm Zalo/Facebook của ấp kèm lời giới thiệu.
          </p>
        </div>

        <div className="flex items-start justify-center">
          <canvas
            ref={canvasRef}
            className="w-full max-w-md rounded-2xl border border-slate-200 shadow-lg dark:border-slate-700"
          />
        </div>
      </div>
    </AdminLayout>
  );
}
