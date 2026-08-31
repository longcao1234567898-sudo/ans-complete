/**
 * SOI CHỨNG CHỈ MÁY CHỦ DATABASE
 * ============================================================================
 *
 * Trả lời đúng một câu hỏi: máy chủ database THỰC SỰ trình ra chứng chỉ do ai
 * cấp? Từ đó biết lỗi "self-signed certificate" là do ca.pem sai, hay do có
 * phần mềm chen vào giữa kết nối.
 *
 * Dùng:  cd server && node scripts-soi-chung-chi.js
 *
 * KHÔNG cần mật khẩu database: chứng chỉ được trao đổi TRƯỚC bước đăng nhập,
 * nên chỉ cần bắt tay tới đó rồi đọc là đủ. Cũng không sửa gì, chỉ xem.
 *
 * Cách hoạt động: MySQL không bắt tay TLS ngay như HTTPS. Máy chủ gửi gói chào
 * bằng văn bản thường trước; ta trả lời bằng gói SSLRequest để yêu cầu nâng cấp
 * lên mã hoá, rồi đọc chứng chỉ ngay tại thời điểm đó.
 */
import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';

const HOST = process.env.DB_HOST;
const PORT = Number(process.env.DB_PORT || 3306);

if (!HOST) {
  console.error('❌ Thiếu DB_HOST trong server/.env');
  process.exit(1);
}

console.log('\n═══ SOI CHỨNG CHỈ MÁY CHỦ DATABASE ═══\n');
console.log(`Máy chủ: ${HOST}:${PORT}\n`);

/* ---------- CA trong máy bạn ---------- */
let caCN = null;
if (process.env.DB_SSL_CA && fs.existsSync(process.env.DB_SSL_CA)) {
  try {
    const ca = new X509Certificate(fs.readFileSync(process.env.DB_SSL_CA));
    caCN = (ca.subject.match(/CN=(.+)/) || [])[1] || ca.subject;
    console.log('📄 ca.pem trong máy bạn');
    console.log(`   Là CA của : ${caCN}`);
    console.log(`   Có hiệu lực tới: ${ca.validTo}`);
    if (new Date(ca.validTo) < new Date()) {
      console.log('   ⚠️ CHỨNG CHỈ NÀY ĐÃ HẾT HẠN — cần tải lại từ Aiven.');
    }
  } catch (e) {
    console.log(`📄 ca.pem đọc được nhưng không phân tích được: ${e.message}`);
  }
} else {
  console.log('📄 Chưa khai DB_SSL_CA hoặc không thấy file.');
}

/* ---------- Chuỗi chứng chỉ máy chủ trình ra ---------- */
const sock = net.connect(PORT, HOST);
sock.setTimeout(20000);

sock.once('data', () => {
  /* Gói SSLRequest: 4 byte tiêu đề + 32 byte nội dung.
     Cờ khả năng phải có CLIENT_SSL (0x800) và CLIENT_PROTOCOL_41 (0x200). */
  const payload = Buffer.alloc(32);
  const CAP = 0x00000200 | 0x00000800 | 0x00008000 | 0x00080000;
  payload.writeUInt32LE(CAP, 0);
  payload.writeUInt32LE(16777215, 4);
  payload.writeUInt8(45, 8);
  const header = Buffer.alloc(4);
  header.writeUIntLE(32, 0, 3);
  header.writeUInt8(1, 3);
  sock.write(Buffer.concat([header, payload]));

  /* rejectUnauthorized:false CHỈ để XEM chứng chỉ, không dùng để làm việc thật.
     Mục đích là nhìn được máy chủ trình ra gì, kể cả khi nó không hợp lệ. */
  const t = tls.connect(
    { socket: sock, servername: HOST, rejectUnauthorized: false },
    () => {
      console.log('\n🔗 Máy chủ trình ra chuỗi chứng chỉ:');
      let c = t.getPeerCertificate(true);
      const daXem = new Set();
      let i = 0;
      let goc = c;
      while (c && c.subject && !daXem.has(c.fingerprint)) {
        daXem.add(c.fingerprint);
        console.log(`\n   [${i++}] Cấp cho : ${c.subject.CN || '(không rõ)'}`);
        console.log(`       Do cấp  : ${c.issuer?.CN || '(không rõ)'}`);
        if (c.issuer?.O) console.log(`       Tổ chức : ${c.issuer.O}`);
        goc = c;
        if (!c.issuerCertificate || c.issuerCertificate.fingerprint === c.fingerprint) break;
        c = c.issuerCertificate;
      }

      /* ---------- Kết luận ---------- */
      const gocCN = goc.issuer?.CN || '';
      const gocO = goc.issuer?.O || '';
      const moTaGoc = `${gocCN} ${gocO}`.trim();
      console.log('\n' + '─'.repeat(60));
      console.log('KẾT LUẬN\n');

      const chenGiua = /kaspersky|eset|bitdefender|avast|avg|norton|mcafee|trend ?micro|sophos|fortinet|zscaler|proxy|firewall|dr\.?web/i;

      if (chenGiua.test(moTaGoc)) {
        console.log('❌ CÓ PHẦN MỀM CHEN VÀO GIỮA KẾT NỐI.');
        console.log(`   Chứng chỉ do "${moTaGoc}" cấp, không phải Aiven.`);
        console.log('');
        console.log('   CÁCH SỬA: mở phần mềm diệt virus, tìm mục có chữ');
        console.log('   "quét SSL", "quét HTTPS", "quét kết nối mã hoá" rồi TẮT.');
        console.log('   Hoặc thử lại bằng 4G chia sẻ từ điện thoại để xác nhận.');
      } else if (/Project CA/i.test(moTaGoc) || /aiven/i.test(moTaGoc)) {
        console.log('✅ Máy chủ đúng là Aiven, chứng chỉ do Project CA cấp.');
        console.log('');
        if (caCN && gocCN && !gocCN.includes(caCN.split(' ')[0])) {
          console.log('❌ NHƯNG ca.pem CỦA BẠN LÀ CỦA PROJECT KHÁC:');
          console.log(`   ca.pem của bạn : ${caCN}`);
          console.log(`   Máy chủ cần    : ${gocCN}`);
          console.log('');
          console.log('   CÁCH SỬA: vào Aiven Console, mở ĐÚNG service MySQL đang');
          console.log('   dùng (không phải service/project khác) → tab Overview →');
          console.log('   CA Certificate → Download → chép đè lên server/ca.pem.');
        } else {
          console.log('   ca.pem có vẻ khớp. Nếu vẫn lỗi, kiểm tra hạn dùng của');
          console.log('   chứng chỉ ở phần trên, hoặc tải lại CA cho chắc.');
        }
      } else {
        console.log(`⚠️ Gốc chuỗi: "${moTaGoc}" — không nhận ra là Aiven.`);
        console.log('   Nhiều khả năng có thiết bị hoặc phần mềm chen vào giữa');
        console.log('   (diệt virus, tường lửa cơ quan, proxy mạng).');
        console.log('   → Thử lại bằng 4G chia sẻ từ điện thoại để loại trừ.');
      }
      console.log('');
      t.end();
      process.exit(0);
    }
  );
  t.on('error', (e) => { console.log('\n❌ Lỗi TLS:', e.message); process.exit(1); });
});

sock.on('error', (e) => {
  console.log('\n❌ Không nối được tới máy chủ:', e.message);
  console.log('   Kiểm tra DB_HOST, DB_PORT và mạng.');
  process.exit(1);
});
sock.on('timeout', () => {
  console.log('\n❌ Hết thời gian chờ — không tới được máy chủ.');
  process.exit(1);
});
