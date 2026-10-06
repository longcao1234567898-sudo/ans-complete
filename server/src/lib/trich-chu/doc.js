/**
 * ĐỌC CHỮ WORD .doc ĐỜI CŨ (Word 97–2003) — ND-052
 * ============================================================================
 *
 * Tệp .doc là "Compound File" (một hệ tệp thu nhỏ trong một tệp, [MS-CFB]); chữ
 * nằm trong luồng WordDocument, xếp theo "bảng mảnh" (piece table, [MS-DOC] Clx)
 * ở luồng 0Table/1Table. Tự đọc bằng vài trăm dòng thay vì kéo thêm thư viện:
 * tệp lạ của người ngoài, đọc càng ít thứ càng ít chỗ hở.
 *
 * Chặn: mọi chỉ số sector/độ dài kiểm biên; chuỗi sector lặp vòng bị phát hiện;
 * tổng dung lượng đọc có trần; tệp có mật khẩu (fEncrypted) từ chối thẳng; macro
 * không bao giờ được đọc, chỉ đọc chữ. Chạy trong tiến trình con như mọi bộ đọc
 * tệp khác (lib/trich-chu/index.js).
 *
 * Phông cũ: .doc lưu phông theo từng đoạn ở cấu trúc định dạng phức tạp — không
 * đọc; chữ gõ TCVN3 / VNI được đoán theo dòng như lớp chữ PDF (chuan-hoa-van-ban).
 */
import { chuanHoa, coVeMaCu, DO_DAI_TOI_DA } from '../chuan-hoa-van-ban.js';

const CHU_KY_CFB = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const HET_CHUOI = 0xfffffffe;
const TRAN_LUONG = 30 * 1024 * 1024;

const loi = (thongDiep) => new Error(thongDiep);
const LOI_HONG = 'Tệp Word (.doc) hỏng hoặc không đúng định dạng, không đọc được.';

