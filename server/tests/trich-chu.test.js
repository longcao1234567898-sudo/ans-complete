/**
 * TRÍCH CHỮ TỆP ĐÍNH KÈM — OCR NỘI BỘ, CHUẨN HOÁ VĂN BẢN (P52)
 * ============================================================================
 *
 * Người vận hành muốn cán bộ đọc và tìm được nội dung trong tệp Word, PDF, ảnh
 * mà người dân gửi kèm, bằng OCR NỘI BỘ. Quyết định thiết kế (ADR-005):
 *   · Không gửi tệp ra dịch vụ ngoài (Google, Gemini...): tệp đính kèm của tin
 *     tố giác có thể chứa chính danh tính người tố giác.
 *   · Chạy ở MÁY CHỦ, trong TIẾN TRÌNH CON không mang khoá bí mật: bộ đọc PDF/Word
 *     là chỗ dễ bị tệp độc khai thác nhất; tiến trình con chết (hết bộ nhớ, treo)
 *     thì máy chủ chính và kênh tiếp nhận vẫn sống.
 *   · Word (.docx): đọc thẳng chữ, không cần OCR. PDF có lớp chữ: đọc lớp chữ.
 *     PDF scan và ảnh: OCR tiếng Việt (tự đọc lại kèm tiếng Anh khi thấy là văn
 *     bản tiếng Anh). Mô hình nằm trong node_modules — không tải gì lúc chạy.
 *   · Chuẩn hoá: Unicode NFC, khoảng trắng, ký tự điều khiển, và chuyển chữ gõ
 *     phông .VnTime (TCVN3) cũ sang Unicode. Bản "không dấu" để tìm kiếm.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { taoZip, taoDocx, run, W } from './gia-lap/tao-docx.js';

const ch = await import('../src/lib/chuan-hoa-van-ban.js');
const { docDocx } = await import('../src/lib/trich-chu/docx.js');
const { docZip } = await import('../src/lib/trich-chu/zip.js');
const { kichThuocAnh, sangBmp } = await import('../src/lib/trich-chu/anh.js');
const trich = await import('../src/lib/trich-chu/index.js');

const fixture = (ten) => readFile(new URL(`./fixtures/${ten}`, import.meta.url));

describe('Chuẩn hoá văn bản', () => {
  test('NFC: chữ dựng sẵn và chữ tổ hợp ra cùng một chuỗi', () => {
    const toHop = 'Nguyễn'; // ê + ngã viết bằng dấu tổ hợp
    assert.equal(ch.chuanHoa(toHop), 'Nguyễn');
  });

  test('bỏ ký tự điều khiển, khoảng trắng lạ, dòng trống thừa', () => {
    const vao = 'Dòng một​\r\n\r\n\r\n\r\n  Dòng   hai\t\tcó tab \u0007\n';
    assert.equal(ch.chuanHoa(vao), 'Dòng một\n\nDòng hai có tab');
  });

  test('TCVN3 (.VnTime) -> Unicode: bảng mã đối chiếu iconv TCVN5712-1', () => {
    assert.equal(ch.tcvn3SangUnicode('Céng hßa x· héi chñ nghÜa ViÖt Nam'), 'Cộng hòa xã hội chủ nghĩa Việt Nam');
    assert.equal(ch.tcvn3SangUnicode('§éc lËp - Tù do - H¹nh phóc'), 'Độc lập - Tự do - Hạnh phúc');
    assert.equal(ch.tcvn3SangUnicode('c­tró'), 'cưtrú', 'ư của TCVN3 là ký tự gạch mềm');
  });

  test('phông .VnTimeH (chữ hoa) -> in hoa sau khi chuyển', () => {
    assert.equal(ch.tcvn3SangUnicode('®¬n tr×nh b¸o', { inHoa: true }), 'ĐƠN TRÌNH BÁO');
  });

  test('đoán TCVN3 trong chữ trích từ PDF: chuyển dòng loạn mã, không đụng dòng Unicode', () => {
    const vao = 'Céng hßa x· héi chñ nghÜa ViÖt Nam\nCộng hòa xã hội chủ nghĩa Việt Nam\nGiá 5 × 3 · 2 = 30\nT«i tªn lμ NguyÔn V¨n Thö';
    const ra = ch.suaTcvn3TheoDong(vao).split('\n');
    assert.equal(ra[0], 'Cộng hòa xã hội chủ nghĩa Việt Nam');
    assert.equal(ra[1], 'Cộng hòa xã hội chủ nghĩa Việt Nam', 'dòng Unicode giữ nguyên');
    assert.equal(ra[2], 'Giá 5 × 3 · 2 = 30', 'dấu nhân, dấu chấm giữa không bị coi là TCVN3');
    assert.equal(ra[3], 'Tôi tên là Nguyễn Văn Thử', 'μ (PDF đổi từ µ) cũng là à');
  });

  test('dòng TCVN3 toàn chữ hoa ASCII -> in hoa cả dòng', () => {
    assert.equal(ch.suaTcvn3TheoDong('§¥N TR×NH B¸O'), 'ĐƠN TRÌNH BÁO');
  });

  test('dạng tìm kiếm: không dấu, chữ thường, đ -> d', () => {
    assert.equal(ch.dangTim('  Đường  Số 7, HOÀ   Bình '), 'duong so 7, hoa binh');
    assert.equal(ch.dangTim('hòa'), ch.dangTim('hoà'));
  });

  test('cắt độ dài tối đa', () => {
    assert.ok(ch.chuanHoa('a'.repeat(ch.DO_DAI_TOI_DA + 500)).length <= ch.DO_DAI_TOI_DA);
  });
});

describe('Đọc Word (.docx) không cần thư viện ngoài', () => {
  test('đoạn, bảng, tab, xuống dòng, ký tự XML', () => {
    const docx = taoDocx(
      `<w:p>${run('Kính gửi: Công an phường')}</w:p>`
      + `<w:p>${run('A &amp; B &lt;C&gt;')}<w:r><w:tab/></w:r>${run('Cột 2')}<w:r><w:br/></w:r>${run('dòng mới')}</w:p>`
      + `<w:tbl><w:tr><w:tc><w:p>${run('Ô 1')}</w:p></w:tc><w:tc><w:p>${run('Ô 2')}</w:p></w:tc></w:tr></w:tbl>`
      + `<w:p><w:r><w:delText>chữ đã xoá</w:delText></w:r><w:r><w:instrText>PAGE</w:instrText></w:r></w:p>`,
    );
    const kq = docDocx(docx);
    assert.equal(kq.phuongPhap, 'docx');
    assert.match(kq.noiDung, /Kính gửi: Công an phường/);
    assert.match(kq.noiDung, /A & B <C> Cột 2\ndòng mới/);
    assert.match(kq.noiDung, /Ô 1 Ô 2/);
    assert.doesNotMatch(kq.noiDung, /chữ đã xoá|PAGE/, 'chữ đã xoá trong theo dõi thay đổi và mã trường không phải nội dung');
  });

  test('chữ gõ phông .VnTime / .VnTimeH được chuyển sang Unicode theo phông của từng đoạn', () => {
    const docx = taoDocx(
      `<w:p>${run('Céng hßa x· héi chñ nghÜa ViÖt Nam', '.VnTime')}</w:p>`
      + `<w:p>${run('®¬n tr×nh b¸o', '.VnTimeH')}</w:p>`
      + `<w:p>${run('Céng hßa', 'Times New Roman')}</w:p>`,
    );
    const dong = docDocx(docx).noiDung.split('\n');
    assert.equal(dong[0], 'Cộng hòa xã hội chủ nghĩa Việt Nam');
    assert.equal(dong[1], 'ĐƠN TRÌNH BÁO');
    assert.equal(dong[2], 'Céng hßa', 'phông Unicode thì giữ nguyên chữ');
    assert.equal(docDocx(docx).daChuyenTcvn3, true);
  });

  test('phông mặc định .VnTime khai ở styles.xml cũng được nhận ra', () => {
    const docx = taoDocx(
      `<w:p>${run('T«i tªn lµ NguyÔn V¨n Thö')}</w:p>`,
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=".VnTime" w:hAnsi=".VnTime"/></w:rPr></w:rPrDefault></w:docDefaults>',
    );
    assert.equal(docDocx(docx).noiDung, 'Tôi tên là Nguyễn Văn Thử');
  });

  test('tệp nén lưu thẳng (không nén) cũng đọc được', () => {
    const docx = taoZip({ 'word/document.xml': `<w:document ${W}><w:body><w:p>${run('Lưu thẳng')}</w:p></w:body></w:document>` }, { nen: false });
    assert.equal(docDocx(docx).noiDung, 'Lưu thẳng');
  });

  test('BOM NÉN: tệp giải nén vượt trần bị từ chối, không làm phình bộ nhớ', () => {
    const bom = taoZip({ 'word/document.xml': `<w:document><w:body>${'A'.repeat(60 * 1024 * 1024)}</w:body></w:document>` });
    assert.ok(bom.length < 200_000, 'tệp nén nhỏ');
    assert.throws(() => docDocx(bom), /quá lớn/);
  });

  test('không phải ZIP / thiếu word/document.xml / ZIP hỏng -> lỗi rõ ràng', () => {
    assert.throws(() => docDocx(Buffer.from('không phải zip')), /không đọc được/i);
    assert.throws(() => docDocx(taoZip({ 'a.txt': 'x' })), /document\.xml/);
    const hong = taoDocx(`<w:p>${run('x')}</w:p>`);
    hong.writeUInt32LE(0xffffffff, hong.length - 6); // trỏ thư mục trung tâm ra ngoài tệp
    assert.throws(() => docDocx(hong), /không đọc được/i);
  });

  test('docZip chỉ đọc đúng tệp được hỏi, giới hạn số mục', () => {
    const z = taoZip({ 'a.txt': 'một', 'b.txt': 'hai' });
    assert.equal(docZip(z, ['b.txt']).get('b.txt').toString(), 'hai');
    assert.equal(docZip(z, ['b.txt']).has('a.txt'), false);
  });
});

describe('Ảnh: đọc kích thước trước khi OCR (chặn bom điểm ảnh)', () => {
  test('JPEG, PNG thật', async () => {
    assert.deepEqual(kichThuocAnh(await fixture('ocr-don-trinh-bao.jpg')), { loai: 'jpeg', rong: 542, cao: 328 });
    const png = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(png);
    png.writeUInt32BE(50000, 16); png.writeUInt32BE(50000, 20);
    assert.deepEqual(kichThuocAnh(png), { loai: 'png', rong: 50000, cao: 50000 });
  });
  test('không nhận ra định dạng -> null', () => {
    assert.equal(kichThuocAnh(Buffer.from('GIF89a')), null);
    assert.equal(kichThuocAnh(Buffer.from('<svg>')), null);
  });
  test('sangBmp: ảnh điểm RGB của pdf.js -> BMP 24 bit đúng kích thước', () => {
    const bmp = sangBmp({ width: 3, height: 2, kind: 2, data: new Uint8Array(18).fill(200) });
    assert.equal(bmp.toString('latin1', 0, 2), 'BM');
    assert.equal(bmp.readInt32LE(18), 3);
    assert.equal(bmp.readInt32LE(22), 2);
    assert.equal(bmp.length, 54 + 12 * 2, 'mỗi dòng đệm cho chẵn 4 byte');
  });
});

describe('Trích chữ trong TIẾN TRÌNH CON', { timeout: 180_000 }, () => {
  after(() => trich.dungTienTrinhCon());

  test('tiến trình con KHÔNG mang khoá bí mật, mật khẩu CSDL, proxy', async () => {
    const env = await trich.xemMoiTruongCon();
    for (const k of ['JWT_SECRET', 'ENCRYPTION_KEY', 'HASH_PEPPER', 'DB_PASSWORD', 'DB_HOST', 'GEMINI_API_KEY', 'HTTPS_PROXY', 'HTTP_PROXY']) {
      assert.equal(env[k], undefined, `${k} lọt vào tiến trình con`);
    }
  });

  test('Word: trích qua tiến trình con', async () => {
    const kq = await trich.trichChu({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', duLieu: taoDocx(`<w:p>${run('Biên bản số 12')}</w:p>`) });
    assert.equal(kq.phuongPhap, 'docx');
    assert.equal(kq.noiDung, 'Biên bản số 12');
  });

  test('PDF có lớp chữ: đọc lớp chữ, không OCR', async () => {
    const kq = await trich.trichChu({ mime: 'application/pdf', duLieu: await fixture('pdf-co-lop-chu.pdf') });
    assert.equal(kq.phuongPhap, 'pdf_chu');
    assert.match(kq.noiDung, /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
    assert.match(kq.noiDung, /biển số 61-B1 234\.56/);
  });

  test('PDF gõ phông .VnTime: lớp chữ loạn mã được chuyển về Unicode', async () => {
    const kq = await trich.trichChu({ mime: 'application/pdf', duLieu: await fixture('pdf-phong-vntime.pdf') });
    assert.match(kq.noiDung, /Cộng hòa xã hội chủ nghĩa Việt Nam/);
    assert.match(kq.noiDung, /Độc lập - Tự do - Hạnh phúc/);
    assert.equal(kq.daChuyenTcvn3, true);
  });

  test('PDF scan: OCR ảnh từng trang', async () => {
    const kq = await trich.trichChu({ mime: 'application/pdf', duLieu: await fixture('ocr-pdf-scan.pdf') });
    assert.equal(kq.phuongPhap, 'ocr_pdf');
    assert.equal(kq.soTrang, 2);
    assert.match(kq.noiDung, /Công an phường Chánh Hiệp/);
    assert.ok(kq.doTinCay > 60);
  });

  test('ảnh tiếng Việt: OCR nội bộ, không mạng', async () => {
    const kq = await trich.trichChu({ mime: 'image/jpeg', duLieu: await fixture('ocr-don-trinh-bao.jpg') });
    assert.equal(kq.phuongPhap, 'ocr_anh');
    assert.equal(kq.ngonNgu, 'vie');
    assert.match(kq.noiDung, /Nguyễn Văn Thử/);
    assert.match(kq.noiDung, /61-B1 234\.56/);
  });

  test('ảnh tiếng Anh: tự nhận ra, đọc lại kèm mô hình tiếng Anh, giữ bản tin cậy hơn', async () => {
    const kq = await trich.trichChu({ mime: 'image/jpeg', duLieu: await fixture('ocr-tieng-anh.jpg') });
    assert.equal(kq.phuongPhap, 'ocr_anh');
    assert.match(kq.noiDung, /INCIDENT REPORT/);
    assert.match(kq.noiDung, /snatched a handbag/);
    assert.ok(['vie', 'vie+eng'].includes(kq.ngonNgu));
    assert.equal(kq.thuTiengAnh, true, 'phải có lượt đọc lại kèm tiếng Anh');
  });

  test('cán bộ chọn ngôn ngữ: chỉ nhận vie / eng / vie+eng', async () => {
    const kq = await trich.trichChu({ mime: 'image/jpeg', duLieu: await fixture('ocr-tieng-anh.jpg'), ngonNgu: 'eng' });
    assert.equal(kq.ngonNgu, 'eng');
    await assert.rejects(trich.trichChu({ mime: 'image/jpeg', duLieu: Buffer.alloc(10), ngonNgu: 'fra' }), /ngôn ngữ/);
  });

  test('ảnh quá nhiều điểm ảnh bị từ chối trước khi giải mã', async () => {
    const png = Buffer.alloc(64); Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(png);
    png.writeUInt32BE(50000, 16); png.writeUInt32BE(50000, 20);
    await assert.rejects(trich.trichChu({ mime: 'image/png', duLieu: png }), /quá lớn/);
  });

  test('loại tệp không hỗ trợ (Word .doc cũ, video) -> báo rõ, không treo', async () => {
    await assert.rejects(trich.trichChu({ mime: 'application/msword', duLieu: Buffer.from('d0cf11e0a1b11ae1', 'hex') }), /chưa hỗ trợ/);
    await assert.rejects(trich.trichChu({ mime: 'video/mp4', duLieu: Buffer.alloc(10) }), /chưa hỗ trợ/);
  });

  test('tệp hỏng không làm chết tiến trình con; lượt sau vẫn chạy', async () => {
    await assert.rejects(trich.trichChu({ mime: 'application/pdf', duLieu: Buffer.from('%PDF-1.4 hỏng') }));
    const kq = await trich.trichChu({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', duLieu: taoDocx(`<w:p>${run('vẫn chạy')}</w:p>`) });
    assert.equal(kq.noiDung, 'vẫn chạy');
  });

  test('quá giờ -> giết tiến trình con, báo lỗi; lượt sau dựng tiến trình mới', async () => {
    await assert.rejects(trich.trichChu({ mime: 'image/jpeg', duLieu: await fixture('ocr-don-trinh-bao.jpg') }, { hetGioMs: 5 }), /quá thời gian/);
    const kq = await trich.trichChu({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', duLieu: taoDocx(`<w:p>${run('sống lại')}</w:p>`) });
    assert.equal(kq.noiDung, 'sống lại');
  });

  test('TRICH_CHU_OCR=tat: ảnh và PDF scan báo đang tắt; Word, PDF có chữ vẫn đọc', async () => {
    const cu = process.env.TRICH_CHU_OCR;
    process.env.TRICH_CHU_OCR = 'tat';
    try {
      await assert.rejects(trich.trichChu({ mime: 'image/jpeg', duLieu: await fixture('ocr-don-trinh-bao.jpg') }), /OCR đang tắt/);
      const kq = await trich.trichChu({ mime: 'application/pdf', duLieu: await fixture('pdf-co-lop-chu.pdf') });
      assert.equal(kq.phuongPhap, 'pdf_chu');
    } finally {
      if (cu === undefined) delete process.env.TRICH_CHU_OCR; else process.env.TRICH_CHU_OCR = cu;
    }
  });
});

describe('Máy chủ công khai không có OCR', () => {
  test('may-chu-cong-khai.js không nạp gì của trích chữ (người ngoài không đẩy việc nặng vào được)', async () => {
    const ma = await readFile(new URL('../src/may-chu-cong-khai.js', import.meta.url), 'utf8');
    assert.doesNotMatch(ma, /trich-chu|tesseract|pdfjs/);
    const route = await readFile(new URL('../src/routes/submissions.js', import.meta.url), 'utf8');
    assert.doesNotMatch(route, /trich-chu|tesseract|pdfjs/, 'lúc người dân gửi tin không được kích OCR');
  });
});
