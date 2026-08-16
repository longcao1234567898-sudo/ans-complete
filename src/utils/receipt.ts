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

/* --------------------------------------------------------------------------
   VẼ MÃ QR TRỰC TIẾP LÊN PHIẾU

   Dùng QRCode.create() — hàm này trả kết quả NGAY, không phải chờ.
   Các hàm toDataURL/toCanvas của cùng thư viện đều trả về lời hứa, dùng chúng
   thì phải đổi cả buildReceiptImage và mọi nơi gọi nó sang bất đồng bộ, kéo
   theo sửa ở bốn chỗ khác. Tự vẽ từng ô vuông vừa gọn vừa không đụng gì.
   -------------------------------------------------------------------------- */
function veMaQR(ctx: CanvasRenderingContext2D, noiDung: string,
                x: number, y: number, canh: number) {
  try {
    const qr = QRCode.create(noiDung, { errorCorrectionLevel: 'M' });
    const soO = qr.modules.size;
    const oVuong = canh / soO;

    /* Nền trắng lấn ra 8px mỗi bên: máy quét cần vùng trắng quanh mã mới đọc
       được. Dán mã sát viền là nhiều điện thoại quét mãi không ra. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 8, y - 8, canh + 16, canh + 16);

    ctx.fillStyle = '#1E293B';
    for (let h = 0; h < soO; h += 1) {
      for (let c = 0; c < soO; c += 1) {
        if (qr.modules.get(h, c)) {
          /* +1 để các ô liền nhau, tránh khe hở làm máy quét đọc sai */
          ctx.fillRect(x + c * oVuong, y + h * oVuong, oVuong + 1, oVuong + 1);
        }
      }
    }
    return true;
  } catch {
    /* Không vẽ được mã QR thì phiếu vẫn còn mã tra cứu và mã PIN — bà con
       nhập tay được. Thà thiếu mã QR còn hơn hỏng cả phiếu. */
    return false;
  }
}

