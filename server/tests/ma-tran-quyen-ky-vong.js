/**
 * BẢNG KỲ VỌNG CỦA MA TRẬN QUYỀN (tests/ma-tran-quyen.test.js) — KHÔNG phải tệp test.
 *
 * Mỗi route mà BẤT KỲ điểm khởi động nào gắn đều phải có MỘT dòng ở đây. Route mới chưa khai
 * -> test đỏ, kể cả khi gắn ở tiền tố lạ ngoài /api/admin, /api/auth. Người thêm route phải
 * tự trả lời hai câu: ai được gọi, và máy chủ nào được gắn.
 *
 * ⚠️ Bảng ghi CHÍNH SÁCH ĐANG CHẠY (đọc từ mã lúc lập bảng, S1.0), là lưới chống THỤT LÙI,
 * không phải lời xác nhận chính sách đó đúng. Muốn đổi quyền một route: sửa mã + sửa dòng ở đây
 * trong CÙNG commit, thân commit nói vì sao. Thấy dòng nào đáng ngờ -> mở BUG, đừng sửa bảng
 * cho xanh.
 *
 * quyen:
 *   'can-bo'   mọi cán bộ đăng nhập hợp lệ (admin, manager, handler); vé khác -> 401
 *   'lanh-dao' chỉ admin, manager (lib/vai-tro.js LANH_DAO); handler -> 403; vé khác -> 401
 *   'mo'       route cán bộ KHÔNG đòi vé (đăng nhập, làm mới, đăng xuất): kết quả phải như
 *              nhau với MỌI loại vé — vé không được mở thêm gì
 *   'cong-dan' route công dân: S1.0 chỉ kiểm có khai và gắn đúng máy chủ (ma trận vé công dân
 *              là phạm vi khác)
 * may: các điểm khởi động ĐƯỢC gắn route này — 'gop' (index.js), 'can-bo', 'cong-khai'.
 */
const CB = ['gop', 'can-bo'];
const CD = ['gop', 'cong-khai'];
const BA = ['gop', 'can-bo', 'cong-khai'];

const canBo = { quyen: 'can-bo', may: CB };
const lanhDao = { quyen: 'lanh-dao', may: CB };
const congDan = { quyen: 'cong-dan', may: CD };

