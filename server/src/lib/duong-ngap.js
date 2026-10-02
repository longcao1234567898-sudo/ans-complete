/**
 * ĐƯỜNG HAY NGẬP — trạng thái "đang ngập" do CÁN BỘ xác nhận (P50, nang_cap_v31.sql)
 * ============================================================================
 *
 * Vì sao không tự động lấy từ Google Maps: Google không có dịch vụ trả "đường
 * nào đang ngập" cho web khác lấy; dịch vụ dự báo lũ của họ chỉ theo trạm đo
 * sông, không theo từng tuyến phố. Báo sai trên trang của công an là người dân
 * lao vào đường ngập hoặc né nhầm đường — nên trạng thái do người thật xác nhận.
 *
 * ⚠️ "ĐANG NGẬP" TỰ HẾT HẠN. Máy chủ chỉ coi là đang ngập khi lần xác nhận cuối
 *    còn trong HAN_XAC_NHAN_GIO giờ. Quên bấm "Hết ngập" thì trang tự thôi báo
 *    sau chừng đó giờ, không treo báo cũ mãi. Đánh đổi đã chấp nhận: trời mưa
 *    kéo dài mà không ai bấm lại thì trang hết báo sau 12 giờ dù đường vẫn ngập —
 *    thiếu báo còn an toàn hơn báo cũ, vì người dân vốn đã được nhắc "hay ngập
 *    khi mưa lớn" ở từng tuyến. Cán bộ bấm lại "Đang ngập" là kéo dài thêm.
 */

/** Số giờ một lần xác nhận "đang ngập" còn hiệu lực */
export const HAN_XAC_NHAN_GIO = 12;

/** Giá trị cột `loai` được phép (allow-list, luật 5). Khác hai giá trị này = tai_nan. */
export const LOAI_HOP_LE = ['tai_nan', 'ngap'];

export const chuanLoai = (v) => (LOAI_HOP_LE.includes(v) ? v : 'tai_nan');

/** Biểu thức SQL "đang ngập" cho bảng traffic_hotspots đặt bí danh `h` */
export const DANG_NGAP_SQL = `(h.loai = 'ngap' AND h.ngap_xac_nhan_luc IS NOT NULL
  AND h.ngap_xac_nhan_luc > NOW() - INTERVAL ${HAN_XAC_NHAN_GIO} HOUR)`;

/** Lỗi MySQL "cột không có" — CSDL chưa chạy nang_cap_v31.sql */
export const thieuCotNgap = (err) => err?.code === 'ER_BAD_FIELD_ERROR' || /no such column|Unknown column/i.test(String(err?.message));
