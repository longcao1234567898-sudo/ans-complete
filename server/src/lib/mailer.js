import { UNIT } from './unit.js';
/**
 * Gửi email OTP — hỗ trợ 3 cách, tự chọn cách nào đã cấu hình.
 *
 * ┌─ 1. RESEND (KHUYÊN DÙNG) ────────────────────────────────────
 * │  Gửi qua HTTPS (cổng 443) -> KHÔNG BAO GIỜ bị chặn.
 * │  Render/Netlify hay CHẶN cổng SMTP (465/587) -> Gmail bị "Connection timeout".
 * │  Miễn phí 3.000 email/tháng. Đăng ký: resend.com
 * │    RESEND_API_KEY=re_xxxxxxxx
 * │    MAIL_FROM=onboarding@resend.dev        (dùng ngay, không cần tên miền)
 * └──────────────────────────────────────────────────────────────
 *
 * ┌─ 2. GMAIL SMTP (hay bị timeout trên Render) ─────────────────
 * │    MAIL_USER=hopthuanninhso@gmail.com
 * │    MAIL_PASS=<App Password 16 ký tự>
 * └──────────────────────────────────────────────────────────────
 *
 * ┌─ 3. CHẾ ĐỘ DEMO (không cấu hình gì) — CHỈ MÁY CÁ NHÂN ───────
 * │  Trả mã ra màn hình. Chỉ bật khi NODE_ENV khai rõ development/test
 * │  (choPhepMaDemo). Nơi khác chưa khai email thì routes/otp.js từ chối
 * │  503 — trả mã ra màn hình ở máy thật là ai cũng xác thực được email
 * │  người khác (BUG-025).
 * └──────────────────────────────────────────────────────────────
 */
import nodemailer from 'nodemailer';

const env = (k) => (process.env[k] || '').trim();

export function mailConfigured() {
  return Boolean(env('BREVO_API_KEY') || env('RESEND_API_KEY') || (env('MAIL_USER') && env('MAIL_PASS')));
}

/**
 * Được trả mã ra màn hình (chế độ DEMO) không — BUG-025.
 * An toàn là mặc định, nới lỏng phải khai báo tường minh: chỉ khi NODE_ENV
 * khai ĐÚNG development hoặc test. Không dựa vào NODE_ENV=production để nhận
 * ra máy thật, vì Render không đặt biến đó (xem routes/auth.js) — không khai
 * cũng là máy thật.
 */
export function choPhepMaDemo() {
  return ['development', 'test'].includes(env('NODE_ENV'));
}

/** Dòng báo cách gửi email — in lúc khởi động ở mọi điểm vào có gắn /api/otp */
export function moTaCheDoEmail() {
  const mm = mailMode();
  if (mm === 'brevo') return '📧 Email OTP: Brevo (gửi được tới BẤT KỲ email)';
  if (mm === 'resend') return '📧 Email OTP: Resend (⚠️ chưa có tên miền -> chỉ gửi tới email của chính bạn)';
  if (mm === 'gmail') return '📧 Email OTP: Gmail SMTP (⚠️ Render hay chặn cổng SMTP)';
  return choPhepMaDemo()
    ? '📧 Email OTP: CHẾ ĐỘ DEMO (máy cá nhân — hiện mã trên màn hình)'
    : '📧 Email OTP: TẮT — chưa cấu hình email, /api/otp/send trả 503 (BUG-025). Khai BREVO_API_KEY nếu cần xác thực email';
}

/** Cách nào đang được dùng — hiện ở log lúc khởi động */
export function mailMode() {
  if (env('BREVO_API_KEY')) return 'brevo';   // gửi tới BẤT KỲ AI, không cần tên miền
  if (env('RESEND_API_KEY')) return 'resend'; // chỉ gửi tới email của chính bạn (nếu chưa có tên miền)
  if (env('MAIL_USER') && env('MAIL_PASS')) return 'gmail';
  return 'demo';
}

function emailHtml(code) {
  return `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#1B5E20;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center">
      <h2 style="margin:0;font-size:18px">HỘP THƯ SỐ — ĐIỂM CHẠM AN NINH</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:.85">${UNIT.name}</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="color:#334155;font-size:15px">Kính gửi bà con,</p>
      <p style="color:#334155;font-size:15px">Mã xác thực để gửi ý kiến của bà con là:</p>
      <div style="text-align:center;margin:24px 0">
        <span style="display:inline-block;background:#f0fdf4;border:2px dashed #1B5E20;
                     color:#1B5E20;font-size:34px;font-weight:800;letter-spacing:10px;
                     padding:14px 24px;border-radius:12px;font-family:monospace">${code}</span>
      </div>
      <p style="color:#64748b;font-size:13px;line-height:1.6">
        • Mã có hiệu lực trong <b>10 phút</b>.<br>
        • Tuyệt đối <b>KHÔNG chia sẻ</b> mã này cho bất kỳ ai, kể cả người tự xưng là cán bộ Công an.<br>
        • Nếu bà con không yêu cầu mã này, vui lòng bỏ qua email.
      </p>
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0">
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Email tự động — vui lòng không trả lời.</p>
    </div>
  </div>`;
}