export const KY_VONG = Object.freeze({
  /* ---------- /api/auth ---------- */
  'POST /api/auth/login': { quyen: 'mo', may: CB },
  'POST /api/auth/refresh': { quyen: 'mo', may: CB },
  'POST /api/auth/logout': { quyen: 'mo', may: CB },
  'GET /api/auth/me': canBo,

  /* ---------- /api/admin/submissions ---------- */
  'POST /api/admin/submissions/:id/sang-loc': canBo,
  'POST /api/admin/submissions/sang-loc-hang-loat': canBo,
  'GET /api/admin/submissions/tin-trung': canBo,
  'POST /api/admin/submissions/:id/ngoai-tham-quyen': lanhDao,
  'GET /api/admin/submissions/ngoai-tham-quyen/xuat': lanhDao,
  'POST /api/admin/submissions/:id/ghi-chu': canBo,
  'GET /api/admin/submissions/:id/trich-chu': canBo,
  'POST /api/admin/submissions/:id/trich-chu': canBo,
  'POST /api/admin/submissions/:id/tep-sau-xoa-danh-tinh': lanhDao,
  'DELETE /api/admin/submissions/:id/tep/:tepId': lanhDao,
  'GET /api/admin/submissions': canBo,
  'GET /api/admin/submissions/:id': canBo,
  'POST /api/admin/submissions/:id/reveal': lanhDao,
  'PATCH /api/admin/submissions/:id/status': canBo,
  'PATCH /api/admin/submissions/:id/assign': lanhDao,
  'POST /api/admin/submissions/:id/review': canBo,
  'POST /api/admin/submissions/:id/mark-spam': canBo,
  'POST /api/admin/submissions/:id/to-giac-mat': canBo,
  'DELETE /api/admin/submissions/:id/to-giac-mat': lanhDao,

  /* ---------- các mục khác của /api/admin ---------- */
  'GET /api/admin/dashboard/stats': canBo,
  'GET /api/admin/dashboard/canh-bao-dot-bien': canBo,
  'POST /api/admin/su-kien-man-hinh': canBo,
  'GET /api/admin/banned-words': lanhDao,
  'POST /api/admin/banned-words': lanhDao,
  'DELETE /api/admin/banned-words/:id': lanhDao,
  'GET /api/admin/staff': canBo,
  'GET /api/admin/reports/map': canBo,
  'GET /api/admin/reports/summary': lanhDao,
  'GET /api/admin/reports/details': lanhDao,
  'GET /api/admin/logs/danh-muc': lanhDao,
  'GET /api/admin/logs': lanhDao,
  'GET /api/admin/logs/thong-ke': lanhDao,
  'GET /api/admin/logs/xuat': lanhDao,
  'GET /api/admin/logs/canh-bao': lanhDao,
  'POST /api/admin/kiosk/submit': canBo,
  'GET /api/admin/trash': canBo,
  'POST /api/admin/trash/:id/restore': canBo,
  'DELETE /api/admin/trash/:id': lanhDao, // chặn trong thân route (laLanhDao), không qua authorize()
  'DELETE /api/admin/trash': lanhDao, // như trên
  'GET /api/admin/chat/:id/messages': canBo,
  'POST /api/admin/chat/:id/messages': canBo,
  'GET /api/admin/chat/blacklist': canBo,
  'DELETE /api/admin/chat/blacklist/:id': lanhDao,
  'GET /api/admin/chat/trusted-devices': lanhDao,
  'POST /api/admin/chat/trusted-devices': lanhDao,
  'DELETE /api/admin/chat/trusted-devices/:id': lanhDao,
  'GET /api/admin/chat/khieu-nai': canBo,
  'POST /api/admin/chat/khieu-nai/:id/xu-ly': lanhDao,
  'GET /api/admin/qr-points': canBo,
  'POST /api/admin/qr-points': lanhDao,
  'PATCH /api/admin/qr-points/:id': lanhDao,
  'DELETE /api/admin/qr-points/:id': lanhDao,
  'GET /api/admin/news': canBo,
  'GET /api/admin/news/:id': canBo,
  'POST /api/admin/news': lanhDao,
  'PUT /api/admin/news/:id': lanhDao,
  'PATCH /api/admin/news/:id/hien': lanhDao,
  'GET /api/admin/diem-den': canBo,
  'POST /api/admin/diem-den': lanhDao,
  'PUT /api/admin/diem-den/:id': lanhDao,
  'PATCH /api/admin/diem-den/:id/hien': lanhDao,
  'PATCH /api/admin/diem-den/:id/ngap': canBo,
  'GET /api/admin/diem-den/du-bao-mua': canBo,
  'PUT /api/admin/diem-den/:id/nguong-mua': lanhDao,
  'GET /api/admin/incident-groups': canBo,
  'GET /api/admin/incident-groups/:id': canBo,
  'POST /api/admin/incident-groups/:id/ack': canBo,

  /* ---------- ngoài phần cán bộ ---------- */
  'GET /api/health': { quyen: 'cong-dan', may: BA },
  'GET /api/health/schema': { quyen: 'cong-dan', may: ['gop'] }, // BUG-050
  'POST /api/cong-vao/xac-minh': { quyen: 'cong-dan', may: BA },
  'GET /api/tracking/:code': congDan,
  'POST /api/tracking/:code/request-deletion': congDan,
  'POST /api/chat/open': congDan,
  'GET /api/chat/messages': congDan,
  'POST /api/chat/messages': congDan,
  'POST /api/chat/bo-sung': congDan,
  'GET /api/news': congDan,
  'POST /api/news/:id/xem': congDan,
  'GET /api/ban-do': congDan,
  'GET /api/khieu-nai/trang-thai': congDan,
  'POST /api/khieu-nai': congDan,
  'POST /api/thong-ke/ghi-nhan': congDan,
  'GET /api/thong-ke': congDan,
  'GET /api/diem-den': congDan,
  'GET /api/diem-den/du-bao-mua': congDan,
  'GET /api/tts': congDan,
  'POST /api/otp/send': congDan,
  'POST /api/otp/verify': congDan,
  'POST /api/otp/anon-code': congDan,
  'POST /api/otp/anon-verify': congDan,
  'GET /api/xac-minh-sdt/trang-thai': congDan,
  'POST /api/xac-minh-sdt/gui-ma': congDan,
  'POST /api/xac-minh-sdt/xac-nhan': congDan,
  'GET /api/submissions/wards': congDan,
  'GET /api/submissions/qr-points/:code': congDan,
  'GET /api/submissions/phieu-mo-form': congDan,
  'POST /api/submissions': congDan,
  'POST /api/submissions/kiem-tra-khoa': congDan,
  'GET /api/ai/status': congDan,
  'POST /api/ai/chat': congDan,
  'POST /api/ai/analyze': congDan,
  'POST /api/ai/moderate-image': congDan,
});

