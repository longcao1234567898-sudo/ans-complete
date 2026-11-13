/**
 * LỆNH KIỂM MÃ HOÁ Ở NHẬT KÝ — chỉ được đọc LẦN CHẠY HIỆN TẠI (BUG-057)
 *
 * Từ BUG-049, /api/health công khai không còn báo mã hoá bật hay chưa; người vận hành xem ở
 * nhật ký khởi động bằng lệnh chép từ HUONG-DAN mục B9 và SO-TAY chặng 11. Nhật ký giữ mọi lần
 * khởi động, và số dòng trạng thái mỗi lần không cố định (tốt 2, hỏng 3) — nên `… | tail -n`
 * lấy lẫn dòng của lần trước: lần trước tốt, lần này hỏng khoá → vẫn ra "ĐÃ BẬT".
 *
 * Test này chạy LỆNH TRONG TÀI LIỆU lên một nhật ký giả nhiều lần chạy, theo đúng cách journald
 * lọc (-u đơn vị, _SYSTEMD_INVOCATION_ID=mã lần chạy, grep -E, tail). Đã đối chiếu với journald
 * THẬT (systemd 252, unit nguyên văn mục B8, máy chủ chạy nguyên văn) ở phiên FIX BUG-057.
 * Lệnh có dạng mà bộ dịch dưới đây không hiểu → ĐỎ: ai đổi dạng lệnh phải kiểm lại trên journald
 * thật rồi mới dạy bộ dịch dạng mới — đừng nới bộ dịch cho xanh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DV = ['hop-thu-cong-khai', 'hop-thu-can-bo'];

async function doc(ten) {
  return readFile(new URL(`../../docs/${ten}`, import.meta.url), 'utf8');
}
/** Các dòng lệnh journalctl trong một đoạn tài liệu (bỏ thụt đầu dòng). */
function lenhTrong(s, batDau, ketThuc) {
  const a = s.indexOf(batDau);
  const b = s.indexOf(ketThuc, a + 1);
  assert.ok(a >= 0 && b > a, `không tìm thấy đoạn "${batDau}" … "${ketThuc}"`);
  return s.slice(a, b).split('\n').map((d) => d.trim()).filter((d) => d.startsWith('journalctl '));
}
const NGUON = [
  ['HUONG-DAN-TRIEN-KHAI.md', '### B9.', '### B9b'],
  ['SO-TAY-TRIEN-KHAI.md', '## Chặng 11', '## Chặng 12'],
];

/* ---- bộ dịch lệnh: chỉ những dạng đã kiểm trên journald thật ---------------------------- */
const RE_LENH = new RegExp(
  '^journalctl -u (\\S+)' +
  '(?: _SYSTEMD_INVOCATION_ID=\\$\\(systemctl show -p InvocationID --value (\\S+)\\))?' +
  ' *\\| grep -E "([^"]+)"' +
  '(?: \\| tail -(\\d+))?$');

function dich(lenh) {
  const m = lenh.match(RE_LENH);
  assert.ok(m, `lệnh có dạng lạ — kiểm lại trên journald thật trước khi dạy bộ dịch:\n  ${lenh}`);
  return { donVi: m[1], maCua: m[2] ?? null, mau: new RegExp(m[3]), tail: m[4] ? Number(m[4]) : null };
}

/** Chạy lệnh đã dịch lên nhật ký giả. `hienTai`: mã lần chạy hiện tại của từng đơn vị. */
function chay(l, nhatKy, hienTai) {
  let ra = nhatKy.filter((e) => e.donVi === l.donVi);
  if (l.maCua) ra = ra.filter((e) => e.lanChay === (hienTai[l.maCua] ?? ''));
  ra = ra.map((e) => e.dong).filter((d) => l.mau.test(d));
  return l.tail == null ? ra : ra.slice(-l.tail);
}

