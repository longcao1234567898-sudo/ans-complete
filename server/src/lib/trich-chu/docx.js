/**
 * ĐỌC CHỮ TRONG WORD (.docx) — không mở tệp, không chạy gì trong tệp (P52)
 * ============================================================================
 *
 * .docx là tệp nén chứa XML. Chỉ lấy chữ trong thẻ <w:t> của word/document.xml:
 *   · không xử lý DTD/thực thể ngoài (không có XXE) — chỉ quét thẻ bằng biểu thức;
 *   · bỏ chữ đã xoá trong "theo dõi thay đổi" (<w:delText>), mã trường
 *     (<w:instrText>), bản dự phòng trùng lặp của hộp văn bản (<mc:Fallback>);
 *   · đoạn -> xuống dòng; ô bảng cách nhau bằng khoảng trắng, hàng -> xuống dòng.
 *
 * PHÔNG .VnTime: Word lưu chữ gõ bằng phông TCVN3 thành ký tự Latin-1. Phông
 * nằm ở từng đoạn chữ (w:rFonts), ở kiểu (styles.xml) hoặc mặc định của tài
 * liệu — đọc đủ ba tầng để biết đoạn nào phải chuyển, không phải đoán.
 * Chữ cao hơn 0x7F dùng phông w:hAnsi, nên ưu tiên hAnsi hơn ascii.
 */
import { docZip } from './zip.js';
import { tcvn3SangUnicode, chuanHoa, DO_DAI_TOI_DA } from '../chuan-hoa-van-ban.js';

const THE = /<(\/?)([A-Za-z][\w.:-]*)([^>]*?)(\/?)>|([^<]+)/g;

const thuocTinh = (chuoi, ten) => {
  const m = chuoi.match(new RegExp(`\\b${ten}="([^"]*)"`));
  return m ? m[1] : null;
};
const phongCua = (chuoi) => thuocTinh(chuoi, 'w:hAnsi') ?? thuocTinh(chuoi, 'w:ascii');

function giaiMaXml(s) {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d{1,7});/g, (_m, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Phông của từng kiểu trong styles.xml + phông mặc định + kiểu đoạn mặc định */
function docKieu(xml) {
  const kieu = new Map();
  let macDinh = null;
  let kieuDoanMacDinh = null;
  const d = xml.match(/<w:docDefaults>([\s\S]*?)<\/w:docDefaults>/);
  if (d) {
    const f = d[1].match(/<w:rFonts\b[^>]*>/);
    if (f) macDinh = phongCua(f[0]);
  }
  for (const m of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = thuocTinh(m[1], 'w:styleId');
    if (!id) continue;
    const f = m[2].match(/<w:rFonts\b[^>]*>/);
    const goc = m[2].match(/<w:basedOn\b[^>]*w:val="([^"]*)"/);
    kieu.set(id, { phong: f ? phongCua(f[0]) : null, goc: goc ? goc[1] : null });
    if (thuocTinh(m[1], 'w:default') === '1' && thuocTinh(m[1], 'w:type') === 'paragraph') kieuDoanMacDinh = id;
  }
  const phongKieu = (id) => {
    for (let i = 0, k = id; k && i < 10; i += 1) {
      const s = kieu.get(k);
      if (!s) return null;
      if (s.phong) return s.phong;
      k = s.goc;
    }
    return null;
  };
  return { macDinh, kieuDoanMacDinh, phongKieu };
}

export function docDocx(buf) {
  const tep = docZip(buf, ['word/document.xml', 'word/styles.xml']);
  const docXml = tep.get('word/document.xml');
  if (!docXml) throw new Error('Tệp không có word/document.xml — không phải tài liệu Word thật.');
  const { macDinh, kieuDoanMacDinh, phongKieu } = docKieu(tep.get('word/styles.xml')?.toString('utf8') ?? '');
  const xml = docXml.toString('utf8');

  let ra = '';
  let daChuyenTcvn3 = false;
  let trongRun = false;
  let trongT = false;
  let fallback = 0;
  let oBang = 0;
  let kieuDoan = null;
  let phongRun = null;
  let kieuRun = null;

  THE.lastIndex = 0;
  for (let m = THE.exec(xml); m; m = THE.exec(xml)) {
    if (ra.length > DO_DAI_TOI_DA * 1.2) break;
    const [, dong, ten, thuoc, tuDong, chu] = m;
    if (chu !== undefined) {
      if (!trongT || fallback > 0) continue;
      const phong = phongRun ?? phongKieu(kieuRun) ?? phongKieu(kieuDoan ?? kieuDoanMacDinh) ?? macDinh;
      const giaiMa = giaiMaXml(chu);
      if (phong && /^\.vn/i.test(phong)) {
        ra += tcvn3SangUnicode(giaiMa, { inHoa: /H$/.test(phong) });
        daChuyenTcvn3 = true;
      } else {
        ra += giaiMa;
      }
      continue;
    }
    const mo = !dong;
    const dongNgay = Boolean(tuDong);
    if (ten === 'mc:Fallback') { if (dongNgay) continue; fallback += mo ? 1 : -1; continue; }
    if (fallback > 0) continue;
    switch (ten) {
      case 'w:p':
        if (mo && !dongNgay) kieuDoan = null;
        else ra += oBang > 0 ? ' ' : '\n';
        break;
      case 'w:pStyle': if (mo) kieuDoan = thuocTinh(thuoc, 'w:val'); break;
      case 'w:r':
        if (mo && !dongNgay) { trongRun = true; phongRun = null; kieuRun = null; } else trongRun = false;
        break;
      case 'w:rFonts': if (trongRun) phongRun = phongCua(thuoc); break;
      case 'w:rStyle': if (trongRun) kieuRun = thuocTinh(thuoc, 'w:val'); break;
      case 'w:t': trongT = mo && !dongNgay; break;
      case 'w:tab': if (trongRun) ra += '\t'; break;
      case 'w:br': case 'w:cr': if (trongRun) ra += '\n'; break;
      case 'w:tc':
        if (mo && !dongNgay) oBang += 1; else { oBang = Math.max(0, oBang - 1); ra += '\t'; }
        break;
      case 'w:tr': if (!mo) ra += '\n'; break;
      default: break;
    }
  }
  return { noiDung: chuanHoa(ra), phuongPhap: 'docx', daChuyenTcvn3, soTrang: null };
}