/** Đọc các luồng của một Compound File: trả hàm docLuong(ten) -> Buffer | null */
export function docCfb(buf) {
  if (buf.length < 512 || !buf.subarray(0, 8).equals(CHU_KY_CFB)) {
    const dau = buf.subarray(0, 8).toString('latin1');
    if (dau.startsWith('{\\rtf')) throw loi('Tệp .doc này thực chất là RTF — chưa hỗ trợ trích chữ, tải về mở bằng Word.');
    if (/^\s*</.test(dau)) throw loi('Tệp .doc này thực chất là trang web (HTML) — chưa hỗ trợ trích chữ, tải về mở bằng Word.');
    throw loi(LOI_HONG);
  }
  const dichSector = buf.readUInt16LE(0x1e);
  const dichMini = buf.readUInt16LE(0x20);
  if (![9, 12].includes(dichSector) || dichMini !== 6) throw loi(LOI_HONG);
  const coSector = 1 << dichSector;
  const soSector = Math.floor((buf.length - coSector) / coSector);
  const viTri = (s) => {
    if (!Number.isInteger(s) || s < 0 || s >= soSector) throw loi(LOI_HONG);
    return coSector + s * coSector;
  };

  /* Bảng FAT: các sector của nó liệt kê ở DIFAT (109 ô trong đầu tệp + chuỗi DIFAT) */
  const soFat = buf.readUInt32LE(0x2c);
  if (soFat > soSector) throw loi(LOI_HONG);
  const sectorFat = [];
  for (let i = 0; i < 109 && sectorFat.length < soFat; i += 1) sectorFat.push(buf.readUInt32LE(0x4c + i * 4));
  let difat = buf.readUInt32LE(0x44);
  const daQuaDifat = new Set();
  while (sectorFat.length < soFat && difat !== HET_CHUOI && difat < soSector) {
    if (daQuaDifat.has(difat)) throw loi(LOI_HONG);
    daQuaDifat.add(difat);
    const o = viTri(difat);
    for (let i = 0; i < coSector / 4 - 1 && sectorFat.length < soFat; i += 1) sectorFat.push(buf.readUInt32LE(o + i * 4));
    difat = buf.readUInt32LE(o + coSector - 4);
  }
  const fat = new Uint32Array(sectorFat.length * (coSector / 4));
  sectorFat.forEach((s, k) => {
    const o = viTri(s);
    for (let i = 0; i < coSector / 4; i += 1) fat[k * (coSector / 4) + i] = buf.readUInt32LE(o + i * 4);
  });

  /** Nối chuỗi sector theo bảng `bang`, mỗi sector `co` byte lấy bằng `lay(s)` */
  const noiChuoi = (dau, bang, co, lay, toiDa) => {
    const phan = [];
    const daQua = new Set();
    let tong = 0;
    for (let s = dau; s !== HET_CHUOI; s = bang[s]) {
      if (s >= bang.length || daQua.has(s)) throw loi(LOI_HONG);
      daQua.add(s);
      phan.push(lay(s));
      tong += co;
      if (tong > toiDa + co) throw loi('Tệp Word quá lớn để trích chữ.');
    }
    return Buffer.concat(phan);
  };
  const laySector = (s) => buf.subarray(viTri(s), viTri(s) + coSector);

  /* Thư mục: mỗi mục 128 byte */
  const thuMuc = noiChuoi(buf.readUInt32LE(0x30), fat, coSector, laySector, 4 * 1024 * 1024);
  const muc = [];
  for (let o = 0; o + 128 <= thuMuc.length; o += 128) {
    const doDaiTen = thuMuc.readUInt16LE(o + 0x40);
    if (doDaiTen < 2 || doDaiTen > 64) { muc.push(null); continue; }
    muc.push({
      ten: thuMuc.subarray(o, o + doDaiTen - 2).toString('utf16le'),
      loai: thuMuc[o + 0x42],
      dau: thuMuc.readUInt32LE(o + 0x74),
      co: thuMuc.readUInt32LE(o + 0x78),
    });
  }
  const goc = muc[0];
  if (!goc || goc.loai !== 5) throw loi(LOI_HONG);

  /* Luồng nhỏ (< 4096 byte) nằm trong "luồng mini" của mục gốc, theo bảng mini FAT */
  const nguongMini = buf.readUInt32LE(0x38);
  let miniFat = null;
  let luongMini = null;
  const chuanBiMini = () => {
    if (miniFat) return;
    const soMiniFat = buf.readUInt32LE(0x40);
    const tho = soMiniFat > 0 ? noiChuoi(buf.readUInt32LE(0x3c), fat, coSector, laySector, 4 * 1024 * 1024) : Buffer.alloc(0);
    miniFat = new Uint32Array(tho.length / 4);
    for (let i = 0; i < miniFat.length; i += 1) miniFat[i] = tho.readUInt32LE(i * 4);
    luongMini = noiChuoi(goc.dau, fat, coSector, laySector, TRAN_LUONG);
  };

  function docLuong(ten) {
    const m = muc.find((x) => x && x.loai === 2 && x.ten === ten);
    if (!m) return null;
    if (m.co > TRAN_LUONG) throw loi('Tệp Word quá lớn để trích chữ.');
    if (m.co < nguongMini) {
      chuanBiMini();
      const ra = noiChuoi(m.dau, miniFat, 64, (s) => {
        if ((s + 1) * 64 > luongMini.length) throw loi(LOI_HONG);
        return luongMini.subarray(s * 64, s * 64 + 64);
      }, m.co);
      return ra.subarray(0, m.co);
    }
    const ra = noiChuoi(m.dau, fat, coSector, laySector, m.co);
    if (ra.length < m.co) throw loi(LOI_HONG);
    return ra.subarray(0, m.co);
  }
  /* Tên mọi mục trong thư mục (kể cả mục không nối vào cây) — để bộ kiểm tài liệu
     soi kho macro "Macros"/"_VBA_PROJECT" (BUG-034); đọc thẳng danh sách, không đi theo
     cây, nên mục bị giấu khỏi cây vẫn hiện ra */
  docLuong.cacMuc = muc.filter(Boolean).map((m) => ({ ten: m.ten, loai: m.loai }));
  return docLuong;
}

/* windows-1252 cho mảnh "nén" (mỗi ký tự một byte, [MS-DOC] 2.9.73) */
const cp1252 = new TextDecoder('windows-1252');

/**
 * Ghép chữ thân văn bản từ bảng mảnh. Tách riêng để test được với dữ liệu tự dựng.
 * @param {Buffer} wd luồng WordDocument
 * @param {Buffer} clx cấu trúc Clx trong luồng bảng
 * @param {number} ccpText số ký tự của thân văn bản (bỏ chú thích, đầu trang...)
 */