/* ---- nhật ký giả: đúng các dòng inTrangThaiKhoiDong (nen-tang.js) in ra ------------------ */
const LY_DO = {
  thieu: 'chưa đặt biến môi trường ENCRYPTION_KEY',
  'sai-dang': 'ENCRYPTION_KEY sai định dạng (cần đúng 64 ký tự hex 0-9a-f, đang có 63 ký tự)',
  'toan-0': 'ENCRYPTION_KEY toàn số 0, không phải khoá thật',
};
function dongKhoiDong(tt) {
  if (tt === 'sap') return ['Error: THIẾU JWT_SECRET.', '   Máy chủ không khởi động vì thiếu khoá ký phiên đăng nhập.'];
  const dau = ['   Phiên bản backend: v9-2026-08', '   AI (Gemini): chưa cấu hình key'];
  if (tt === 'tot') return [...dau, '🔒 Mã hoá danh tính: ĐÃ BẬT (AES-256-GCM)'];
  return [...dau, '', '🔴🔴🔴 MÃ HOÁ DANH TÍNH KHÔNG HOẠT ĐỘNG 🔴🔴🔴', '   Lý do: ' + LY_DO[tt],
    '   Hệ thống VẪN CHẠY nhưng TỪ CHỐI mọi ý kiến có danh tính.', '   Tố giác ẩn danh không bị ảnh hưởng.', ''];
}

/** Dựng nhật ký: dịch vụ `dv` đi qua chuỗi trạng thái, dịch vụ kia chạy xen kẽ ở trạng thái ngược. */
function dungNhatKy(dv, chuoi) {
  const khac = DV.find((d) => d !== dv);
  const nhatKy = [];
  const hienTai = {};
  let so = 0;
  const lanChay = (donVi, tt) => {
    const ma = `ma-${++so}`;
    hienTai[donVi] = ma;
    for (const dong of dongKhoiDong(tt)) nhatKy.push({ donVi, lanChay: ma, dong });
    nhatKy.push({ donVi, lanChay: ma, dong: '🌐 Máy chủ chạy' });
  };
  for (const tt of chuoi) {
    if (tt === 'dung') { hienTai[dv] = ''; continue; }          // systemctl stop: InvocationID rỗng
    if (tt === 'moi') { hienTai[dv] = `ma-${++so}`; continue; }  // vừa restart, chưa in gì (nạp ~12 s)
    lanChay(dv, tt);
    if (tt === 'sap') lanChay(dv, 'sap');             // Restart=always: sập thêm vòng nữa
    lanChay(khac, tt === 'tot' ? 'thieu' : 'tot');    // dịch vụ kia không được lẫn vào
  }
  return { nhatKy, hienTai };
}

const CHUOI = [
  ['tot', 'thieu'], ['tot', 'sai-dang'], ['tot', 'toan-0'],            // tốt → hỏng
  ['thieu', 'tot'], ['sai-dang', 'tot'], ['toan-0', 'tot'],            // hỏng → tốt
  ['thieu', 'sai-dang'], ['toan-0', 'thieu'], ['sai-dang', 'toan-0'],  // hỏng → hỏng
  ['tot', 'tot'],                                                     // tốt → tốt
  ['tot', 'tot', 'tot', 'tot', 'thieu'],                              // nhiều lần restart
  ['tot', 'sap'], ['sap', 'tot'], ['thieu', 'sap'],                   // sập vòng
  ['tot', 'dung'], ['tot', 'moi'],                                    // không có lần chạy nào in xong
];
// "dung"/"moi" chấm như "sap": không có dòng trạng thái nào của lần hiện tại → không được ra ĐÃ BẬT
const KHONG_IN = new Set(['sap', 'dung', 'moi']);
const dem = (ra, chuoi) => ra.filter((d) => d.includes(chuoi)).length;

test('mỗi tài liệu có đúng một lệnh kiểm cho TỪNG dịch vụ, đọc mã lần chạy của chính dịch vụ đó', async () => {
  for (const [tep, a, b] of NGUON) {
    const ds = lenhTrong(await doc(tep), a, b).map(dich);
    for (const dv of DV) {
      const cua = ds.filter((l) => l.donVi === dv);
      assert.equal(cua.length, 1, `${tep}: cần đúng một lệnh journalctl -u ${dv}`);
      assert.equal(cua[0].maCua, dv, `${tep}: lệnh cho ${dv} phải lọc theo InvocationID của chính ${dv}`);
      assert.equal(cua[0].tail, null, `${tep}: lệnh cho ${dv} không được cắt bằng tail`);
    }
  }
});

