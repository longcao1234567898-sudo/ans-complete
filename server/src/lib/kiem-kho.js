/**
 * HỎI KHO DỮ LIỆU CÒN SỐNG KHÔNG — cho /api/health (ND-084)
 *
 * Trước đây health luôn "ok":true kể cả khi kho đã chết: công cụ theo dõi im lặng,
 * giao diện không đưa người dân sang trang dự phòng có số 113.
 *
 * ĐÁNH ĐỔI ĐÃ CHẤP NHẬN:
 *   · Health là đường CÔNG KHAI: mỗi lần gọi mà hỏi kho thì ai cũng dồn tải được lên
 *     kho. Nên nhớ kết quả NHO_MS, và mọi lời gọi chồng nhau dùng chung một lần hỏi.
 *   · Có hạn chờ: kho treo không được làm treo health (Render và kiemTraMayChu đợi
 *     health trả lời để quyết máy chủ sống hay không).
 *   · Chỉ trả đúng/sai, không trả lời lỗi của kho (tên máy, cổng, tài khoản).
 */
const NHO_MS = 5000;
const HAN_CHO_MS = 1500;

export function taoKiemKho(pool, { nhoMs = NHO_MS, hanChoMs = HAN_CHO_MS } = {}) {
  let ketQua = null;
  let luc = 0;
  let dangHoi = null;
  return function kiemKho() {
    if (ketQua !== null && Date.now() - luc < nhoMs) return Promise.resolve(ketQua);
    if (dangHoi) return dangHoi;
    let hen;
    const het = new Promise((ok) => { hen = setTimeout(() => ok(false), hanChoMs); });
    dangHoi = Promise.race([pool.query('SELECT 1').then(() => true, () => false), het])
      .then((v) => { clearTimeout(hen); ketQua = v; luc = Date.now(); dangHoi = null; return v; });
    return dangHoi;
  };
}
