/**
 * ND-052 — NÂNG CẤP TRÍCH CHỮ: PHÔNG VNI, WORD .doc ĐỜI CŨ, PDF SCAN DÀI HƠN
 * ============================================================================
 *
 *   · VNI (VNI-Times...): chữ Việt = chữ gốc + ký tự dấu Latin-1. Bảng dựng theo
 *     quy tắc trong lib/chuan-hoa-van-ban.js; ở đây đối chiếu với bảng ĐỘC LẬP
 *     (fixtures/bang-vni-doi-chieu.json, gói vietnamese-conversion, MIT). Câu mẫu
 *     VNI trong các tệp mẫu cũng mã hoá bằng bảng độc lập đó, không bằng bảng của
 *     mình — test không tự chấm bài.
 *   · Word .doc (97–2003): tệp mẫu do LibreOffice thật xuất ("MS Word 97"), không
 *     tự dựng. Mảnh chữ "nén" (Word thật hay ghi, LibreOffice không) thử bằng dữ
 *     liệu dựng theo đặc tả [MS-DOC].
 *   · PDF scan: OCR tới 30 trang (P52 là 10).
 * Dữ liệu GIẢ.
 */
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { taoDocx, run } from './gia-lap/tao-docx.js';

datBienMoiTruongHopLe();
const ch = await import('../src/lib/chuan-hoa-van-ban.js');
const docMod = await import('../src/lib/trich-chu/doc.js');
const pdfMod = await import('../src/lib/trich-chu/pdf.js');
const trich = await import('../src/lib/trich-chu/index.js');

const fixture = (ten) => readFile(new URL(`./fixtures/${ten}`, import.meta.url));
const MIME_DOC = 'application/msword';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('VNI — bảng mã', () => {
  test('khớp bảng độc lập ở mọi ô (130 ô, cả chữ hoa)', async () => {
    const { bang } = JSON.parse(await fixture('bang-vni-doi-chieu.json'));
    assert.equal(bang.length, 130);
    const lech = bang.filter((o) => ch.vniSangUnicode(o.vni) !== o.unicode)
      .map((o) => `${o.vni} -> ${ch.vniSangUnicode(o.vni)} (đúng: ${o.unicode})`);
    assert.deepEqual(lech, []);
  });

  test('bốn ô bảng độc lập tự mâu thuẫn (ỷ ỹ): theo quy tắc chữ gốc + dấu', async () => {
    const { boQua } = JSON.parse(await fixture('bang-vni-doi-chieu.json'));
    /* Bảng kia cho ỹ = "ì" — nhưng "ì" đã là i huyền; ỷ = "ë" — nhưng "aë" là ặ */
    assert.deepEqual(boQua.map((o) => o.unicode).sort(), ['Ỷ', 'Ỹ', 'ỷ', 'ỹ'].sort());
    assert.equal(ch.vniSangUnicode('ì'), 'ì');
    assert.equal(ch.vniSangUnicode('aë'), 'ặ');
    assert.equal(ch.vniSangUnicode('thuyû kyû myõ'), 'thuỷ kỷ mỹ');
    assert.equal(ch.vniSangUnicode('KYÛ MYÕ'), 'KỶ MỸ');
  });

  test('67 chữ thường ra 67 chữ khác nhau — không ô nào trùng', () => {
    const chu = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
    const dau = { '́': 'ù', '̀': 'ø', '̉': 'û', '̃': 'õ', '̣': 'ï' };
    /* Đi ngược: từ chữ Unicode dựng chuỗi VNI theo luật đã công bố, giải lại phải ra đúng chữ đó */
    const raVni = (c) => {
      const d = [...c.normalize('NFD')];
      const goc = d[0]; const thanh = d.find((x) => dau[x]);
      if (goc === 'đ') return 'ñ';
      if (goc === 'i') return thanh ? 'íìæóò'['ùøûõï'.indexOf(dau[thanh])] : 'i';
      if (goc === 'y' && thanh === '̣') return 'î';
      if (d.includes('̂')) return goc + (thanh ? 'áàåãä'['ùøûõï'.indexOf(dau[thanh])] : 'â');
      if (d.includes('̆')) return goc + (thanh ? 'éèúüë'['ùøûõï'.indexOf(dau[thanh])] : 'ê');
      if (d.includes('̛')) return (goc === 'o' ? 'ô' : 'ö') + (thanh ? dau[thanh] : '');
      return goc + (thanh ? dau[thanh] : '');
    };
    const ket = [...chu].map((c) => ch.vniSangUnicode(raVni(c)));
    assert.deepEqual(ket, [...chu]);
    assert.equal(new Set(ket).size, 67);
  });
});

