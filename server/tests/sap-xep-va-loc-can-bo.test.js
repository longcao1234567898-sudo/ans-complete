/**
 * KHOÁ LẠI Ô SẮP XẾP VÀ Ô LỌC CÁN BỘ TRÊN DANH SÁCH Ý KIẾN
 *
 * Ô sắp xếp từng "có mà không chạy" suốt một thời gian: máy chủ nhận đủ tham
 * số, giao diện có ô chọn, nhưng lời gọi API lại quên kèm `sort` — nên đổi ô
 * xong thứ tự vẫn y nguyên. Kiểu hỏng này không lộ ra ở bất kỳ test nào chỉ
 * kiểm phía máy chủ, vì phía máy chủ không sai gì cả.
 *
 * Nên các test dưới đây đọc THẲNG mã nguồn hai phía và soi chỗ nối giữa chúng.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const ROUTE = '../src/routes/admin/submissions.js';
const TRANG = '../../src/pages/admin/AdminSubmissionsPage.tsx';
const DICH_VU = '../../src/services/adminService.ts';

describe('S1 — lời gọi API phải kèm tham số sort', () => {
  /* Lỗi gốc: `sort` nằm trong queryKey của react-query nhưng không nằm trong
     đối tượng truyền cho fetchSubmissions. Đổi ô chọn thì react-query nạp lại
     thật, chỉ là nạp lại đúng câu truy vấn cũ — nhìn hệt như máy chủ phớt lờ. */

  test('AdminSubmissionsPage truyền sort vào fetchSubmissions', async () => {
    const ma = await doc(TRANG);
    const goi = ma.slice(ma.indexOf('fetchSubmissions({'), ma.indexOf('placeholderData'));
    assert.match(goi, /\bsort\b\s*,/, 'thiếu `sort` trong lời gọi fetchSubmissions');
  });

  test('fetchSubmissions khai báo và chuyển tiếp sort', async () => {
    const ma = await doc(DICH_VU);
    assert.match(ma, /sort\?:\s*string/, 'fetchSubmissions không nhận tham số sort');
  });

  test('mọi kiểu sắp xếp giao diện đưa ra đều có trong bảng của máy chủ', async () => {
    const trang = await doc(TRANG);
    const route = await doc(ROUTE);

    /* Cắt đúng phạm vi ô SẮP XẾP. Ngay dưới nó là ô lọc CÁN BỘ cũng có thẻ
       option (me/none) — đọc lẫn sang đó thì test đòi máy chủ phải có kiểu sắp
       xếp tên là "me", vô lý. */
    const batDau = trang.indexOf('value={sort}');
    const oChon = trang.slice(batDau, trang.indexOf('</select>', batDau));
    const cacGiaTri = [...oChon.matchAll(/<option value="([a-z_]+)"/g)].map((m) => m[1]);

    assert.ok(cacGiaTri.length >= 5, 'không đọc được danh sách kiểu sắp xếp trên giao diện');
    for (const gt of cacGiaTri) {
      assert.match(
        route,
        new RegExp(`\\b${gt}\\s*:`),
        `giao diện cho chọn "${gt}" nhưng máy chủ không có kiểu này -> lặng lẽ rơi về mặc định`
      );
    }
  });
});

