/**
 * LỆNH KIỂM MÃ HOÁ Ở NHẬT KÝ — chỉ được đọc LẦN CHẠY HIỆN TẠI (BUG-057)
 *
 * Từ BUG-049, /api/health công khai không còn báo mã hoá bật hay chưa; người vận hành xem ở
 * nhật ký khởi động bằng lệnh chép từ HUONG-DAN mục B9 và SO-TAY chặng 11. Nhật ký giữ mọi lần
 * khởi động, và số dòng trạng thái mỗi lần không cố định (tốt 2, hỏng 3) — nên `… | tail -n`
 * lấy lẫn dòng của lần trước: lần trước tốt, lần này hỏng khoá → vẫn ra "ĐÃ BẬT".
 *
 * Test này chạy LỆNH TRONG TÀI LIỆU lên một nhật ký giả nhiều lần chạy, theo đúng cách journald
 * lọc (-u đơn vị, _SYSTEMD_INVOCATION_ID=mã lần chạy, grep -E, tail) và cách systemd trả lời
 * (`systemctl is-active`, `systemctl show -p InvocationID`). Đã đối chiếu với journald THẬT ở hai
 * phiên FIX BUG-057 (systemd 252; vòng 2: Ubuntu 24.04 / systemd 255, unit nguyên văn mục B8 và
 * ĐÃ `systemctl enable` như B8, máy chủ chạy nguyên văn).
 *
 * Vòng 2: mã lần chạy KHÔNG đủ để biết "đang chạy" — sau `systemctl stop`, unit đã enable vẫn giữ
 * mã của lần chạy vừa kết thúc, nên lệnh chỉ lọc theo mã in "ĐÃ BẬT" của một máy chủ đã dừng.
 * Lệnh phải hỏi systemd dịch vụ có đang chạy không (`systemctl is-active <dv> &&`) trước khi đọc.
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
/**
 * Các dòng lệnh kiểm trong một đoạn tài liệu (bỏ thụt đầu dòng): MỌI dòng có `journalctl` và
 * `| grep` — kể cả dòng có tiền tố lạ (`sudo …`): dòng đó phải qua bộ dịch, không được lặng lẽ bỏ
 * qua (trọng tài FIX vòng 2: lọc theo đầu dòng thì `sudo journalctl … | tail -1` lọt mà test xanh).
 */
function lenhTrong(s, batDau, ketThuc) {
  const a = s.indexOf(batDau);
  const b = s.indexOf(ketThuc, a + 1);
  assert.ok(a >= 0 && b > a, `không tìm thấy đoạn "${batDau}" … "${ketThuc}"`);
  return s.slice(a, b).split('\n').map((d) => d.trim())
    // Câu văn nhắc lệnh trong `…` (vd "đừng đổi thành `journalctl … | tail`") không phải lệnh để chép.
    .filter((d) => d.includes('journalctl') && d.includes('| grep') && !d.includes('`'));
}
/** Nguyên đoạn tài liệu (để kiểm câu chữ). */
function doan(s, batDau, ketThuc) {
  const a = s.indexOf(batDau);
  return s.slice(a, s.indexOf(ketThuc, a + 1));
}
const NGUON = [
  ['HUONG-DAN-TRIEN-KHAI.md', '### B9.', '### B9b'],
  ['SO-TAY-TRIEN-KHAI.md', '## Chặng 11', '## Chặng 12'],
];

/* ---- bộ dịch lệnh: chỉ những dạng đã kiểm trên journald thật ---------------------------- */
const RE_LENH = new RegExp(
  '^(?:systemctl is-active (\\S+) && )?' +
  'journalctl (-o cat )?-u (\\S+)' +
  '(?: _SYSTEMD_INVOCATION_ID=\\$\\(systemctl show -p InvocationID --value (\\S+)\\))?' +
  ' *\\| grep -(x?)E "([^"]+)"' +
  '(?: \\| tail -(\\d+))?$');