describe('VNI — đoán theo dòng (lớp chữ PDF, .doc)', () => {
  test('cả văn bản VNI, kể cả dòng ngắn và dòng in hoa', () => {
    const vao = 'COÄNG HOØA XAÕ HOÄI CHUÛ NGHÓA VIEÄT NAM\nÑoäc laäp - Töï do - Haïnh phuùc\nÑÔN TRÌNH BAÙO\nToâi teân laø Nguyeãn Vaên Thöû\nXin chaøo';
    assert.equal(ch.suaMaCuTheoDong(vao),
      'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nĐƠN TRÌNH BÁO\nTôi tên là Nguyễn Văn Thử\nXin chào');
  });

  test('văn bản trộn: tiêu đề Unicode giữ nguyên, thân VNI được chuyển', () => {
    const vao = 'Công an phường Chánh Hiệp\nToâi teân laø Nguyeãn Vaên Thöû, sinh naêm 1980.\nHoài 21 giôø 30 phuùt toâi phaùt hieän moät xe maùy.\nXin chaøo';
    const ra = ch.suaMaCuTheoDong(vao).split('\n');
    assert.equal(ra[0], 'Công an phường Chánh Hiệp');
    assert.equal(ra[1], 'Tôi tên là Nguyễn Văn Thử, sinh năm 1980.');
    assert.equal(ra[3], 'Xin chào');
  });

  test('văn bản Unicode chỉ có chữ Latin-1 ("Hoà Bình, toà án") không bị đụng', () => {
    for (const d of ['Hoà Bình, toà án hoà giải', 'Giá 5 × 3 · 2 = 30', 'Café', 'where are you?', 'Tù và rõ ràng']) {
      assert.equal(ch.suaMaCuTheoDong(d), d, d);
    }
  });

  test('TCVN3 vẫn là TCVN3, không bị nhận nhầm là VNI', () => {
    assert.equal(ch.suaMaCuTheoDong('Céng hßa x· héi chñ nghÜa ViÖt Nam'), 'Cộng hòa xã hội chủ nghĩa Việt Nam');
    assert.equal(ch.suaMaCuTheoDong('ViÖt Nam chñ'), 'Việt Nam chủ');
  });
});

describe('Word .docx gõ phông VNI', () => {
  test('đoạn chữ phông VNI-Times được chuyển, đoạn Unicode giữ nguyên', async () => {
    const xml = `<w:p>${run('Coäng hoøa xaõ hoäi chuû nghóa Vieät Nam', 'VNI-Times')}</w:p><w:p>${run('Hoà Bình')}</w:p>`;
    const kq = await trich.trichChu({ mime: MIME_DOCX, duLieu: taoDocx(xml) });
    assert.equal(kq.noiDung, 'Cộng hòa xã hội chủ nghĩa Việt Nam\nHoà Bình');
    assert.equal(kq.daChuyenTcvn3, true);
  });
});

