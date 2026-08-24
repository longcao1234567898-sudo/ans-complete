/**
 * SOÁT TRI THỨC TRỢ LÝ — CHẠY SAU KHI ĐỔI ĐƠN VỊ
 * ============================================================================
 *
 *     node scripts-kiem-tri-thuc.js
 *
 * VÌ SAO CẦN CÔNG CỤ NÀY
 *
 * Tri thức trợ lý là chỗ dễ mục ruỗng nhất trong cả dự án. Sửa mã nguồn sai thì
 * trình biên dịch báo ngay; sửa thiếu tri thức thì không ai nhắc, hệ thống vẫn
 * chạy bình thường, chỉ có bà con là nhận thông tin sai.
 *
 * Nguy hiểm ở chỗ trợ lý nói rất tự tin. Bà con nghe số điện thoại của đơn vị
 * cũ rồi gọi nhầm mà không nghi ngờ gì cả.
 *
 * Đã xảy ra thật: tắt xác thực email từ lâu mà tri thức vẫn dặn bà con "chờ mã
 * 6 số về email". Bà con ngồi đợi một cái thư không bao giờ tới.
 *
 * Công cụ này KHÔNG thay được việc đọc lại bằng mắt. Nó chỉ bắt những lỗi máy
 * bắt được: số điện thoại gõ thẳng, tên đơn vị gõ thẳng, và những câu mô tả
 * tính năng đã bị tắt.
 * ============================================================================
 */
import { HE_THONG_KNOWLEDGE } from './src/lib/tri-thuc-tro-ly.js';
import { UNIT } from './src/lib/unit.js';

const T = HE_THONG_KNOWLEDGE;
let loi = 0;
let canh = 0;

const bao = (muc, tieuDe, chiTiet) => {
  const dau = muc === 'loi' ? '[LỖI ]' : '[NHẮC]';
  console.log(`\n${dau} ${tieuDe}`);
  for (const d of chiTiet) console.log(`       ${d}`);
  if (muc === 'loi') loi++; else canh++;
};

console.log('='.repeat(72));
console.log('SOÁT TRI THỨC TRỢ LÝ');
console.log(`Đơn vị hiện cấu hình: ${UNIT.name}`);
console.log(`Độ dài tri thức: ${T.length.toLocaleString('vi-VN')} ký tự`);
console.log('='.repeat(72));

/* ------------------------------------------------------------------------
   1. SỐ ĐIỆN THOẠI GÕ THẲNG

   Phải viết ${UNIT.hotline}, không gõ số. Gõ thẳng thì đổi đơn vị xong trợ lý
   vẫn đọc số cũ — đây là lỗi nguy hiểm nhất vì bà con gọi nhầm lúc đang cần.

   ⚠️ PHẢI SOÁT MÃ NGUỒN, KHÔNG SOÁT CHUỖI ĐÃ KẾT XUẤT.
   Chuỗi kết xuất luôn chứa số thật, vì ${UNIT.hotline} đã được thay bằng giá
   trị — soát ở đó thì lần nào cũng báo lỗi, kể cả khi viết hoàn toàn đúng.
   Bản đầu của công cụ này mắc đúng lỗi đó. Công cụ báo sai còn tệ hơn không có
   công cụ: người dùng học được cách bỏ qua nó, rồi bỏ qua luôn lần báo đúng.

   Bỏ qua các số khẩn cấp toàn quốc: 113 114 115 111 156 và 911.
   ------------------------------------------------------------------------ */
const { readFileSync } = await import('fs');
const nguon = readFileSync(new URL('./src/lib/tri-thuc-tro-ly.js', import.meta.url), 'utf8');

const SO_TOAN_QUOC = new Set(['113', '114', '115', '111', '156', '911']);
const soGoThang = [...nguon.matchAll(/\b0\d[\d\s.]{7,12}\d\b/g)]
  .map((m) => m[0].trim())
  .filter((s) => !SO_TOAN_QUOC.has(s.replace(/\D/g, '')));

if (soGoThang.length) {
  bao('loi', 'Có số điện thoại gõ thẳng trong tri thức', [
    ...new Set(soGoThang.map((s) => `"${s}"`)),
    '→ Thay bằng ${UNIT.hotline} hoặc ${UNIT.emergency}',
  ]);
}

/* ------------------------------------------------------------------------
   2. TÊN ĐỊA DANH GÕ THẲNG

   So với chính tên đơn vị đang cấu hình: nếu tên đó xuất hiện trong tri thức
   dưới dạng chữ (chứ không phải qua ${UNIT.name}) thì lúc build ra vẫn đúng,
   nhưng đổi đơn vị là sai ngay. Cách nhận biết: đọc tệp nguồn tìm chữ gõ thẳng.
   ------------------------------------------------------------------------ */
const diaDanh = [...new Set(
  [UNIT.name, UNIT.communeName, UNIT.address]
    .filter(Boolean)
    .flatMap((v) => v.split(/[,\s]+/))
    .filter((w) => /^[A-ZĐÂÊÔƠƯÁÀẢÃẠ]/.test(w) && w.length > 2)
    /* Bỏ các từ hành chính dùng chung — "Công an", "Phường", "Tỉnh" xuất hiện
       khắp nơi một cách hợp lệ, báo lên chỉ gây nhiễu. Chỉ giữ tên riêng. */
    .filter((w) => !['Công', 'Phường', 'Xã', 'Thị', 'Tỉnh', 'Huyện', 'Quận',
                     'Khóm', 'Ấp', 'Số', 'Đường'].includes(w))
)];

