/**
 * Gửi email OTP cho công dân.
 *
 * CẤU HÌNH (trong .env / Render Environment):
 *   MAIL_USER=hopthuanninhso@gmail.com
 *   MAIL_PASS=<App Password 16 ký tự của Gmail>
 *   MAIL_FROM="Hộp Thư An Ninh Số <hopthuanninhso@gmail.com>"
 *
 * ⚠️ MAIL_PASS KHÔNG phải mật khẩu Gmail thường!
 *    Phải tạo "App Password": myaccount.google.com -> Bảo mật
 *    -> Xác minh 2 bước (bật) -> Mật khẩu ứng dụng -> tạo mới
 *
 * CHẾ ĐỘ DEMO: nếu CHƯA cấu hình MAIL_USER/MAIL_PASS,
 * hệ thống KHÔNG gửi email mà trả mã về màn hình (để bảo vệ đồ án vẫn demo được).
 */
import nodemailer from 'nodemailer';

let transporter = null;

export function mailConfigured() {
  return Boolean((process.env.MAIL_USER || '').trim() && (process.env.MAIL_PASS || '').trim());
}

function getTransporter() {
  if (transporter) return transporter;
  if (!mailConfigured()) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER.trim(),
      pass: process.env.MAIL_PASS.trim().replace(/\s/g, ''), // App Password hay bị dính dấu cách
    },
  });
  return transporter;
}

/** Gửi mã OTP. Trả { sent: true } hoặc { sent: false, devCode } nếu chưa cấu hình mail. */
export async function sendOtpEmail(email, code) {
  const t = getTransporter();

  // Chưa cấu hình mail -> chế độ DEMO: trả mã ra màn hình
  if (!t) {
    console.warn(`⚠️  CHƯA CẤU HÌNH EMAIL — chế độ DEMO. Mã OTP cho ${email}: ${code}`);
    return { sent: false, devCode: code };
  }

  const html = `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#1B5E20;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center">
      <h2 style="margin:0;font-size:18px">HỘP THƯ AN NINH SỐ</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:.85">Công an thị xã Tân Châu, tỉnh An Giang</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="color:#334155;font-size:15px">Kính gửi bà con,</p>
      <p style="color:#334155;font-size:15px">
        Mã xác thực để gửi ý kiến của bà con là:
      </p>
      <div style="text-align:center;margin:24px 0">
        <span style="display:inline-block;background:#f0fdf4;border:2px dashed #1B5E20;
                     color:#1B5E20;font-size:34px;font-weight:800;letter-spacing:10px;
                     padding:14px 24px;border-radius:12px;font-family:monospace">
          ${code}
        </span>
      </div>
      <p style="color:#64748b;font-size:13px;line-height:1.6">
        • Mã có hiệu lực trong <b>10 phút</b>.<br>
        • Tuyệt đối <b>KHÔNG chia sẻ</b> mã này cho bất kỳ ai, kể cả người tự xưng là cán bộ Công an.<br>
        • Nếu bà con không yêu cầu mã này, vui lòng bỏ qua email.
      </p>
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0">
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">
        Email tự động — vui lòng không trả lời.
      </p>
    </div>
  </div>`;

  await t.sendMail({
    from: process.env.MAIL_FROM || `"Hộp Thư An Ninh Số" <${process.env.MAIL_USER}>`,
    to: email,
    subject: `${code} là mã xác thực gửi ý kiến — Hộp Thư An Ninh Số`,
    html,
    text: `Ma xac thuc cua ba con la: ${code}. Ma co hieu luc trong 10 phut. Khong chia se ma nay cho bat ky ai.`,
  });

  return { sent: true };
}
