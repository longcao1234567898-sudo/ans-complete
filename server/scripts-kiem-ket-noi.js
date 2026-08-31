/**
 * CHẨN ĐOÁN KẾT NỐI DATABASE — tìm đúng nguyên nhân khi không nối được.
 *
 * Dùng: cd server && node scripts-kiem-ket-noi.js
 *
 * Kiểm lần lượt từng khâu và báo rõ khâu nào hỏng, thay vì chỉ ném ra một dòng
 * lỗi khó hiểu. Không sửa gì, chỉ xem và báo.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const V = '\x1b[32m✓\x1b[0m';
const X = '\x1b[31m✗\x1b[0m';
const I = '\x1b[33m•\x1b[0m';

console.log('\n═══ CHẨN ĐOÁN KẾT NỐI DATABASE ═══\n');

/* ---------- 1. Các biến môi trường ---------- */
const host = process.env.DB_HOST;
const port = Number(process.env.DB_PORT || 3306);
console.log('1) Biến môi trường');
console.log(`   ${host ? V : X} DB_HOST = ${host || '(TRỐNG)'}`);
console.log(`   ${port ? V : X} DB_PORT = ${port}`);
console.log(`   ${process.env.DB_USER ? V : X} DB_USER = ${process.env.DB_USER || '(TRỐNG)'}`);
console.log(`   ${process.env.DB_NAME ? V : X} DB_NAME = ${process.env.DB_NAME || '(TRỐNG)'}`);
console.log(`   ${I} DB_SSL = ${process.env.DB_SSL || '(trống — đúng khi dùng ca.pem)'}`);
console.log(`   ${I} DB_SSL_CA = ${process.env.DB_SSL_CA || '(trống)'}`);

