/**
 * BĂM MÃ PIN PHÒNG TRAO ĐỔI (ND-064)
 * ============================================================================
 *
 * VÌ SAO KHÔNG DÙNG bcryptjs NỮA: bcryptjs là JavaScript thuần, chạy trên LUỒNG
 * CHÍNH của Node. Đo tải P68: 83 ms CPU mỗi lần băm → một tiến trình chỉ nhận được
 * ~12 ý kiến/giây, và trong lúc băm thì mọi yêu cầu khác (người xem tin, tra cứu)
 * chậm theo. crypto.scrypt có sẵn trong Node chạy ở luồng phụ (libuv): luồng chính
 * rảnh tay. Không thêm thư viện nào (bản bcrypt gốc cần biên dịch, thêm một gói
 * phải tin — ND-061).
 *
 * ĐỘ KHÓ GIỮ NGUYÊN: N = 2^14, r = 8 tốn ~82 ms/lần (bcrypt cost 10: ~83 ms), lại
 * tốn 16 MB bộ nhớ mỗi lần nên dò hàng loạt bằng card đồ hoạ khó hơn. PIN chỉ có
 * 6 chữ số — lớp chặn chính vẫn là giới hạn số lần thử ở route mở phòng; băm chậm
 * là để lỡ lộ bảng thì không dò ra ngay.
 *
 * ĐỊNH DẠNG: scrypt$N$r$p$<muối base64url>$<băm base64url> — ghi rõ tham số để sau
 * này tăng độ khó mà PIN cũ vẫn kiểm được.
 *
 * PIN CẤP TRƯỚC BẢN VÁ (bcrypt `$2a$`/`$2b$`/`$2y$`) vẫn kiểm bằng bcryptjs — chỉ
 * xảy ra khi người dân mở phòng của hồ sơ cũ, hiếm, không ảnh hưởng đợt gửi dồn.
 *
 * KIỂM CHẶT (allow-list): chuỗi lạ, hỏng, hay tham số khác bộ đang dùng → false,
 * không ném. Không nhận N tuỳ ý: ai ghi được vào CSDL mà đặt N thật lớn thì mỗi
 * lần mở phòng sẽ ngốn bộ nhớ, CPU của máy chủ.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const N = 16384;
const R = 8;
const P = 1;
const DAI = 32;
const MUOI = 16;
/* Bộ nhớ scrypt cần ≈ 128·N·r = 16 MB; để dư gấp đôi */
const MAXMEM = 256 * N * R;

const b64 = (buf) => buf.toString('base64url');
const MAU = /^scrypt\$(\d{1,7})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;
const MAU_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/* Không dùng util.promisify: bản promisify không cho truyền tuỳ chọn N/r/p gọn gàng */
const scrypt = (pin, muoi) => new Promise((ok, loi) => {
  crypto.scrypt(String(pin), muoi, DAI, { N, r: R, p: P, maxmem: MAXMEM }, (e, k) => (e ? loi(e) : ok(k)));
});

/** Băm PIN → chuỗi lưu vào chat_pin_hash */
export async function bamPin(pin) {
  const muoi = crypto.randomBytes(MUOI);
  const bam = await scrypt(pin, muoi);
  return `scrypt$${N}$${R}$${P}$${b64(muoi)}$${b64(bam)}`;
}

/** So PIN với chuỗi đã lưu. Mọi trường hợp lạ → false. */
export async function kiemPin(pin, luu) {
  if (typeof luu !== 'string' || typeof pin !== 'string' || !pin) return false;
  const m = luu.match(MAU);
  if (m) {
    /* Chỉ nhận đúng bộ tham số đang cấp — xem ghi chú đầu tệp */
    if (Number(m[1]) !== N || Number(m[2]) !== R || Number(m[3]) !== P) return false;
    try {
      const muoi = Buffer.from(m[4], 'base64url');
      const can = Buffer.from(m[5], 'base64url');
      if (muoi.length !== MUOI || can.length !== DAI) return false;
      const bam = await scrypt(pin, muoi);
      return crypto.timingSafeEqual(bam, can);
    } catch {
      return false;
    }
  }
  if (MAU_BCRYPT.test(luu)) {
    try {
      return await bcrypt.compare(pin, luu);
    } catch {
      return false;
    }
  }
  return false;
}