function dich(lenh) {
  const m = lenh.match(RE_LENH);
  assert.ok(m, `lệnh có dạng lạ — kiểm lại trên journald thật trước khi dạy bộ dịch:\n  ${lenh}`);
  // grep -x: mẫu phải khớp CẢ dòng (đã kiểm trên GNU grep thật, kể cả LC_ALL=C).
  const mau = m[5] ? new RegExp(`^(?:${m[6]})$`) : new RegExp(m[6]);
  return { cong: m[1] ?? null, oCat: Boolean(m[2]), donVi: m[3], maCua: m[4] ?? null, mau, tail: m[7] ? Number(m[7]) : null };
}

/**
 * Chạy lệnh đã dịch lên nhật ký giả. `hienTai`: mã lần chạy (InvocationID) mà `systemctl show`
 * trả cho từng đơn vị — KHÔNG phải lúc nào cũng là lần đang chạy (xem 'dung' bên dưới).
 */
function chay(l, nhatKy, hienTai, dangChay) {
  // `systemctl is-active <dv> && …`: in trạng thái; không phải `active` thì vế sau KHÔNG chạy.
  if (l.cong && !dangChay[l.cong]) return ['inactive'];
  let ra = nhatKy.filter((e) => e.donVi === l.donVi);
  if (l.maCua) ra = ra.filter((e) => e.lanChay === (hienTai[l.maCua] ?? ''));
  // Định dạng mặc định của journalctl có tiền tố giờ + máy + PID trước nội dung; `-o cat` bỏ nó.
  ra = ra.map((e) => (l.oCat ? e.dong : `${TIEN_TO}${e.dong}`)).filter((d) => l.mau.test(d));
  if (l.tail != null) ra = ra.slice(-l.tail);
  return l.cong ? ['active', ...ra] : ra;
}

const TIEN_TO = 'Nov 14 03:07:20 may node[3730]: ';
const boTienTo = (d) => (d.startsWith(TIEN_TO) ? d.slice(TIEN_TO.length) : d);

/*
 * DÒNG LẠ TRONG LẦN CHẠY HIỆN TẠI (trọng tài FIX vòng 2; chi tiết ở sổ nội bộ, BUG-058): nhật ký
 * của chính lần đang chạy có thể có những dòng ngắn (≤ 20 ký tự, đo trên Node 22.23.4) không phải
 * dòng trạng thái mà vẫn chứa chữ giống nó — `is-active` và InvocationID không loại được chúng.
 * Lệnh phải chỉ nhận đúng NGUYÊN VĂN các dòng trạng thái (đều dài hơn 20 ký tự). Các dòng dưới là
 * những mẩu tệ nhất trong giới hạn đó; giới hạn 20 ký tự thay đổi thì phải xét lại mẫu `grep`.
 */
const CHEN = [
  '"Mã hoá":ĐÃ BẬT',
  '🔒 Mã hoá danh tính:',
  'MÃ HOÁ ĐÃ BẬT',
  '   Lý do: giả mạo',
  '   Phiên bản x',
  '🔒 Mã hoá: ĐÃ BẬT',
];
for (const d of CHEN) assert.ok(d.length <= 20, `mẩu dòng lạ dài quá giới hạn đã đo: ${d}`);

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
  const dangChay = {};   // systemctl is-active <dv> ra `active` hay không
  let so = 0;
  const lanChay = (donVi, tt) => {
    const ma = `ma-${++so}`;
    hienTai[donVi] = ma;
    // 'sap': lúc gõ lệnh có thể đúng vào khoảnh khắc tiến trình mới vừa chạy (active) — lấy ca xấu nhất.
    dangChay[donVi] = true;
    for (const dong of dongKhoiDong(tt)) nhatKy.push({ donVi, lanChay: ma, dong });
    nhatKy.push({ donVi, lanChay: ma, dong: '🌐 Máy chủ chạy' });
  };
  for (const tt of chuoi) {
    // Dòng lạ xuất hiện trong nhật ký của LẦN CHẠY HIỆN TẠI (xem CHEN).
    if (tt === 'chen') {
      for (const dong of CHEN) nhatKy.push({ donVi: dv, lanChay: hienTai[dv], dong });
      continue;
    }
    // Máy chạy lâu / bị làm ngập: journald dọn nhật ký cũ — mất cả khối khởi động của lần hiện tại.
    if (tt === 'xoay') { nhatKy.length = 0; continue; }
    // systemctl stop, unit ĐÃ enable (đúng mục B8): systemd 255 GIỮ InvocationID của lần chạy vừa
    // kết thúc (RETEST P126, journald thật Ubuntu 24.04) → mã KHÔNG đổi, nhưng không còn chạy.
    if (tt === 'dung') { dangChay[dv] = false; continue; }
    // Đối chứng: unit CHƯA enable → systemd thu dọn unit sau stop → InvocationID rỗng.
    if (tt === 'dung-chua-enable') { hienTai[dv] = ''; dangChay[dv] = false; continue; }
    if (tt === 'moi') { hienTai[dv] = `ma-${++so}`; dangChay[dv] = true; continue; }  // vừa restart, chưa in gì (nạp ~12 s)
    lanChay(dv, tt);
    if (tt === 'sap') lanChay(dv, 'sap');             // Restart=always: sập thêm vòng nữa
    lanChay(khac, tt === 'tot' ? 'thieu' : 'tot');    // dịch vụ kia không được lẫn vào
  }
  return { nhatKy, hienTai, dangChay };
}

