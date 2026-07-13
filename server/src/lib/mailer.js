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
 * ┌─ 3. CHẾ ĐỘ DEMO (không cấu hình gì) ─────────────────────────
 * │  Trả mã ra màn hình -> vẫn bảo vệ đồ án được bình thường.
 * └──────────────────────────────────────────────────────────────
 */
import nodemailer from 'nodemailer';

const env = (k) => (process.env[k] || '').trim();

export function mailConfigured() {
  return Boolean(env('BREVO_API_KEY') || env('RESEND_API_KEY') || (env('MAIL_USER') && env('MAIL_PASS')));
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
      <h2 style="margin:0;font-size:18px">HỘP THƯ AN NINH SỐ</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:.85">Công an thị xã Tân Châu, tỉnh An Giang</p>
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

const SUBJECT = (code) => `${code} là mã xác thực gửi ý kiến — Hộp Thư An Ninh Số`;
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
      from: env('MAIL_FROM') || 'Hop Thu An Ninh So <onboarding@resend.dev>',
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
        name: 'Hộp Thư An Ninh Số',
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
    from: env('MAIL_FROM') || `"Hộp Thư An Ninh Số" <${env('MAIL_USER')}>`,
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

  // Chưa cấu hình -> DEMO: trả mã ra màn hình
  if (mode === 'demo') {
    console.warn(`⚠️  CHƯA CẤU HÌNH EMAIL — chế độ DEMO. Mã OTP cho ${email}: ${code}`);
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
