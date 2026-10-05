/**
 * ĐỌC TỆP NÉN ZIP TỐI GIẢN — chỉ để lấy vài tệp XML trong .docx (P52)
 * ============================================================================
 *
 * Vì sao tự viết thay vì thêm thư viện: chỉ cần đọc đúng hai tệp (document.xml,
 * styles.xml), và mỗi thư viện thêm vào máy chủ đang giữ khoá giải mã danh tính
 * là thêm một chỗ phải tin. Đọc ZIP chỉ là đọc bảng mục lục ở cuối tệp rồi giải
 * nén bằng zlib có sẵn của Node.
 *
 * ⚠️ BOM NÉN: vài trăm KB nén có thể nở ra hàng GB. Mỗi tệp giải nén có trần
 *    (maxOutputLength của zlib) — vượt là dừng giải nén ngay, không đợi nở hết.
 * Không hỗ trợ ZIP64, tệp mã hoá, kiểu nén khác deflate — Word thật không dùng.
 */
import { inflateRawSync } from 'node:zlib';

/** Trần dung lượng SAU giải nén của một tệp bên trong */
export const TOI_DA_GIAI_NEN = 30 * 1024 * 1024;
const TOI_DA_MUC = 5000;

const loi = (lyDo) => new Error(`Tệp không đọc được: ${lyDo}.`);

function timCuoiThuMuc(buf) {
  const thapNhat = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= thapNhat; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * Lấy các tệp có tên trong `can` ra khỏi ZIP. Trả Map tên -> Buffer (chỉ tệp có thật).
 */
export function docZip(buf, can, { toiDa = TOI_DA_GIAI_NEN } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw loi('không phải tệp nén ZIP');
  const cuoi = timCuoiThuMuc(buf);
  if (cuoi < 0) throw loi('không phải tệp nén ZIP');
  const soMuc = buf.readUInt16LE(cuoi + 10);
  const coThuMuc = buf.readUInt32LE(cuoi + 12);
  const viTriThuMuc = buf.readUInt32LE(cuoi + 16);
  if (viTriThuMuc === 0xffffffff || soMuc === 0xffff) throw loi('định dạng ZIP64 chưa hỗ trợ');
  if (soMuc > TOI_DA_MUC) throw loi('quá nhiều mục bên trong');
  if (viTriThuMuc + coThuMuc > cuoi) throw loi('mục lục ZIP hỏng');

  const canSet = new Set(can);
  const ra = new Map();
  let p = viTriThuMuc;
  for (let n = 0; n < soMuc; n += 1) {
    if (p + 46 > cuoi || buf.readUInt32LE(p) !== 0x02014b50) throw loi('mục lục ZIP hỏng');
    const coBao = buf.readUInt16LE(p + 8);
    const kieuNen = buf.readUInt16LE(p + 10);
    const coNen = buf.readUInt32LE(p + 20);
    const dauTep = buf.readUInt32LE(p + 42);
    const dTen = buf.readUInt16LE(p + 28);
    const dThem = buf.readUInt16LE(p + 30);
    const dGhiChu = buf.readUInt16LE(p + 32);
    if (p + 46 + dTen > cuoi) throw loi('mục lục ZIP hỏng');
    const ten = buf.toString('utf8', p + 46, p + 46 + dTen);
    p += 46 + dTen + dThem + dGhiChu;
    if (!canSet.has(ten) || ra.has(ten)) continue;

    if (coBao & 1) throw loi('tệp bên trong bị mã hoá');
    if (dauTep + 30 > buf.length || buf.readUInt32LE(dauTep) !== 0x04034b50) throw loi('đầu tệp bên trong hỏng');
    const batDau = dauTep + 30 + buf.readUInt16LE(dauTep + 26) + buf.readUInt16LE(dauTep + 28);
    if (batDau + coNen > buf.length) throw loi('tệp bên trong bị cắt cụt');
    const duLieu = buf.subarray(batDau, batDau + coNen);

    if (kieuNen === 0) {
      if (duLieu.length > toiDa) throw new Error('Tệp quá lớn để trích chữ (giải nén vượt trần).');
      ra.set(ten, Buffer.from(duLieu));
    } else if (kieuNen === 8) {
      try {
        ra.set(ten, inflateRawSync(duLieu, { maxOutputLength: toiDa }));
      } catch (e) {
        if (e?.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) {
          throw new Error('Tệp quá lớn để trích chữ (giải nén vượt trần — có thể là bom nén).');
        }
        throw loi('dữ liệu nén hỏng');
      }
    } else {
      throw loi(`kiểu nén ${kieuNen} chưa hỗ trợ`);
    }
  }
  return ra;
}
