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
import net from 'node:net';
import tls from 'node:tls';
/* BUG-046: dùng CHUNG cấu hình TLS với máy chủ (kiểm cả chứng chỉ lẫn tên máy — BUG-033). Bản tự
   dựng riêng trước đây không kiểm tên máy mà vẫn gửi mật khẩu CSDL: kẻ đứng giữa có chứng chỉ bất
   kỳ do cùng CA cấp là lấy được mật khẩu. */
import { buildSsl } from './src/db.js';

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

/* Xem chứng chỉ máy chủ CSDL trình ra MÀ KHÔNG ĐĂNG NHẬP (BUG-046). Chỉ dùng ở bước 4, khi đang
   nghi có phần mềm chen giữa — đúng lúc tuyệt đối không được gửi mật khẩu. MySQL nâng cấp TLS kiểu
   STARTTLS: nhận gói chào -> gửi gói "xin TLS" (SSLRequest, không có tên/mật khẩu) -> bắt tay TLS ->
   đọc chứng chỉ rồi cắt, không bao giờ tới gói đăng nhập. */
function xemChungChiKhongDangNhap(host, port) {
  return new Promise((ok, loi) => {
    const s = net.connect({ host, port });
    let t = null;
    const xong = (fn, v) => { clearTimeout(hen); (t || s).destroy(); fn(v); };
    const hen = setTimeout(() => xong(loi, new Error('hết 15 giây chờ máy chủ')), 15000);
    s.on('error', (e) => xong(loi, e));
    let nhan = Buffer.alloc(0);
    const docChao = (d) => {
      nhan = Buffer.concat([nhan, d]);
      /* Đợi đủ trọn gói chào (3 byte độ dài + 1 byte số thứ tự + thân) — byte thừa lọt sang TLS là hỏng */
      if (nhan.length < 4 || nhan.length < 4 + nhan.readUIntLE(0, 3)) return;
      s.off('data', docChao);
      const than = Buffer.alloc(32);
      /* CLIENT_PROTOCOL_41 | CLIENT_SSL | CLIENT_SECURE_CONNECTION; gói tối đa 16 MB; bảng mã utf8mb4 */
      than.writeUInt32LE(0x0200 | 0x0800 | 0x8000, 0);
      than.writeUInt32LE(0x01000000, 4);
      than[8] = 45;
      s.write(Buffer.concat([Buffer.from([32, 0, 0, 1]), than]), () => {
        /* CHỈ để xem: không kiểm chứng chỉ, nhưng cũng không gửi gì qua đường này */
        t = tls.connect({ socket: s, rejectUnauthorized: false, ...(net.isIP(host) ? {} : { servername: host }) });
        t.on('error', (e) => xong(loi, e));
        t.once('secureConnect', () => xong(ok, t.getPeerCertificate(true)));
      });
    };
    s.on('data', docChao);
  });
}

try {
  const conn = await mysql.createConnection({
    host, port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: buildSsl(),
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

     Bắt tay TLS KHÔNG kiểm chứng chỉ và KHÔNG đăng nhập (xemChungChiKhongDangNhap —
     BUG-046) rồi đọc xem máy chủ thực sự trình ra chứng chỉ do AI cấp. So với CA
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

      const chuoi = await xemChungChiKhongDangNhap(host, port);
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
  } else if (/does not match certificate|Hostname\/IP does not match/i.test(err.message)) {
    console.log('   → Tên máy không khớp chứng chỉ. DB_HOST phải là TÊN máy ghi trên chứng chỉ của kho,');
    console.log('     không ghi địa chỉ IP (xem hướng dẫn triển khai, Phụ lục VIỆC CHỜ — Kiểm 1b).');
  } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.log('   → Sai tài khoản hoặc mật khẩu. Kiểm tra DB_USER, DB_PASSWORD.');
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    console.log('   → Không tới được máy chủ. Kiểm tra DB_HOST, DB_PORT, mạng.');
  } else if (err.code === 'ER_BAD_DB_ERROR') {
    console.log('   → Không có database tên này. Kiểm tra DB_NAME.');
  }
  process.exit(1);
}
