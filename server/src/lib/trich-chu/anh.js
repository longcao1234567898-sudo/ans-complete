/**
 * ẢNH CHO OCR — đọc kích thước từ phần đầu tệp, đổi ảnh điểm sang BMP (P52)
 * ============================================================================
 *
 * BOM ĐIỂM ẢNH: một tệp PNG vài KB có thể khai 50.000 × 50.000 điểm — giải mã ra
 * là 7,5 GB. Nên đọc kích thước TỪ PHẦN ĐẦU TỆP và từ chối trước khi đưa cho bộ
 * OCR giải mã. Không nhận ra định dạng thì không đọc (allow-list, luật 5).
 */

/** Trần số điểm ảnh một ảnh đưa vào OCR (40 triệu ~ ảnh chụp điện thoại 8000 × 5000) */
export const DIEM_ANH_TOI_DA = 40_000_000;
export const CANH_TOI_DA = 12_000;

const KHUNG_JPEG = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpeg(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const ma = b[i + 1];
    if (ma === 0xff) { i += 1; continue; }
    if (KHUNG_JPEG.has(ma)) return { loai: 'jpeg', rong: b.readUInt16BE(i + 7), cao: b.readUInt16BE(i + 5) };
    if (ma === 0xd8 || (ma >= 0xd0 && ma <= 0xd7) || ma === 0x01) { i += 2; continue; }
    if (ma === 0xd9 || ma === 0xda) return null;
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function webp(b) {
  if (b.length < 30) return null;
  const dang = b.toString('latin1', 12, 16);
  if (dang === 'VP8X') return { loai: 'webp', rong: 1 + b.readUIntLE(24, 3), cao: 1 + b.readUIntLE(27, 3) };
  if (dang === 'VP8 ') return { loai: 'webp', rong: b.readUInt16LE(26) & 0x3fff, cao: b.readUInt16LE(28) & 0x3fff };
  if (dang === 'VP8L') {
    const v = b.readUInt32LE(21);
    return { loai: 'webp', rong: 1 + (v & 0x3fff), cao: 1 + ((v >> 14) & 0x3fff) };
  }
  return null;
}

/** { loai, rong, cao } hoặc null khi không nhận ra (không đọc ảnh đó) */
export function kichThuocAnh(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.length >= 24
    && b.toString('latin1', 12, 16) === 'IHDR') {
    return { loai: 'png', rong: b.readUInt32BE(16), cao: b.readUInt32BE(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
  if (b.toString('latin1', 0, 2) === 'BM' && b.length >= 26) {
    return { loai: 'bmp', rong: Math.abs(b.readInt32LE(18)), cao: Math.abs(b.readInt32LE(22)) };
  }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return webp(b);
  return null;
}

export const quaLon = ({ rong, cao }) => !(rong > 0 && cao > 0) || rong > CANH_TOI_DA || cao > CANH_TOI_DA
  || rong * cao > DIEM_ANH_TOI_DA;

/**
 * Ảnh điểm pdf.js giải mã (kind 1: xám 1 bit, 2: RGB, 3: RGBA) -> tệp BMP 24 bit
 * để bộ OCR đọc. Viết tay vài chục dòng thay vì kéo thư viện vẽ ảnh vào máy chủ.
 */
export function sangBmp({ width: w, height: h, kind, data }) {
  const dong = Math.ceil((w * 3) / 4) * 4;
  const b = Buffer.alloc(54 + dong * h);
  b.write('BM', 0, 'latin1');
  b.writeUInt32LE(b.length, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(dong * h, 34);
  const buoc = kind === 3 ? 4 : 3;
  const byteDong1Bit = Math.ceil(w / 8);
  for (let y = 0; y < h; y += 1) {
    const o = 54 + (h - 1 - y) * dong;
    for (let x = 0; x < w; x += 1) {
      let r; let g; let bl;
      if (kind === 1) {
        const bit = (data[y * byteDong1Bit + (x >> 3)] >> (7 - (x & 7))) & 1;
        r = g = bl = bit ? 255 : 0;
      } else {
        const i = (y * w + x) * buoc;
        r = data[i]; g = data[i + 1]; bl = data[i + 2];
      }
      b[o + x * 3] = bl;
      b[o + x * 3 + 1] = g;
      b[o + x * 3 + 2] = r;
    }
  }
  return b;
}