/* ---------- 2. File chứng chỉ ---------- */
console.log('\n2) File chứng chỉ ca.pem');
let caBuf = null;
if (!process.env.DB_SSL_CA) {
  console.log(`   ${I} Không khai DB_SSL_CA — bỏ qua bước này.`);
} else {
  const duongDan = path.resolve(process.env.DB_SSL_CA);
  console.log(`   ${I} Đường dẫn đầy đủ: ${duongDan}`);
  if (!fs.existsSync(duongDan)) {
    console.log(`   ${X} KHÔNG TÌM THẤY FILE ở đường dẫn trên.`);
    console.log('      → Chép ca.pem vào đúng thư mục server/, hoặc sửa lại DB_SSL_CA.');
  } else {
    caBuf = fs.readFileSync(duongDan);
    const noiDung = caBuf.toString('utf8');
    console.log(`   ${V} Tìm thấy file, kích thước ${caBuf.length} byte`);

    if (!noiDung.includes('-----BEGIN CERTIFICATE-----')) {
      console.log(`   ${X} FILE KHÔNG PHẢI CHỨNG CHỈ PEM HỢP LỆ.`);
      console.log('      Nội dung mở đầu:', JSON.stringify(noiDung.slice(0, 80)));
      if (noiDung.trim().startsWith('<')) {
        console.log('      → Đây là trang HTML, không phải chứng chỉ. Có thể lúc tải bị');
        console.log('        lưu nhầm trang web. Tải lại từ Aiven Console.');
      }
      console.log('      → File đúng phải bắt đầu bằng: -----BEGIN CERTIFICATE-----');
    } else {
      const soCert = (noiDung.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
      console.log(`   ${V} Là chứng chỉ PEM hợp lệ, chứa ${soCert} chứng chỉ`);
    }
  }
}

/* ---------- 3. Thử nối bằng đúng giao thức MySQL ---------- */
console.log('\n3) Thử nối tới database bằng giao thức MySQL');
if (!host) {
  console.log(`   ${X} Thiếu DB_HOST, không thử được.`);
  process.exit(1);
}

/* ⚠️ PHẢI dùng thư viện MySQL, KHÔNG nối thẳng bằng tls.connect.
   MySQL không bắt tay TLS ngay từ đầu như HTTPS: máy chủ gửi gói chào bằng
   văn bản thường trước, hai bên thoả thuận rồi mới nâng cấp lên mã hoá
   (kiểu STARTTLS). Nối thẳng bằng tls sẽ luôn báo "wrong version number" dù
   chứng chỉ hoàn toàn đúng — kết quả vô nghĩa, gây hiểu lầm. */
const mysql = (await import('mysql2/promise')).default;

function dungSsl() {
  if (process.env.DB_SSL_CA) return { ca: fs.readFileSync(process.env.DB_SSL_CA) };
  if (process.env.DB_SSL_CA_PEM) return { ca: process.env.DB_SSL_CA_PEM };
  if (process.env.DB_SSL === 'true') return { minVersion: 'TLSv1.2' };
  return undefined;
}

try {
  const conn = await mysql.createConnection({
    host, port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: dungSsl(),
    connectTimeout: 15000,
  });
  const [r] = await conn.query('SELECT VERSION() AS v');
  console.log(`   ${V} NỐI THÀNH CÔNG. MySQL phiên bản ${r[0].v}`);
  const [t] = await conn.query('SELECT COUNT(*) AS n FROM staff');
  console.log(`   ${V} Đọc được dữ liệu: bảng staff có ${t[0].n} tài khoản`);
  await conn.end();
  console.log('\n→ Kết nối tốt. Chạy được các script khác rồi.\n');
  process.exit(0);
} catch (err) {
  console.log(`   ${X} Nối thất bại: ${err.message}`);
  console.log('');

  /* ---------- 4. SO SÁNH CHỨNG CHỈ — bước quyết định ----------
     Đây là cách duy nhất phân biệt dứt khoát hai nguyên nhân:
     tải nhầm CA, hay có phần mềm chen vào giữa kết nối.

     Nối lại với rejectUnauthorized:false (CHỈ để xem, không dùng để làm việc
     thật) rồi đọc xem máy chủ thực sự trình ra chứng chỉ do AI cấp. So với CA
     trong ca.pem là biết ngay. */
  if (err.code === 'SELF_SIGNED_CERT_IN_CHAIN'
      || err.message.includes('self-signed certificate')
      || err.message.includes('self signed certificate')) {
    console.log('4) So sánh chứng chỉ để tìm đúng nguyên nhân');
    try {
      const { X509Certificate } = await import('node:crypto');
      if (caBuf) {
        const caCert = new X509Certificate(caBuf);
        console.log(`   ${I} ca.pem của bạn do: ${caCert.issuer.replace(/\n/g, ' | ')}`);
      }

      const tam = await mysql.createConnection({
        host, port,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
        connectTimeout: 15000,
      });
      /* ⚠️ mysql2 bản promise BỌC connection lõi: socket nằm ở
         conn.connection.stream, KHÔNG phải conn.stream. Lấy sai thì
         getPeerCertificate là undefined. Dò cả hai cho chắc. */
      const socket = tam.connection?.stream || tam.stream;
      if (!socket || typeof socket.getPeerCertificate !== 'function') {
        throw new Error('không lấy được socket TLS để đọc chứng chỉ');
      }
      const chuoi = socket.getPeerCertificate(true);
      console.log(`   ${I} Máy chủ trình ra chứng chỉ cho: ${chuoi.subject?.CN || '(không rõ)'}`);

      /* Đi ngược lên gốc của chuỗi để xem ai là người cấp cuối cùng. */
      let goc = chuoi;
      const daQua = new Set();
      while (goc.issuerCertificate && !daQua.has(goc.fingerprint)) {
        daQua.add(goc.fingerprint);
        if (goc.issuerCertificate.fingerprint === goc.fingerprint) break;
        goc = goc.issuerCertificate;
      }
      const tenGoc = goc.issuer?.O || goc.issuer?.CN || '(không rõ)';
      console.log(`   ${I} Gốc chuỗi chứng chỉ là: ${tenGoc}`);
      await tam.end();

      console.log('');
      const dauHieuChenGiua = /kaspersky|eset|bitdefender|avast|avg|norton|mcafee|fortinet|zscaler|proxy|firewall/i;
      if (dauHieuChenGiua.test(tenGoc) || dauHieuChenGiua.test(JSON.stringify(goc.issuer || {}))) {
        console.log(`   ${X} KẾT LUẬN: có phần mềm chen vào giữa kết nối.`);
        console.log(`      Chứng chỉ do "${tenGoc}" cấp, không phải Aiven.`);
        console.log('      → Vào phần mềm diệt virus, TẮT tính năng quét SSL/HTTPS.');
        console.log('      → Hoặc thử lại bằng 4G chia sẻ từ điện thoại.');
      } else if (/aiven/i.test(tenGoc)) {
        console.log(`   ${X} KẾT LUẬN: máy chủ đúng là Aiven, nhưng ca.pem KHÔNG khớp.`);
        console.log('      Mỗi project trên Aiven có CA riêng. Có thể bạn tải ca.pem');
        console.log('      từ project khác, hoặc CA đã được cấp lại.');
        console.log('      → Vào ĐÚNG service MySQL đang dùng → Overview →');
        console.log('        CA Certificate → Download, rồi chép đè lên ca.pem cũ.');
      } else {
        console.log(`   ${I} Gốc chuỗi: "${tenGoc}" — không phải Aiven.`);
        console.log('      Nhiều khả năng có thiết bị/phần mềm chen vào giữa kết nối');
        console.log('      (diệt virus, tường lửa cơ quan, hoặc proxy mạng).');
        console.log('      → Thử lại bằng 4G chia sẻ từ điện thoại để loại trừ.');
      }
      console.log('');
    } catch (e2) {
      console.log(`   ${I} Không xem được chuỗi chứng chỉ: ${e2.message}`);
      console.log('');
    }
  }

  /* Trường hợp bật DB_SSL=true mà chưa nạp ca.pem: nguyên nhân rõ ràng, hướng
     dẫn thẳng cách sửa .env, không cần so sánh chuỗi chứng chỉ làm gì. */
  if (err.code === 'SELF_SIGNED_CERT_IN_CHAIN'
      || err.message.includes('self-signed certificate')
      || err.message.includes('self signed certificate')) {
    if (!process.env.DB_SSL_CA && !process.env.DB_SSL_CA_PEM) {
      console.log('   NGUYÊN NHÂN RÕ RÀNG: đang bật DB_SSL=true nhưng CHƯA nạp ca.pem.');
      console.log('   DB_SSL=true là bật mã hoá CÓ xác thực, mà Aiven dùng CA riêng');
      console.log('   nên hệ điều hành không nhận ra → bị từ chối.');
      console.log('');
      console.log('   CÁCH SỬA — mở file server/.env và sửa cho giống hệt:');
      console.log('      #DB_SSL=true');
      console.log('      DB_SSL_CA=./ca.pem');
      console.log('   Rồi LƯU FILE (Ctrl+S) và chạy lại lệnh này.');
      console.log('');
      console.log('   Kiểm lại: chạy lệnh này, mục 1 phải hiện');
      console.log('      DB_SSL = (trống)   và   DB_SSL_CA = ./ca.pem');
      console.log('   Nếu vẫn hiện DB_SSL = true thì file chưa lưu, hoặc trong .env');
      console.log('   có DÒNG DB_SSL=true THỨ HAI ở phía dưới — tìm và xoá nốt.');
    }
    /* Trường hợp ĐÃ nạp ca.pem mà vẫn hỏng thì bước 4 ở trên đã so sánh chuỗi
       chứng chỉ và kết luận rồi — không lặp lại ở đây. */
    console.log('');
  } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.log('   → Sai tài khoản hoặc mật khẩu. Kiểm tra DB_USER, DB_PASSWORD.');
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    console.log('   → Không tới được máy chủ. Kiểm tra DB_HOST, DB_PORT, mạng.');
  } else if (err.code === 'ER_BAD_DB_ERROR') {
    console.log('   → Không có database tên này. Kiểm tra DB_NAME.');
  }
  process.exit(1);
}