describe('S2 — tra bảng sắp xếp không đi vòng qua prototype', () => {
  /* ?sort=constructor tra thẳng CACH_SAP_XEP[khoa] sẽ trả về hàm Object, là
     giá trị truthy nên lọt qua phép `||`, rồi bị nhét nguyên văn vào chuỗi SQL.
     Câu lệnh hỏng, máy chủ trả 500 — mà ai gõ thanh địa chỉ cũng tạo được. */

  test('dùng Object.hasOwn thay vì tra khoá trực tiếp', async () => {
    const ma = await doc(ROUTE);
    assert.match(ma, /Object\.hasOwn\(CACH_SAP_XEP/, 'thiếu chốt chặn khoá prototype');
  });

  test('mô phỏng: khoá prototype phải rơi về mặc định', () => {
    const bang = { mac_dinh: 'ORDER BY a', moi_nhat: 'ORDER BY b' };
    const tra = (khoa) => (Object.hasOwn(bang, khoa) ? bang[khoa] : bang.mac_dinh);

    assert.equal(tra('moi_nhat'), 'ORDER BY b');
    assert.equal(tra('constructor'), bang.mac_dinh);
    assert.equal(tra('toString'), bang.mac_dinh);
    assert.equal(tra('__proto__'), bang.mac_dinh);
    assert.equal(tra('linh tinh'), bang.mac_dinh);
  });

  test('bảng sắp xếp không khai trùng khoá', async () => {
    const ma = await doc(ROUTE);
    const khoi = ma.slice(ma.indexOf('const CACH_SAP_XEP'), ma.indexOf('const khoaSapXep'));
    const khoa = [...khoi.matchAll(/^\s{4}([a-z_]+):\s*`/gm)].map((m) => m[1]);
    assert.equal(
      khoa.length,
      new Set(khoa).size,
      `khoá bị khai hai lần: ${khoa.filter((k, i) => khoa.indexOf(k) !== i).join(', ')}`
    );
  });
});

describe('S3 — lọc theo cán bộ nhận cả mã số, không chỉ me/none', () => {
  /* Ô chọn tên cán bộ gửi lên mã số. Máy chủ cũ chỉ hiểu 'me' và 'none' nên
     chọn tên ai cũng ra nguyên danh sách — bộ lọc coi như không tồn tại. */

  test('route xử lý nhánh mã số cán bộ', async () => {
    const ma = await doc(ROUTE);
    assert.match(ma, /\/\^\[0-9\]\{1,10\}\$\/\.test\(canBo\)/, 'thiếu nhánh lọc theo mã cán bộ');
  });

  test('mô phỏng: ba dạng giá trị loại trừ nhau', () => {
    const nhanh = (canBo) => {
      if (canBo === 'me') return 'toi';
      if (canBo === 'none') return 'chua_phan_cong';
      if (/^[0-9]{1,10}$/.test(canBo)) return 'ma_so';
      return 'bo_qua';
    };

    assert.equal(nhanh('me'), 'toi');
    assert.equal(nhanh('none'), 'chua_phan_cong');
    assert.equal(nhanh('7'), 'ma_so');
    assert.equal(nhanh(''), 'bo_qua');
    assert.equal(nhanh('7 OR 1=1'), 'bo_qua', 'chuỗi rác phải bị bỏ qua, không ép kiểu thầm lặng');
    assert.equal(nhanh('12345678901'), 'bo_qua', 'quá 10 chữ số -> không phải mã cán bộ hợp lệ');
  });

  test('giao diện lấy danh sách cán bộ từ fetchStaffList', async () => {
    const trang = await doc(TRANG);
    assert.match(trang, /fetchStaffList/, 'ô lọc không lấy danh sách cán bộ');
    assert.match(trang, /value=\{assigned\}/, 'thiếu ô chọn cán bộ nối vào state assigned');
  });
});

describe('S4 — thẻ "Tất cả" phải thật sự là tất cả', () => {
  /* Thẻ mang nhãn "Tất cả" nhưng gửi status rỗng, mà máy chủ hiểu rỗng là chỉ
     việc chưa xong. Đơn vị có 70 ý kiến, mở ra đếm được vài chục rồi tưởng mất
     dữ liệu — đúng kiểu hoang mang mà cả trang này đang cố tránh. */

  test('có thẻ gửi status=all', async () => {
    const trang = await doc(TRANG);
    const khoi = trang.slice(trang.indexOf('const STATUS_TABS'), trang.indexOf('export default'));
    assert.match(khoi, /value:\s*'all'/, 'thiếu thẻ xem toàn bộ hồ sơ');
  });

  test('máy chủ hiểu status=all là bỏ mọi giới hạn trạng thái trừ tin rác', async () => {
    const ma = await doc(ROUTE);
    assert.match(ma, /status === 'all'/);
  });

  test('không còn dải chữ khẳng định danh sách đang ẩn việc quá hạn', async () => {
    const trang = await doc(TRANG);
    assert.doesNotMatch(
      trang,
      /không hiện việc đã quá hạn<\/b>/,
      'dải báo cũ nói sai về danh sách sau bản vá 64 việc bị giấu'
    );
  });
});
