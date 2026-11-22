/**
 * SỔ TAY TRIỂN KHAI (P81) — mọi chỗ trỏ sang tài liệu kỹ thuật phải có thật
 *
 * Sổ tay cho người không biết lập trình không chép lại khối lệnh dài, mà chỉ "mở tài liệu
 * kỹ thuật, mục B8 chép khối này". Ai đổi tên/xoá mục ở HUONG-DAN-TRIEN-KHAI.md mà quên
 * sổ tay thì người cài đứng giữa chừng không biết chép gì — test này bắt chỗ lệch đó.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../docs/${p}`, import.meta.url), 'utf8');

test('mọi mục kỹ thuật sổ tay nhắc tới (B3, C3, F7, G6…) đều có trong tài liệu kỹ thuật', async () => {
  const soTay = await doc('SO-TAY-TRIEN-KHAI.md');
  const kyThuat = await doc('HUONG-DAN-TRIEN-KHAI.md');
  const muc = new Set([...soTay.matchAll(/\b([BCDEFG])(\d{1,2})\b/g)].map((m) => m[1] + m[2]));
  assert.ok(muc.size >= 15, `sổ tay chỉ nhắc ${muc.size} mục — có vẻ đã bị cắt`);
  const thieu = [...muc].filter((m) => !kyThuat.includes(`### ${m}.`));
  assert.deepEqual(thieu, [], `sổ tay trỏ tới mục không còn trong tài liệu kỹ thuật: ${thieu.join(', ')}`);
  for (const phan of ['Phần D', 'Phần F', 'Phần G']) {
    if (soTay.includes(phan)) assert.ok(kyThuat.includes(`## ${phan} —`), `thiếu ${phan}`);
  }
  if (soTay.includes('VIỆC CHỜ')) assert.ok(kyThuat.includes('## Phụ lục — VIỆC CHỜ'));
});

test('sổ tay giữ các quy tắc an toàn: không gửi khoá, không mở cổng nội bộ, chép ba khoá ra giấy', async () => {
  const s = await doc('SO-TAY-TRIEN-KHAI.md');
  assert.match(s, /\*\*Không bao giờ\*\* gửi cho ai/);
  assert.match(s, /Không mở 4000, 4001, 3306/);
  assert.match(s, /ENCRYPTION_KEY.*sai một ký tự.*mất vĩnh viễn/);
  assert.match(s, /Private Access/);
});

/* P116: phương án đã chốt là TOÀN BỘ ở Viettel (máy CS1 + kho vDBS nối nội bộ) và sao lưu
   sang Bizfly. Trước P116, Phần C còn viết cho VNPT và sổ tay phải dặn "thay HOST-VNPT bằng…":
   người cài làm theo nguyên văn là đi mua nhầm nhà cung cấp, hoặc gõ nhầm chữ thay. */