export function ghepManh(wd, clx, ccpText) {
  let o = 0;
  while (o < clx.length && clx[o] === 0x01) {
    if (o + 3 > clx.length) throw loi(LOI_HONG);
    o += 3 + clx.readInt16LE(o + 1);
  }
  if (o + 5 > clx.length || clx[o] !== 0x02) throw loi(LOI_HONG);
  const lcb = clx.readUInt32LE(o + 1);
  const plc = clx.subarray(o + 5, o + 5 + lcb);
  if (plc.length !== lcb || (lcb - 4) % 12 !== 0) throw loi(LOI_HONG);
  const n = (lcb - 4) / 12;
  let ra = '';
  for (let i = 0; i < n && ra.length < ccpText; i += 1) {
    const cpDau = plc.readUInt32LE(i * 4);
    const cpCuoi = plc.readUInt32LE((i + 1) * 4);
    if (cpCuoi < cpDau) throw loi(LOI_HONG);
    const soKyTu = Math.min(cpCuoi - cpDau, ccpText - ra.length);
    const fcGoc = plc.readUInt32LE((n + 1) * 4 + i * 8 + 2);
    const nen = (fcGoc & 0x40000000) !== 0;
    const fc = fcGoc & 0x3fffffff;
    const dau = nen ? fc / 2 : fc;
    const soByte = nen ? soKyTu : soKyTu * 2;
    if (!Number.isInteger(dau) || dau + soByte > wd.length) throw loi(LOI_HONG);
    const b = wd.subarray(dau, dau + soByte);
    ra += nen ? cp1252.decode(b) : b.toString('utf16le');
    if (ra.length > DO_DAI_TOI_DA * 2) break;
  }
  return ra;
}

/**
 * Ký tự điều khiển của Word -> chữ đọc được. Trường (field): 0x13 mã 0x14 kết quả
 * 0x15 — giữ KẾT QUẢ (chữ người đọc thấy), bỏ MÃ trường (HYPERLINK "...", PAGE).
 */
export function lamSachChuWord(tho) {
  let ra = '';
  const ngan = []; // mỗi trường đang mở: true = đang ở phần mã (bỏ)
  for (const c of tho) {
    const ma = c.charCodeAt(0);
    if (ma === 0x13) { ngan.push(true); continue; }
    if (ma === 0x14) { if (ngan.length) ngan[ngan.length - 1] = false; continue; }
    if (ma === 0x15) { ngan.pop(); continue; }
    if (ngan.some(Boolean)) continue;
    if (c === '\r' || ma === 0x0b || ma === 0x0c || ma === 0x0e) ra += '\n';
    else if (ma === 0x07) ra += '\t'; // hết ô / hết hàng bảng
    else if (ma === 0x1e) ra += '-'; // gạch nối không ngắt
    else if (ma === 0x1f || ma < 0x09 || (ma > 0x0d && ma < 0x20)) continue; // gạch mềm, ảnh, chú thích...
    else ra += c;
  }
  /* Hết hàng bảng là hai 0x07 liền nhau -> xuống dòng */
  return ra.replace(/\t\t/g, '\n').replace(/\t(?=\n)/g, '');
}

export function docDoc(buf) {
  const docLuong = docCfb(buf);
  const wd = docLuong('WordDocument');
  if (!wd || wd.length < 0x1aa) throw loi(LOI_HONG);
  if (wd.readUInt16LE(0) !== 0xa5ec) throw loi(LOI_HONG);
  const co = wd.readUInt16LE(0x0a);
  if (co & 0x0100) throw loi('Tệp Word có mật khẩu — không trích được chữ, tải về mở bằng Word.');
  const bang = docLuong(co & 0x0200 ? '1Table' : '0Table');
  if (!bang) throw loi(LOI_HONG);
  const ccpText = wd.readInt32LE(0x4c);
  const fcClx = wd.readUInt32LE(0x1a2);
  const lcbClx = wd.readUInt32LE(0x1a6);
  if (ccpText < 0 || lcbClx === 0 || fcClx + lcbClx > bang.length) throw loi(LOI_HONG);

  const tho = lamSachChuWord(ghepManh(wd, bang.subarray(fcClx, fcClx + lcbClx), ccpText));
  return {
    noiDung: chuanHoa(tho, { doanTcvn3: true }),
    phuongPhap: 'doc',
    daChuyenTcvn3: coVeMaCu(tho),
    soTrang: null,
  };
}