describe('Word .doc đời cũ (97–2003)', { timeout: 120_000 }, () => {
  after(() => trich.dungTienTrinhCon());

  test('tệp LibreOffice xuất thật: đoạn, bảng, liên kết (bỏ mã trường, giữ chữ hiện)', async () => {
    const kq = await trich.trichChu({ mime: MIME_DOC, duLieu: await fixture('word97-unicode.doc') });
    assert.equal(kq.phuongPhap, 'doc');
    assert.match(kq.noiDung, /^ĐƠN TRÌNH BÁO\n/);
    assert.match(kq.noiDung, /Tôi tên là Nguyễn Văn Thử \(dữ liệu giả\), xin trình báo vụ việc xảy ra lúc 21 giờ/);
    assert.match(kq.noiDung, /Biển số 61-B1 234\.56\nMàu xe Đỏ đen/);
    assert.match(kq.noiDung, /Vị trí: xem bản đồ hiện trường — kèm ảnh\./);
    assert.doesNotMatch(kq.noiDung, /HYPERLINK|vi-du\.vn/, 'mã trường lọt vào chữ');
    assert.equal(kq.daChuyenTcvn3, false);
  });

  test('.doc gõ phông VNI -> Unicode', async () => {
    /* Tệp mẫu: các câu này mã hoá VNI bằng bảng độc lập, LibreOffice xuất .doc */
    const cau = [
      'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'Độc lập - Tự do - Hạnh phúc', 'ĐƠN TRÌNH BÁO',
      'Tôi tên là Nguyễn Văn Thử (dữ liệu giả), sinh năm 1980.',
      'Hồi 21 giờ 30 phút ngày 12 tháng 3 năm 2024, tôi phát hiện một xe máy biển số 61-B1 234.56 chở hàng lậu.',
      'Xin chào'];
    const kq = await trich.trichChu({ mime: MIME_DOC, duLieu: await fixture('word97-phong-vni.doc') });
    assert.equal(kq.noiDung, cau.join('\n'));
    assert.equal(kq.daChuyenTcvn3, true);
  });

  test('.doc gõ phông .VnTime (TCVN3) -> Unicode', async () => {
    const kq = await trich.trichChu({ mime: MIME_DOC, duLieu: await fixture('word97-phong-vntime.doc') });
    assert.equal(kq.noiDung, 'Tôi tên là Nguyễn Văn Thử, trình báo việc mất xe máy ở chợ Bình Chánh.');
    assert.equal(kq.daChuyenTcvn3, true);
  });

  test('tệp có mật khẩu: báo rõ, không đọc', async () => {
    const buf = Buffer.from(await fixture('word97-unicode.doc'));
    /* Đầu luồng WordDocument (FIB) bắt đầu bằng 0xA5EC ở đầu một sector; bật cờ fEncrypted */
    let o = -1;
    for (let i = 512; i < buf.length; i += 512) if (buf.readUInt16LE(i) === 0xa5ec) { o = i; break; }
    assert.ok(o > 0, 'không thấy FIB trong tệp mẫu');
    buf.writeUInt16LE(buf.readUInt16LE(o + 0x0a) | 0x0100, o + 0x0a);
    await assert.rejects(trich.trichChu({ mime: MIME_DOC, duLieu: buf }), /mật khẩu/);
  });

  test('tệp hỏng, cụt, RTF/HTML đội tên .doc: báo rõ, tiến trình con không chết', async () => {
    const that = await fixture('word97-unicode.doc');
    await assert.rejects(trich.trichChu({ mime: MIME_DOC, duLieu: Buffer.from('d0cf11e0a1b11ae1', 'hex') }), /hỏng/);
    await assert.rejects(trich.trichChu({ mime: MIME_DOC, duLieu: that.subarray(0, 2048) }), /hỏng/);
    await assert.rejects(trich.trichChu({ mime: MIME_DOC, duLieu: Buffer.from('{\\rtf1\\ansi Xin chao}') }), /RTF/);
    await assert.rejects(trich.trichChu({ mime: MIME_DOC, duLieu: Buffer.from('<html><body>x</body></html>') }), /HTML/);
    /* Chuỗi sector lặp vòng: trỏ ô FAT đầu tiên của thư mục về chính nó */
    const vong = Buffer.from(that);
    const ssDau = vong.readUInt32LE(0x30);
    const fat0 = vong.readUInt32LE(0x4c);
    vong.writeUInt32LE(ssDau, 512 + fat0 * 512 + ssDau * 4);
    await assert.rejects(trich.trichChu({ mime: MIME_DOC, duLieu: vong }), /hỏng/);
    const kq = await trich.trichChu({ mime: MIME_DOCX, duLieu: taoDocx(`<w:p>${run('vẫn chạy')}</w:p>`) });
    assert.equal(kq.noiDung, 'vẫn chạy');
  });

  test('mảnh chữ "nén" (một byte, windows-1252) và mảnh Unicode ghép đúng thứ tự', () => {
    /* WordDocument giả: "Xin chào " nén ở byte 100 (fc ghi 200 + cờ nén), "Việt Nam" UTF-16 ở byte 300 */
    const wd = Buffer.alloc(400);
    Buffer.from('Xin ch\xe0o ', 'latin1').copy(wd, 100);
    Buffer.from('Việt Nam', 'utf16le').copy(wd, 300);
    const plc = Buffer.alloc(4 * 3 + 8 * 2);
    plc.writeUInt32LE(0, 0); plc.writeUInt32LE(9, 4); plc.writeUInt32LE(17, 8);
    plc.writeUInt32LE((200 | 0x40000000) >>> 0, 12 + 2);
    plc.writeUInt32LE(300, 12 + 8 + 2);
    const clx = Buffer.concat([Buffer.from([0x01, 0x02, 0x00, 0xaa, 0xbb]), Buffer.from([0x02]), Buffer.alloc(4), plc]);
    clx.writeUInt32LE(plc.length, 6);
    assert.equal(docMod.ghepManh(wd, clx, 17), 'Xin chào Việt Nam');
    assert.equal(docMod.ghepManh(wd, clx, 5), 'Xin c', 'chỉ lấy đúng số ký tự thân văn bản');
    assert.throws(() => docMod.ghepManh(wd.subarray(0, 310), clx, 17), /hỏng/, 'mảnh trỏ ra ngoài luồng');
  });

  test('trường lồng nhau: bỏ mã, giữ kết quả', () => {
    const tho = 'Xem \x13 HYPERLINK "https://x.vn" \x14bản \x13 PAGE \x143\x15 đồ\x15 nhé\rDòng hai\x07ô hai\x07\x07';
    assert.equal(docMod.lamSachChuWord(tho), 'Xem bản 3 đồ nhé\nDòng hai\tô hai\n');
  });
});