test('tài liệu triển khai đi thẳng theo Viettel vDBS + Bizfly, không còn lệnh hay bước viết cho VNPT', async () => {
  const kyThuat = await doc('HUONG-DAN-TRIEN-KHAI.md');
  const soTay = await doc('SO-TAY-TRIEN-KHAI.md');
  for (const [ten, s] of [['tài liệu kỹ thuật', kyThuat], ['sổ tay', soTay]]) {
    assert.doesNotMatch(s, /HOST-VNPT|PORT-VNPT|USER-VNPT|ca-vnpt\.pem/, `${ten} còn chữ thay của VNPT`);
    assert.doesNotMatch(s, /^#{2,3} .*VNPT/m, `${ten} còn mục mang tên VNPT`);
  }
  assert.match(kyThuat, /^## Phần C — Kho dữ liệu Viettel vDBS/m);
  const c = kyThuat.slice(kyThuat.indexOf('## Phần C —'), kyThuat.indexOf('## Phần D —'));
  assert.match(c, /Private Access/);
  assert.match(c, /Connect To Other Subnet/);
  /* lệnh nhắm vào kho mới đều dùng chữ thay của vDBS; lệnh nhắm vào Aiven giữ TLS riêng của Aiven */
  for (const dong of c.split('\n').filter((d) => /^(mysql|mysqldump) /.test(d))) {
    assert.match(dong, /DIA-CHI-KHO|HOST-AIVEN/, `lệnh không rõ nhắm vào kho nào: ${dong}`);
  }
  assert.match(kyThuat, /RCLONE_DICH=bizfly:/, 'sao lưu Phần G phải gửi sang Bizfly');
  assert.doesNotMatch(kyThuat, /'sao_luu'@'%'/, 'tài khoản sao lưu phải giới hạn theo địa chỉ máy chủ');
});

/* P125: kịch bản đồng hành chỉ trỏ sang sổ tay ("chặng 9") và tài liệu kỹ thuật ("C3", "G6").
   Đổi tên mục mà quên kịch bản thì đúng buổi đang làm dở, người vận hành không tìm ra chỗ chép. */
test('kịch bản đồng hành: mọi chặng và mục kỹ thuật nhắc tới đều có thật, giữ quy tắc không gửi khoá', async () => {
  const kb = await doc('KICH-BAN-DONG-HANH-TRIEN-KHAI.md');
  const soTay = await doc('SO-TAY-TRIEN-KHAI.md');
  const kyThuat = await doc('HUONG-DAN-TRIEN-KHAI.md');
  const muc = new Set([...kb.matchAll(/\b([BCDEFG])(\d{1,2})\b/g)].map((m) => m[1] + m[2]));
  muc.delete('F12'); // phím F12 mở bảng Console của trình duyệt, không phải mục tài liệu
  const thieuMuc = [...muc].filter((m) => !kyThuat.includes(`### ${m}.`));
  assert.deepEqual(thieuMuc, [], `kịch bản trỏ tới mục không có: ${thieuMuc.join(', ')}`);
  const chang = new Set([...kb.matchAll(/[Cc]hặng (\d{1,2})(?:[–-](\d{1,2}))?/g)].flatMap((m) => {
    const a = Number(m[1]); const b = Number(m[2] ?? m[1]);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }));
  const thieuChang = [...chang].filter((n) => !soTay.includes(`## Chặng ${n} —`));
  assert.deepEqual(thieuChang, [], `kịch bản trỏ tới chặng không có: ${thieuChang.join(', ')}`);
  assert.match(kb, /KHÔNG BAO GIỜ gửi/);
  assert.match(kb, /ENCRYPTION_KEY/);
  assert.match(kb, /xoa_ho_so_mau\.sql/, 'đêm chuyển phải dọn hồ sơ mẫu (ND-095)');
  assert.match(kb, /Test-NetConnection IP-MAY-VIETTEL -Port 4001/, 'phải kiểm từ ngoài cổng cán bộ đóng');
  /* Máy dựng sẵn để chờ: không giữ bản chép thử dữ liệu thật, không để máy chủ/sao lưu tự chạy */
  const cho = kb.slice(kb.indexOf('### Giai đoạn 6 —'), kb.indexOf('### Giai đoạn 7 —'));
  assert.match(cho, /systemctl disable --now hop-thu-cong-khai hop-thu-can-bo/);
  assert.match(cho, /systemctl disable --now hop-thu-sao-luu\.timer/);
  assert.match(cho, /DROP DATABASE hop_thu_an_ninh_so/, 'chế độ chờ phải xoá bản chép thử dữ liệu thật');
  const bat = kb.slice(kb.indexOf('### Giai đoạn 7 —'), kb.indexOf('### Giai đoạn 8 —'));
  assert.match(bat, /systemctl enable --now hop-thu-sao-luu\.timer/, 'ngày bật phải bật lại sao lưu');
});

/* P127: phiếu biến là chỗ người vận hành dựa vào để "không sót dòng nào". Mã đọc thêm biến môi
   trường mới mà phiếu không ghi thì người cài không biết phải đặt — test quét chính mã nguồn. */
test('phiếu biến triển khai ghi đủ mọi biến môi trường máy chủ và giao diện đọc', async () => {
  const { readdir } = await import('node:fs/promises');
  const phieu = await doc('PHIEU-BIEN-TRIEN-KHAI.md');
  const duyet = async (dir) => (await readdir(dir, { withFileTypes: true, recursive: true }))
    .filter((f) => f.isFile() && /\.(js|ts|tsx)$/.test(f.name))
    .map((f) => new URL(`${f.parentPath ?? f.path}/${f.name}`, 'file://').pathname);
  const goc = new URL('../../', import.meta.url).pathname;
  const tep = [...await duyet(goc + 'server/src'), ...await duyet(goc + 'src')];
  const bien = new Set();
  for (const t of tep) {
    const s = await readFile(t, 'utf8');
    for (const m of s.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|\benv\(['"]([A-Z][A-Z0-9_]+)['"]|import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) {
      bien.add(m[1] ?? m[2] ?? m[3]);
    }
  }
  assert.ok(bien.size >= 20, `chỉ quét được ${bien.size} biến — đường dẫn quét có vẻ sai`);
  const thieu = [...bien].filter((b) => !phieu.includes(`\`${b}\``));
  assert.deepEqual(thieu, [], `phiếu biến chưa ghi: ${thieu.join(', ')}`);
  assert.match(phieu, /🔒/, 'phải đánh dấu dòng nào là bí mật');
  assert.match(phieu, /Không\.\*\* Note trên điện thoại/, 'phải dặn không ghi khoá vào note');
});