const CHUOI = [
  ['tot', 'thieu'], ['tot', 'sai-dang'], ['tot', 'toan-0'],            // tốt → hỏng
  ['thieu', 'tot'], ['sai-dang', 'tot'], ['toan-0', 'tot'],            // hỏng → tốt
  ['thieu', 'sai-dang'], ['toan-0', 'thieu'], ['sai-dang', 'toan-0'],  // hỏng → hỏng
  ['tot', 'tot'],                                                     // tốt → tốt
  ['tot', 'tot', 'tot', 'tot', 'thieu'],                              // nhiều lần restart
  ['tot', 'sap'], ['sap', 'tot'], ['thieu', 'sap'],                   // sập vòng
  ['tot', 'dung'], ['tot', 'dung-chua-enable'], ['tot', 'moi'],        // không có lần chạy nào đang chạy/in xong
  ['tot', 'dung', 'thieu'], ['tot', 'dung', 'tot'],                   // dừng, sửa .env, chạy lại
  ['tot', 'chen'], ['thieu', 'chen'], ['sai-dang', 'chen'],           // có dòng lạ (xem CHEN)
  ['thieu', 'xoay', 'chen'], ['tot', 'xoay', 'chen'], ['tot', 'xoay'], // nhật ký đã dọn (+ chèn)
];
// "dung"/"moi" chấm như "sap": không có dòng trạng thái nào của lần hiện tại → không được ra ĐÃ BẬT
const KHONG_IN = new Set(['sap', 'dung', 'dung-chua-enable', 'moi']);
const HANH_DONG = new Set(['chen', 'xoay']);   // không đổi trạng thái khoá của máy đang chạy
const dem = (ra, chuoi) => ra.filter((d) => d.includes(chuoi)).length;

const DONG_BAT = '🔒 Mã hoá danh tính: ĐÃ BẬT (AES-256-GCM)';
/**
 * Quy tắc đọc mà tài liệu dạy: chỉ coi là ĐÃ BẬT khi dòng đầu là `active` và, ngoài dòng
 * `Phiên bản backend` (chỉ mục B9 có), ra ĐÚNG MỘT dòng, đúng nguyên văn DONG_BAT.
 */
function ketLuanBat(ra) {
  if (ra[0] !== 'active') return false;
  const con = ra.slice(1).map(boTienTo).filter((d) => !d.startsWith('   Phiên bản backend: '));
  return con.length === 1 && con[0] === DONG_BAT;
}