describe('PDF scan dài hơn', () => {
  test('OCR tới 30 trang; hết giờ tiến trình con nới theo (ít nhất 6 phút)', () => {
    assert.equal(pdfMod.TRANG_OCR_TOI_DA, 30);
    assert.ok(trich.HET_GIO_MS >= 360_000);
  });

  test('PDF gõ phông VNI: lớp chữ loạn mã được chuyển về Unicode', async () => {
    const kq = await pdfMod.docPdf(await fixture('pdf-phong-vni.pdf'), { ocrBat: false });
    assert.equal(kq.phuongPhap, 'pdf_chu');
    assert.match(kq.noiDung, /^CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nĐƠN TRÌNH BÁO/);
    assert.match(kq.noiDung, /Tôi tên là Nguyễn Văn Thử \(dữ liệu giả\), sinh năm 1980\./);
    assert.equal(kq.daChuyenTcvn3, true);
  });
});

describe('giao diện', () => {
  test('mô tả cách lấy chữ có Word .doc; nhãn phông cũ nói cả VNI', async () => {
    const u = process.features?.typescript
      ? await import(new URL('../../src/utils/chuTrongTep.ts', import.meta.url).href) : null;
    if (u) assert.match(u.moTaPhuongPhap({ phuongPhap: 'doc', soTrang: null, doTinCay: null, ngonNgu: null }), /Word/);
    const ma = await readFile(new URL('../../src/components/admin/KhuChuTrongTep.tsx', import.meta.url), 'utf8');
    assert.match(ma, /VNI/);
  });
});
