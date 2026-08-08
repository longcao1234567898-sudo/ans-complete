/**
 * Tạo PHIẾU MÃ TRA CỨU dạng ảnh PNG để bà con lưu về máy.
 *
 * VÌ SAO CẦN: mã tra cứu chỉ hiện trên màn hình, bà con tắt trình duyệt là mất.
 * Ghi ra giấy thì dễ sai (nhầm 0 với O, 1 với I). Tải ảnh về máy chắc chắn nhất —
 * ảnh nằm trong thư viện điện thoại, mở lại lúc nào cũng được.
 *
 * Vẽ bằng canvas ngay trên máy người dùng, không gửi gì lên máy chủ.
 */
import QRCode from 'qrcode';
import { UNIT } from './constants';

interface ReceiptData {
  trackingCode: string;
  category: string;
  createdAt?: Date;
  deadlineDays?: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  to_giac: 'Tố giác tin báo',
  khieu_nai: 'Khiếu nại',
  phan_anh: 'Phản ánh',
  de_xuat: 'Đề xuất, kiến nghị',
};

const SLA_DAYS: Record<string, number> = {
  to_giac: 20, khieu_nai: 30, phan_anh: 15, de_xuat: 10,
};

/**
 * Vẽ phiếu ra canvas rồi trả về dataURL PNG.
 * Bất đồng bộ vì phải sinh mã QR trước khi vẽ.
 */
export async function buildReceiptImage(data: ReceiptData): Promise<string> {
  const W = 720, H = 1180;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const now = data.createdAt ?? new Date();
  const slaDays = data.deadlineDays ?? SLA_DAYS[data.category] ?? 15;
  const deadline = new Date(now.getTime() + slaDays * 86400000);

  // Nền + viền xanh công an
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1B5E20';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  // Dải tiêu đề
  ctx.fillStyle = '#1B5E20';
  ctx.fillRect(6, 6, W - 12, 130);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('PHIẾU TIẾP NHẬN Ý KIẾN', W / 2, 62);
  ctx.font = '20px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText(UNIT.name, W / 2, 100);

  // Nhãn mã tra cứu
  ctx.fillStyle = '#475569';
  ctx.font = '19px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('MÃ TRA CỨU CỦA BÀ CON', W / 2, 200);

  // Ô mã tra cứu cỡ lớn
  ctx.fillStyle = '#F1F8E9';
  ctx.fillRect(60, 225, W - 120, 130);
  ctx.strokeStyle = '#1B5E20';
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 225, W - 120, 130);
  ctx.fillStyle = '#1B5E20';
  ctx.font = 'bold 62px "Be Vietnam Pro", Arial, monospace';
  ctx.fillText(data.trackingCode, W / 2, 312);

  // Thông tin chi tiết
  ctx.textAlign = 'left';
  ctx.font = '19px "Be Vietnam Pro", Arial, sans-serif';
  const rows: [string, string][] = [
    ['Nhóm xử lý:', CATEGORY_LABEL[data.category] ?? data.category],
    ['Ngày gửi:', now.toLocaleString('vi-VN')],
    ['Hạn xử lý:', `${deadline.toLocaleDateString('vi-VN')} (${slaDays} ngày)`],
  ];
  let y = 415;
  for (const [k, v] of rows) {
    ctx.fillStyle = '#64748B';
    ctx.fillText(k, 70, y);
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 19px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText(v, 250, y);
    ctx.font = '19px "Be Vietnam Pro", Arial, sans-serif';
    y += 42;
  }

  // Đường kẻ ngăn
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(60, y + 10);
  ctx.lineTo(W - 60, y + 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // ───── MÃ QR: quét là mở thẳng trang tra cứu, khỏi gõ mã ─────
  y += 45;
  const trackUrl = `${window.location.origin}/tra-cuu?ma=${data.trackingCode}`;
  const QR_SIZE = 210;
  try {
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, trackUrl, {
      width: QR_SIZE,
      margin: 1,
      color: { dark: '#1B5E20', light: '#ffffff' },
      errorCorrectionLevel: 'H', // in ra giấy dễ nhoè -> mức sửa lỗi cao nhất
    });

    // QR bên trái
    const qrX = 70;
    ctx.drawImage(qrCanvas, qrX, y);

    // Khung viền quanh QR cho nổi
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - 6, y - 6, QR_SIZE + 12, QR_SIZE + 12);

    // Hướng dẫn bên phải QR
    const tx = qrX + QR_SIZE + 32;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1B5E20';
    ctx.font = 'bold 22px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText('QUÉT MÃ ĐỂ', tx, y + 34);
    ctx.fillText('XEM KẾT QUẢ', tx, y + 62);

    ctx.fillStyle = '#475569';
    ctx.font = '16px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText('Mở camera điện thoại,', tx, y + 100);
    ctx.fillText('đưa vào mã bên cạnh —', tx, y + 124);
    ctx.fillText('không cần gõ mã.', tx, y + 148);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText('Hoặc xem cách thủ công', tx, y + 186);
    ctx.fillText('ở phía dưới.', tx, y + 206);

    y += QR_SIZE + 45;
  } catch {
    // Sinh QR lỗi -> bỏ qua, phiếu vẫn dùng được bằng mã chữ
  }

  // Hướng dẫn thủ công (phòng khi không quét được)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1B5E20';
  ctx.font = 'bold 20px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('HOẶC XEM THỦ CÔNG', 70, y);

  ctx.fillStyle = '#334155';
  ctx.font = '17px "Be Vietnam Pro", Arial, sans-serif';
  const steps = [
    `1. Vào trang: ${window.location.host}`,
    '2. Bấm mục "Tra cứu kết quả"',
    `3. Nhập mã ${data.trackingCode}`,
  ];
  y += 32;
  for (const st of steps) {
    ctx.fillText(st, 70, y);
    y += 28;
  }

  ctx.fillStyle = '#64748B';
  ctx.font = '15px "Be Vietnam Pro", Arial, sans-serif';
  y += 8;
  ctx.fillText('Máy của bà con đã tự nhớ mã này — lần sau vào trang', 70, y);
  ctx.fillText('Tra cứu là thấy sẵn, không cần nhập lại.', 70, y + 24);

  // Chân phiếu: hotline
  ctx.fillStyle = '#FEF2F2';
  ctx.fillRect(6, H - 116, W - 12, 110);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#B91C1C';
  ctx.font = 'bold 22px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('Khẩn cấp gọi ngay 113', W / 2, H - 72);
  ctx.fillStyle = '#7F1D1D';
  ctx.font = '18px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText(`Trực ban ${UNIT.shortName ?? UNIT.name}: ${UNIT.hotline}`, W / 2, H - 40);

  return canvas.toDataURL('image/png');
}

/**
 * Tải phiếu về máy (tự động hoặc khi bấm nút).
 *
 * Trả về TRUE khi đã thật sự bấm tải, FALSE khi không vẽ được phiếu. Màn hình
 * xác nhận dựa vào giá trị này để hiện dòng "đã lưu vào máy" — nếu hàm không
 * trả gì thì dòng đó luôn hiện, kể cả lúc bà con chưa có tấm ảnh nào cả.
 */
export async function downloadReceipt(data: ReceiptData): Promise<boolean> {
  const url = await buildReceiptImage(data);
  if (!url) return false;
  const a = document.createElement('a');
  a.download = `Ma-tra-cuu-${data.trackingCode}.png`;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}