const goThang = diaDanh.filter((w) => {
  const re = new RegExp(`(?<!\\$\\{UNIT\\.[a-zA-Z]{0,20}\\}[^\\n]{0,40})${w}`, 'u');
  return nguon.includes(w) && re.test(nguon);
});

if (goThang.length) {
  bao('nhac', 'Có thể còn tên địa danh gõ thẳng trong tệp nguồn', [
    ...goThang.map((w) => `"${w}"`),
    '→ Mở tri-thuc-tro-ly.js kiểm lại, nên dùng ${UNIT.name} / ${UNIT.communeName}',
    '   (Nhắc này có thể báo nhầm nếu tên nằm trong phần chú thích — đọc rồi bỏ qua)',
  ]);
}

/* ------------------------------------------------------------------------
   3. MÔ TẢ TÍNH NĂNG ĐÃ TẮT

   Xác thực email đã tắt. Tri thức nào còn dặn bà con chờ mã về email là sai.
   ------------------------------------------------------------------------ */
const CAU_SAI = [
  { mau: /chờ mã.{0,20}(về|qua) (email|thư)/iu, noi: 'còn dặn chờ mã xác thực qua email' },
  { mau: /mã (xác thực|OTP) 6 số.{0,30}email/iu, noi: 'còn nhắc mã OTP qua email' },
  { mau: /bắt buộc.{0,20}\bemail\b/iu, noi: 'còn nói email là bắt buộc' },
  { mau: /kiểm tra (hộp thư|hòm thư|email).{0,25}mã/iu, noi: 'còn bảo mở hộp thư lấy mã' },
];

/* ⚠️ PHẢI BỎ QUA CÂU PHỦ ĐỊNH.
   Câu đúng hiện nay là "KHÔNG cần chờ mã xác thực qua email" — chính là câu ta
   muốn thấy, nhưng nó chứa đúng cụm đang tìm. Bản đầu của công cụ báo câu này
   là lỗi. Nên xét cả phần đứng trước: có từ phủ định thì bỏ qua. */
const PHU_DINH = /\b(không|khỏi|chẳng|đã tắt|đã bỏ)\b/iu;

for (const { mau, noi } of CAU_SAI) {
  const m = T.match(mau);
  if (!m) continue;
  /* Xét cả cụm đứng trước — "KHÔNG cần chờ mã..." có từ phủ định cách cụm
     tìm được vài chữ, nên không thể đòi phủ định đứng sát ngay trước. */
  const truoc = T.slice(Math.max(0, m.index - 25), m.index);
  if (PHU_DINH.test(truoc)) continue;
  bao('loi', `Tri thức ${noi} — nhưng xác thực email ĐÃ TẮT`, [
    `Câu vướng: "...${m[0]}..."`,
    '→ Xoá hoặc sửa. Bà con đọc xong sẽ ngồi đợi thư không bao giờ tới.',
  ]);
}

/* ------------------------------------------------------------------------
   4. BỐN MỤC PHẢI XEM LẠI BẰNG TAY

   Không kiểm tự động được vì phụ thuộc thực tế đơn vị. Chỉ liệt kê ra nhắc.
   ------------------------------------------------------------------------ */
const MUC_TAY = [
  ['## THỜI HẠN XỬ LÝ', 'Phải khớp cột sla_days trong bảng categories'],
  ['## BỐN NHÓM XỬ LÝ', 'Mô tả từng nhóm theo thực tế địa bàn'],
  ['## KHÔNG CÓ ĐIỆN THOẠI', 'Đơn vị có quầy tiếp dân nhập hộ hay không'],
  ['## NHÓM ZALO', 'Bỏ hẳn mục này nếu đơn vị không lập nhóm Zalo'],
  ['## SỐ ĐIỆN THOẠI KHẨN CẤP', 'Kiểm lại số trực ban của đơn vị mới'],
];
console.log('\n' + '-'.repeat(72));
console.log('NĂM MỤC PHẢI TỰ ĐỌC LẠI (máy không kiểm được)');
console.log('-'.repeat(72));
for (const [muc, viec] of MUC_TAY) {
  const co = T.includes(muc);
  console.log(`  ${co ? '·' : '!'} ${muc.padEnd(32)} ${co ? viec : 'KHÔNG TÌM THẤY MỤC NÀY'}`);
  if (!co) canh++;
}

/* ------------------------------------------------------------------------
   5. KẾT LUẬN
   ------------------------------------------------------------------------ */
console.log('\n' + '='.repeat(72));
if (loi === 0 && canh === 0) {
  console.log('KẾT QUẢ: không thấy vấn đề nào máy bắt được.');
} else {
  console.log(`KẾT QUẢ: ${loi} lỗi · ${canh} điểm cần xem lại.`);
}
console.log('Máy chỉ bắt được lỗi máy bắt được. Vẫn phải đọc lại bằng mắt sau khi sửa.');
console.log('='.repeat(72));

process.exit(loi > 0 ? 1 : 0);