/* LỚP `use()` KHÔNG PHẢI ROUTER, ĐÚNG THỨ TỰ, của từng điểm khởi động ("USE <đường gắn> <tên hàm>").
   Middleware, hàm xử lý gắn thẳng và ứng dụng Express con trả lời được yêu cầu mà KHÔNG hiện
   thành route — trọng tài S1.0 đã chứng minh `router.use('/x', (q, r) => r.json(...))` đặt trước
   requireAuth lọt lưới. So cả thứ tự: chèn một lớp TRƯỚC requireAuth cũng làm đỏ.
   Thêm middleware hợp lệ -> thêm dòng ở đây, cùng commit. */
const DAU_CHUNG = [
  'USE / query', 'USE / expressInit', 'USE / helmetMiddleware',
  'USE / <an-danh>', // Permissions-Policy
  'USE / corsMiddleware', 'USE / jsonParser',
  'USE / <an-danh>', // báo lỗi 413 dễ hiểu
  'USE / cookieParser',
  'USE / <an-danh>', 'USE / <an-danh>', // gioiHanChung(): XEM + GỬI
];
const LOP_ADMIN = [
  'USE /api/admin requireAuth', // routes/admin/index.js — tuyến chặn chính
  'USE /api/admin/submissions requireAuth',
  'USE /api/admin/dashboard requireAuth',
  'USE /api/admin/banned-words requireAuth',
  'USE /api/admin/banned-words <an-danh>', // authorize(LANH_DAO)
  'USE /api/admin/reports <an-danh>', // authorize(LANH_DAO), sau route /map
  'USE /api/admin/logs requireAuth',
  'USE /api/admin/logs <an-danh>', // authorize(LANH_DAO)
  'USE /api/admin/kiosk requireAuth',
  'USE /api/admin/trash requireAuth',
  'USE /api/admin/chat requireAuth',
  'USE /api/admin/qr-points requireAuth',
  'USE /api/admin/incident-groups requireAuth',
];
const DUOI = ['USE / <an-danh>', 'USE / errorHandler']; // 404 chung + xử lý lỗi

export const LOP_GIUA = Object.freeze({
  gop: [
    ...DAU_CHUNG,
    'USE /api/auth <an-danh>', 'USE /api/admin <an-danh>', // chanTheoIpPhanCanBo (ND-086)
    'USE /api/ai <an-danh>',
    ...LOP_ADMIN,
    ...DUOI,
  ],
  'can-bo': [
    ...DAU_CHUNG,
    'USE / <an-danh>', // chanTheoIp — mọi route của máy chủ cán bộ
    ...LOP_ADMIN,
    ...DUOI,
  ],
  'cong-khai': [...DAU_CHUNG, 'USE /api/ai <an-danh>', ...DUOI],
});

const PHAN_CAN_BO = /^\/api\/(admin|auth)(\/|$)/i;
const QUYEN_PHAN_CAN_BO = ['can-bo', 'lanh-dao', 'mo'];

/** So danh sách route chạy thật của MỘT điểm khởi động với bảng.
 *  @returns {{ chuaKhai: string[], gacSaiMay: string[], thieu: string[], nhanSai: string[] }} */
export function doiChieu(tenMay, routes, kyVong = KY_VONG) {
  const thucTe = new Set(routes.map((r) => `${r.method} ${r.path}`));
  const chuaKhai = [];
  const gacSaiMay = [];
  for (const k of thucTe) {
    if (!kyVong[k]) chuaKhai.push(k);
    else if (!kyVong[k].may.includes(tenMay)) gacSaiMay.push(k);
  }
  const thieu = Object.keys(kyVong).filter((k) => kyVong[k].may.includes(tenMay) && !thucTe.has(k));
  /* Route phần cán bộ không được khai 'cong-dan' — nhãn đó làm route không bao giờ bị gọi thử. */
  const nhanSai = Object.keys(kyVong).filter((k) => PHAN_CAN_BO.test(k.split(' ')[1]) && !QUYEN_PHAN_CAN_BO.includes(kyVong[k].quyen));
  return { chuaKhai, gacSaiMay, thieu, nhanSai };
}