const SUBJECT = (code) => `${code} là mã xác thực gửi ý kiến — Điểm Chạm An Ninh`;
const TEXT = (code) => `Ma xac thuc cua ba con la: ${code}. Ma co hieu luc trong 10 phut. Khong chia se ma nay cho bat ky ai.`;

/* ---------- Cách 1: RESEND (HTTPS — không bị chặn) ---------- */
async function sendViaResend(email, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env('MAIL_FROM') || 'Diem Cham An Ninh <onboarding@resend.dev>',
      to: [email],
      subject: SUBJECT(code),
      html: emailHtml(code),
      text: TEXT(code),
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Resend lỗi ${res.status}`);
  }
  return { sent: true };
}

/* ---------- Cách 1b: BREVO (HTTPS — gửi tới BẤT KỲ AI) ----------
 * 300 email/ngày miễn phí. CHỈ cần xác minh 1 địa chỉ Gmail của bạn,
 * KHÔNG cần mua tên miền. Đăng ký: brevo.com
 *   BREVO_API_KEY=xkeysib-xxxxxxxx
 *   MAIL_USER=longcao1234567898@gmail.com   (email đã xác minh trên Brevo)
 */
async function sendViaBrevo(email, code) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env('BREVO_API_KEY'),
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: 'Điểm Chạm An Ninh',
        email: env('MAIL_USER') || 'noreply@example.com',
      },
      to: [{ email }],
      subject: SUBJECT(code),
      htmlContent: emailHtml(code),
      textContent: TEXT(code),
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Brevo lỗi ${res.status}`);
  }
  return { sent: true };
}

/* ---------- Cách 2: GMAIL SMTP ---------- */
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,              // STARTTLS — ít bị chặn hơn 465
    secure: false,
    auth: {
      user: env('MAIL_USER'),
      pass: env('MAIL_PASS').replace(/\s/g, ''), // App Password hay dính dấu cách
    },
    connectionTimeout: 10000, // thất bại nhanh, không treo mãi
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  return transporter;
}

async function sendViaGmail(email, code) {
  await getTransporter().sendMail({
    from: env('MAIL_FROM') || `"Điểm Chạm An Ninh" <${env('MAIL_USER')}>`,
    to: email,
    subject: SUBJECT(code),
    html: emailHtml(code),
    text: TEXT(code),
  });
  return { sent: true };
}

/* ---------- Hàm chính ---------- */
export async function sendOtpEmail(email, code) {
  const mode = mailMode();

  /* Chưa cấu hình -> DEMO: trả mã ra màn hình, chỉ ở máy cá nhân.
     Không ghi email ra log, kể cả ở đây: email là thông tin nhận diện người
     gửi, log máy chủ không phải nơi giữ nó (BUG-025). Mã đã nằm trong phản
     hồi nên log cũng không cần chép lại. */
  if (mode === 'demo') {
    if (!choPhepMaDemo()) return { failed: true };
    console.warn('⚠️  CHƯA CẤU HÌNH EMAIL — chế độ DEMO: mã trả thẳng về trình duyệt.');
    return { sent: false, devCode: code };
  }

  try {
    if (mode === 'brevo') return await sendViaBrevo(email, code);
    if (mode === 'resend') return await sendViaResend(email, code);
    return await sendViaGmail(email, code);
  } catch (err) {
    console.error(`❌ Gửi email thất bại (${mode}):`, err.message);
    if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
      console.error('   👉 Render thường CHẶN cổng SMTP. Hãy dùng BREVO_API_KEY (gửi qua HTTPS).');
    }

    // ⚠️ BẢO MẬT: KHÔNG trả mã ra màn hình khi hệ thống ĐÃ cấu hình email.
    // Nếu trả, kẻ xấu chỉ cần nhập email người khác -> mail gửi hỏng -> mã hiện
    // ngay trên màn hình -> xác thực trót lọt mà không cần vào hộp thư
    // => phá vỡ hoàn toàn ý nghĩa của OTP email.
    // Thà báo lỗi bắt gửi lại, còn hơn cho qua.
    return { sent: false, failed: true, reason: err.message };
  }
}