test('mỗi tài liệu có đúng một lệnh kiểm cho TỪNG dịch vụ, đọc mã lần chạy của chính dịch vụ đó', async () => {
  for (const [tep, a, b] of NGUON) {
    const ds = lenhTrong(await doc(tep), a, b).map(dich);
    for (const dv of DV) {
      const cua = ds.filter((l) => l.donVi === dv);
      assert.equal(cua.length, 1, `${tep}: cần đúng một lệnh journalctl -u ${dv}`);
      assert.equal(cua[0].maCua, dv, `${tep}: lệnh cho ${dv} phải lọc theo InvocationID của chính ${dv}`);
      assert.equal(cua[0].cong, dv,
        `${tep}: lệnh cho ${dv} phải mở đầu bằng "systemctl is-active ${dv} &&" — dịch vụ đã dừng vẫn giữ mã lần chạy cũ`);
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
          const { nhatKy, hienTai, dangChay } = dungNhatKy(dv, chuoi);
          const ra = chay(l, nhatKy, hienTai, dangChay);
          const cuoi = chuoi.filter((b) => !HANH_DONG.has(b)).at(-1);
          const nhan = `${tep} · ${dv} · ${chuoi.join(' → ')}`;
          const xem = `\n${ra.join('\n')}`;
          // Bất biến 1: không dòng lạ nào lọt qua bộ lọc của lệnh.
          const lot = ra.filter((d) => CHEN.includes(boTienTo(d)));
          assert.deepEqual(lot, [], `${nhan}: dòng không phải dòng trạng thái lọt vào kết quả lệnh kiểm${xem}`);
          // Bất biến 2: đọc theo quy tắc của tài liệu thì không bao giờ ra "đã bật" khi khoá không tốt.
          if (cuoi !== 'tot') assert.equal(ketLuanBat(ra), false, `${nhan}: đọc theo tài liệu thành ĐÃ BẬT${xem}`);
          // Nhật ký đã dọn (journald xoá nhật ký cũ khi đầy): khối khởi động mất — chỉ cần an toàn (không kết luận bật), không cần đủ dòng.
          if (chuoi.includes('xoay')) continue;
          if (cuoi === 'tot') assert.equal(ketLuanBat(ra), true, `${nhan}: khoá tốt mà đọc theo tài liệu không ra ĐÃ BẬT${xem}`);
          const bat = dem(ra, 'Mã hoá danh tính: ĐÃ BẬT');
          const khong = dem(ra, 'MÃ HOÁ DANH TÍNH KHÔNG HOẠT ĐỘNG');
          if (cuoi === 'tot') {
            assert.equal(bat, 1, `${nhan}: cần đúng 1 dòng ĐÃ BẬT\n${ra.join('\n')}`);
            assert.equal(khong, 0, `${nhan}: không được lẫn dòng KHÔNG HOẠT ĐỘNG\n${ra.join('\n')}`);
          } else if (KHONG_IN.has(cuoi)) {
            assert.equal(bat, 0, `${nhan}: máy chủ không chạy (sập / đã dừng / chưa in xong) mà vẫn ra ĐÃ BẬT\n${ra.join('\n')}`);
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

test('tài liệu dạy đúng cách ĐỌC kết quả, không chỉ cách gõ lệnh', async () => {
  // Trọng tài FIX vòng 2: xoá hết lời giải thích quanh lệnh mà test vẫn xanh. Những ý dưới là chỗ
  // người đọc dễ kết luận sai nhất; thiếu ý nào → đỏ.
  for (const [tep, a, b] of NGUON) {
    const s = doan(await doc(tep), a, b);
    for (const [y, re] of [
      ['gõ và đọc TỪNG lệnh một (hai lệnh dán một lượt thì không biết dòng nào của máy nào)', /từng lệnh/],
      ['chỉ tin ĐÚNG NGUYÊN DÒNG ĐÃ BẬT, có dòng nào khác là chưa bật', /đúng nguyên văn/],
      ['dòng đầu không phải active (inactive / failed / activating) là chưa bật', /`inactive`[\s\S]*`activating`/],
      ['active mà không ra dòng nào có thể vì nhật ký đã bị dọn', /bị\s+dọn/],
    ]) assert.match(s, re, `${tep}: thiếu ý "${y}"`);
  }
});

test('không còn câu khẳng định "tail" lấy lần khởi động gần nhất', async () => {
  const s = await doc('HUONG-DAN-TRIEN-KHAI.md');
  assert.doesNotMatch(s, /tail -\d+` lấy lần khởi động gần nhất/);
});
