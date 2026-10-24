/**
 * BỘ KẾT NỐI eSMS.vn — gửi mã xác minh số qua Zalo (ZNS) và SMS thương hiệu (P89)
 * ============================================================================
 *
 * Tự đăng ký kênh vào lib/kenh-gui-ma.js khi đủ biến môi trường:
 *   ESMS_API_KEY, ESMS_SECRET_KEY        — khoá API (BÍ MẬT, chỉ ở máy chủ, KHÔNG để VITE_*)
 *   kênh "zalo": ESMS_ZALO_OAID, ESMS_ZALO_TEMPID   — Zalo OA + mẫu tin OTP đã được duyệt
 *   kênh "sms" : ESMS_BRANDNAME                      — tên người gửi đã đăng ký
 *   ESMS_SANDBOX=1                       — thử: eSMS tạo tin nhưng KHÔNG gửi đi
 * Thiếu biến của kênh nào thì kênh đó KHÔNG đăng ký -> KENH_XAC_MINH_SDT có tên
 * kênh đó thì cả tính năng TẮT và báo lúc khởi động (luật 1), không âm thầm bỏ.
 *
 * ⚠️ NHÀ CUNG CẤP NHẬN LỆNH ≠ NGƯỜI DÂN NHẬN TIN. eSMS trả CodeResult "100" là đã
 * NHẬN lệnh gửi; Zalo có thể thất bại SAU ĐÓ (số không dùng Zalo) mà máy chủ không
 * biết. Vì vậy không tự chuyển sang SMS sau khi Zalo nhận lệnh — giao diện có nút
 * "Không nhận được mã qua Zalo? Gửi qua SMS" để người dân tự chọn (SMS tốn tiền hơn,
 * chỉ gửi khi người cần).
 *
 * Mẫu tin Zalo do Zalo duyệt — khi đăng ký mẫu phải giữ nội dung TRUNG TÍNH như
 * NOI_DUNG_MA (không chữ "Công an", "tố giác"): tin hiện trên màn hình điện thoại.
 *
 * ĐANG THỬ NGHIỆM CHỈ MỞ ZALO (KENH_XAC_MINH_SDT=zalo). Kênh SMS xây sẵn: khai
 * ESMS_BRANDNAME là bộ kết nối có, nhưng KHÔNG gửi tin nào cho tới khi người vận
 * hành thêm "sms" vào KENH_XAC_MINH_SDT — biến đó là công tắc duy nhất.
 *
 * Địa chỉ API theo tài liệu eSMS (developers.esms.vn). Trước khi chạy thật, thử
 * với ESMS_SANDBOX=1 để chắc địa chỉ và mã trả về đúng với tài khoản của đơn vị.
 * Không ghi số điện thoại, mã, khoá vào nhật ký.
 */
import { dangKyKenh } from '../kenh-gui-ma.js';

const GOC = 'https://rest.esms.vn/MainService.svc/json';
export const DUONG_ZALO = `${GOC}/SendZaloMessage_V4_post_json/`;
export const DUONG_SMS = `${GOC}/SendMultipleMessage_V4_post_json/`;
/* Chỉ hai địa chỉ viết sẵn — kiểm A10 (tests/ra-soat-owasp) soi chỗ gọi fetch */
const DUONG_ESMS = Object.freeze({ zalo: DUONG_ZALO, sms: DUONG_SMS });
const HET_GIO_MS = 10_000;
/* Mã eSMS nghĩa là lệnh bị chặn TRƯỚC khi gửi (theo tài liệu eSMS): 101 sai
   ApiKey/SecretKey, 102 tài khoản bị khoá, 103 không đủ tiền, 104 sai tên thương
   hiệu. Đối chiếu lại khi chạy ESMS_SANDBOX=1 lần đầu (ND-073) */
const MA_CHUA_GUI = new Set(['101', '102', '103', '104']);

const mien = (s) => String(s ?? '').trim();

async function goi(kenh, than) {
  const r = await fetch(DUONG_ESMS[kenh], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(than),
    signal: AbortSignal.timeout(HET_GIO_MS),
  });
  /* CHỈ coi là "chưa gửi" khi chắc chắn (allow-list, luật 5): eSMS trả lời bình
     thường (HTTP 2xx) với mã báo lệnh bị chặn TRƯỚC khi gửi. Mọi thứ khác — đứt
     mạng, hết giờ (fetch ném), máy chủ eSMS lỗi (kể cả kèm CodeResult), mã "99"
     (lỗi không xác định), mã chưa biết — là MẬP MỜ: eSMS có thể đã nhận và tính
     tiền, nên NÉM để kenh-gui-ma không gửi thêm kênh khác. Lỗi không mang số, mã
     hay khoá. */
  const j = await r.json().catch(() => null);
  const ma = mien(j?.CodeResult ?? j?.CodeResponse).slice(0, 10);
  if (!r.ok) throw new Error(`eSMS lỗi máy chủ (HTTP ${r.status}${ma ? `, mã ${ma}` : ''})`);
  if (ma === '100') return { ok: true };
  if (MA_CHUA_GUI.has(ma)) {
    console.error(`[eSMS] từ chối lệnh gửi, mã ${ma}`);
    return { ok: false, lyDo: `esms_${ma}` };
  }
  throw new Error(`eSMS trả lời mập mờ (${ma ? `mã ${ma}` : 'không đọc được'}, HTTP ${r.status})`);
}

/** Đăng ký các kênh đủ cấu hình. Gọi lại được (thử nghiệm đổi biến môi trường). */
export function dangKyEsms(env = process.env) {
  const ApiKey = mien(env.ESMS_API_KEY);
  const SecretKey = mien(env.ESMS_SECRET_KEY);
  if (!ApiKey || !SecretKey) return [];
  const Sandbox = mien(env.ESMS_SANDBOX) === '1' ? '1' : '0';
  const daDangKy = [];

  const OAID = mien(env.ESMS_ZALO_OAID);
  const TempID = mien(env.ESMS_ZALO_TEMPID);
  if (OAID && TempID) {
    dangKyKenh('zalo', {
      /* Mẫu ZNS chỉ có MỘT biến: mã 6 số — nội dung khác nằm trong mẫu đã duyệt */
      guiMa: ({ soDienThoai, ma }) => goi('zalo', {
        ApiKey, SecretKey, OAID, TempID, Phone: soDienThoai, Params: [String(ma)], Sandbox,
      }),
    });
    daDangKy.push('zalo');
  }

  const Brandname = mien(env.ESMS_BRANDNAME);
  if (Brandname) {
    dangKyKenh('sms', {
      /* SmsType 2 = tin thương hiệu CSKH (tin giao dịch, không quảng cáo); không dấu */
      guiMa: ({ soDienThoai, noiDung }) => goi('sms', {
        ApiKey, SecretKey, Phone: soDienThoai, Content: noiDung, Brandname, SmsType: '2', IsUnicode: '0', Sandbox,
      }),
    });
    daDangKy.push('sms');
  }
  return daDangKy;
}

dangKyEsms();