for (const [tep, a, b] of NGUON) {
  for (const dv of DV) {
    test(`${tep} · ${dv}: chỉ báo trạng thái của lần chạy hiện tại`, async () => {
      const lenh = lenhTrong(await doc(tep), a, b).map(dich).filter((l) => l.donVi === dv);
      assert.ok(lenh.length > 0, `${tep}: không có lệnh kiểm cho ${dv}`);
      for (const l of lenh) {
        for (const chuoi of CHUOI) {
          const { nhatKy, hienTai } = dungNhatKy(dv, chuoi);
          const ra = chay(l, nhatKy, hienTai);
          const cuoi = chuoi.at(-1);
          const nhan = `${tep} · ${dv} · ${chuoi.join(' → ')}`;
          const bat = dem(ra, 'Mã hoá danh tính: ĐÃ BẬT');
          const khong = dem(ra, 'MÃ HOÁ DANH TÍNH KHÔNG HOẠT ĐỘNG');
          if (cuoi === 'tot') {
            assert.equal(bat, 1, `${nhan}: cần đúng 1 dòng ĐÃ BẬT\n${ra.join('\n')}`);
            assert.equal(khong, 0, `${nhan}: không được lẫn dòng KHÔNG HOẠT ĐỘNG\n${ra.join('\n')}`);
          } else if (KHONG_IN.has(cuoi)) {
            assert.equal(bat, 0, `${nhan}: máy chủ đang sập mà vẫn ra ĐÃ BẬT\n${ra.join('\n')}`);
          } else {
            assert.equal(bat, 0, `${nhan}: khoá đang hỏng mà vẫn ra ĐÃ BẬT\n${ra.join('\n')}`);
            assert.equal(khong, 1, `${nhan}: cần đúng 1 dòng KHÔNG HOẠT ĐỘNG\n${ra.join('\n')}`);
            assert.equal(dem(ra, 'Lý do:'), 1, `${nhan}: cần đúng 1 dòng Lý do\n${ra.join('\n')}`);
            assert.ok(ra.some((d) => d.includes(LY_DO[cuoi])), `${nhan}: Lý do phải của lần hiện tại\n${ra.join('\n')}`);
          }
        }
      }
    });
  }
}

test('nhật ký giả khớp đúng chuỗi máy chủ in ra (nen-tang.js, lib/crypto.js)', async () => {
  // Đổi câu chữ trong mã mà không sửa ở đây thì test trên chấm trên dòng không còn tồn tại.
  const nenTang = await readFile(new URL('../src/nen-tang.js', import.meta.url), 'utf8');
  const crypto = await readFile(new URL('../src/lib/crypto.js', import.meta.url), 'utf8');
  for (const s of ['Phiên bản backend: ', "'🔒 Mã hoá danh tính: ĐÃ BẬT (AES-256-GCM)'",
    "'🔴🔴🔴 MÃ HOÁ DANH TÍNH KHÔNG HOẠT ĐỘNG 🔴🔴🔴'", "'   Lý do: '"]) {
    assert.ok(nenTang.includes(s), `nen-tang.js không còn in ${s}`);
  }
  for (const s of ['chưa đặt biến môi trường ENCRYPTION_KEY', 'ENCRYPTION_KEY toàn số 0, không phải khoá thật',
    'ENCRYPTION_KEY sai định dạng (cần đúng 64 ký tự hex 0-9a-f, đang có ${hex.length} ký tự)']) {
    assert.ok(crypto.includes(s), `lib/crypto.js không còn câu "${s}"`);
  }
});

test('không còn câu khẳng định "tail" lấy lần khởi động gần nhất', async () => {
  const s = await doc('HUONG-DAN-TRIEN-KHAI.md');
  assert.doesNotMatch(s, /tail -\d+` lấy lần khởi động gần nhất/);
});