interface ReceiptData {
  trackingCode: string;
  /** Mã PIN 6 số vào phòng trao đổi — chỉ có khi máy chủ cấp lúc gửi ý kiến */
  chatPin?: string;
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

/** Vẽ phiếu ra canvas rồi trả về dataURL PNG */
export function buildReceiptImage(data: ReceiptData): string {
  /* Cao 1000 -> 1040: bố cục hai cột đẩy phần hướng dẫn xuống, dòng
     "Máy của bà con đã tự nhớ mã này..." bị dải chân trang che mất một nửa.
     Đã dựng ảnh thật ra xem mới thấy. */
  const W = 720, H = 1040;
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

  /* ========================================================================
     BỐ CỤC MỚI — HAI CỘT

       Cột TRÁI  : mã tra cứu (to) + mã PIN, hai thứ bà con phải gõ tay
       Cột PHẢI  : mã QR quét thẳng vào trang tra cứu

     Trước đây xếp dọc: mã tra cứu, rồi PIN, rồi mới tới thông tin — phiếu dài
     mà nửa bên phải bỏ trống. Xếp hai cột thì vừa gọn hơn, vừa có chỗ đặt mã
     QR ngay cạnh mã tra cứu, nhìn là hiểu hai thứ này cùng dùng để tra cứu.
     ======================================================================== */
  const X_TRAI = 60;
  const R_TRAI = 420;                       // cột trái rộng tới đây
  const QR_CANH = 200;
  const QR_X = 470;
  const QR_Y = 200;

  // ── Cột trái: nhãn + ô mã tra cứu ──────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = '17px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('MÃ TRA CỨU CỦA BÀ CON', X_TRAI, 185);

  ctx.fillStyle = '#F1F8E9';
  ctx.fillRect(X_TRAI, 200, R_TRAI - X_TRAI, 104);
  ctx.strokeStyle = '#1B5E20';
  ctx.lineWidth = 3;
  ctx.strokeRect(X_TRAI, 200, R_TRAI - X_TRAI, 104);

  ctx.fillStyle = '#1B5E20';
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px "Be Vietnam Pro", Arial, monospace';
  ctx.fillText(data.trackingCode, (X_TRAI + R_TRAI) / 2, 272);

  /* ── Ô mã PIN — ngay dưới mã tra cứu, cùng cột ─────────────────────────
     Vì sao phải in vào phiếu: máy chủ chỉ trả mã PIN đúng MỘT LẦN, database
     giữ bản băm nên không cấp lại được. Bà con đóng trình duyệt là mất luôn
     kênh trao đổi với cán bộ. */
  if (data.chatPin) {
    ctx.fillStyle = '#FFF8E1';
    ctx.fillRect(X_TRAI, 318, R_TRAI - X_TRAI, 82);
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 2;
    ctx.strokeRect(X_TRAI, 318, R_TRAI - X_TRAI, 82);

    ctx.fillStyle = '#92400E';
    ctx.font = 'bold 15px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText('MÃ PIN TRAO ĐỔI VỚI CÁN BỘ', (X_TRAI + R_TRAI) / 2, 342);
    ctx.font = 'bold 34px "Be Vietnam Pro", Arial, monospace';
    ctx.fillText(data.chatPin, (X_TRAI + R_TRAI) / 2, 384);
  }

  // ── Cột phải: mã QR ────────────────────────────────────────────────────
  const linkTraCuu = `${window.location.origin}/tra-cuu?ma=${data.trackingCode}`;
  const veDuoc = veMaQR(ctx, linkTraCuu, QR_X, QR_Y, QR_CANH);

  if (veDuoc) {
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText('QUÉT ĐỂ TRA CỨU', QR_X + QR_CANH / 2, QR_Y + QR_CANH + 32);
    ctx.font = '14px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText('Mở camera điện thoại', QR_X + QR_CANH / 2, QR_Y + QR_CANH + 54);
    ctx.fillText('rồi hướng vào mã này', QR_X + QR_CANH / 2, QR_Y + QR_CANH + 74);
  }

  // Thông tin chi tiết
  ctx.textAlign = 'left';
  ctx.font = '19px "Be Vietnam Pro", Arial, sans-serif';
  const rows: [string, string][] = [
    ['Nhóm xử lý:', CATEGORY_LABEL[data.category] ?? data.category],
    ['Ngày gửi:', now.toLocaleString('vi-VN')],
    ['Hạn xử lý:', `${deadline.toLocaleDateString('vi-VN')} (${slaDays} ngày)`],
  ];
  /* Bắt đầu dưới cả hai cột. Cột phải (mã QR + chú thích) luôn cao hơn cột
     trái, nên lấy theo cột phải để không đè lên nhau. */
  let y = 500;
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

  // Hướng dẫn tra cứu
  y += 55;
  ctx.fillStyle = '#1B5E20';
  ctx.font = 'bold 21px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('CÁCH XEM KẾT QUẢ', 70, y);

  ctx.fillStyle = '#334155';
  ctx.font = '18px "Be Vietnam Pro", Arial, sans-serif';
  const steps = [
    `1. Vào trang: ${window.location.host}`,
    '2. Bấm mục "Tra cứu kết quả"',
    `3. Nhập mã ${data.trackingCode}`,
    ...(data.chatPin
      ? [`4. Muốn trao đổi thêm: nhập mã PIN ${data.chatPin}`]
      : []),
  ];
  y += 38;
  for (const st of steps) {
    ctx.fillText(st, 70, y);
    y += 32;
  }

  ctx.fillStyle = '#64748B';
  ctx.font = '16px "Be Vietnam Pro", Arial, sans-serif';
  y += 12;
  ctx.fillText('Máy của bà con đã tự nhớ mã này — lần sau vào trang', 70, y);
  ctx.fillText('Tra cứu là thấy sẵn, không cần nhập lại.', 70, y + 26);

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
 * @returns true nếu đã kích hoạt tải; false khi trình duyệt không vẽ được canvas
 *          hoặc chặn thao tác tải — nơi gọi dựa vào đây để hiện dòng "đã lưu".
 */
export function downloadReceipt(data: ReceiptData): boolean {
  try {
    const url = buildReceiptImage(data);
    if (!url) return false;
    const a = document.createElement('a');
    a.download = `Ma-tra-cuu-${data.trackingCode}.png`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}
