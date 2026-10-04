/** Dựng tệp ZIP / Word (.docx) ngay trong test — không cần thư viện, không cần tệp mẫu */
import { deflateRawSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
export function taoZip(tep, { nen = true } = {}) {
  const phan = []; const muc = []; let viTri = 0;
  for (const [ten, noiDung] of Object.entries(tep)) {
    const goc = Buffer.from(noiDung);
    const du = nen ? deflateRawSync(goc) : goc;
    const tenB = Buffer.from(ten);
    const dau = Buffer.alloc(30);
    dau.writeUInt32LE(0x04034b50, 0); dau.writeUInt16LE(20, 4); dau.writeUInt16LE(nen ? 8 : 0, 8);
    dau.writeUInt32LE(crc32(goc), 14); dau.writeUInt32LE(du.length, 18); dau.writeUInt32LE(goc.length, 22);
    dau.writeUInt16LE(tenB.length, 26);
    const tt = Buffer.alloc(46);
    tt.writeUInt32LE(0x02014b50, 0); tt.writeUInt16LE(20, 4); tt.writeUInt16LE(20, 6); tt.writeUInt16LE(nen ? 8 : 0, 10);
    tt.writeUInt32LE(crc32(goc), 16); tt.writeUInt32LE(du.length, 20); tt.writeUInt32LE(goc.length, 24);
    tt.writeUInt16LE(tenB.length, 28); tt.writeUInt32LE(viTri, 42);
    phan.push(dau, tenB, du); muc.push(Buffer.concat([tt, tenB]));
    viTri += 30 + tenB.length + du.length;
  }
  const cd = Buffer.concat(muc);
  const cuoi = Buffer.alloc(22);
  cuoi.writeUInt32LE(0x06054b50, 0); cuoi.writeUInt16LE(muc.length, 8); cuoi.writeUInt16LE(muc.length, 10);
  cuoi.writeUInt32LE(cd.length, 12); cuoi.writeUInt32LE(viTri, 16);
  return Buffer.concat([...phan, cd, cuoi]);
}
export const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
export const run = (chu, phong) => `<w:r>${phong ? `<w:rPr><w:rFonts w:ascii="${phong}" w:hAnsi="${phong}"/></w:rPr>` : ''}<w:t xml:space="preserve">${chu}</w:t></w:r>`;
export const taoDocx = (than, styles = '') => taoZip({
  '[Content_Types].xml': '<Types/>',
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${than}</w:body></w:document>`,
  ...(styles ? { 'word/styles.xml': `<w:styles ${W}>${styles}</w:styles>` } : {}),
});

