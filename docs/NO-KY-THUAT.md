# Sổ nợ kỹ thuật

Nơi ghi những thứ **biết là chưa ổn nhưng cố ý chưa sửa**. Đây là chỗ trả giá cho luật
"không sửa ngoài phạm vi phiên" — không ghi lại thì luật đó thành ra chỉ là bỏ qua vấn đề.

> ⚠️ **File này công khai trên GitHub.** Nợ kỹ thuật thuộc dạng **lỗ hổng bảo mật** không
> ghi ở đây — mở `buglogs/bugs/BUG-xxx.md` (nội bộ) và chỉ nhắc mã ở đây nếu cần.

**Quy tắc ghi:** mỗi món phải có **ngày xem xét lại**. Nợ không có ngày là nợ sẽ bị quên.

---

## Đang mở

| # | Món nợ | Vị trí | Ảnh hưởng | Vì sao chưa sửa | Ngày ghi | Xem xét lại |
|---|---|---|---|---|---|---|
| ND-003 | **12 lỗ hổng dependency** đã xác nhận bằng `npm audit` ngày 2026-09-10: frontend 7 (`xlsx` **không có bản vá**, `postcss`/`nanoid`/`browserslist` high, `esbuild`/`react-router`/`baseline-browser-mapping` moderate) · backend 5 (`nodemailer` high, `mysql2`/`qs` moderate) | `package.json`, `server/package.json` | `nodemailer` dùng ở luồng gửi OTP; `xlsx` ở luồng xuất Excel; `qs` là DoS qua tham số | Nâng phiên bản phải kiểm hồi quy; `xlsx` chưa có đường vá sẵn. Cần triage đúng bài ở phiên P09 | 2026-09-10 | **P09 — GĐ2 nhóm 7 (D6)** |
| ND-004 | **`react-is@^19.2.7` lệch major** so với `react@^18.3.1` | `package.json` | Chưa rõ — có thể là phụ thuộc gián tiếp bị nâng nhầm | Chưa xác định vì sao có mặt | 2026-09-10 | GĐ2 nhóm 7 (D6) |
| ND-005 | **Stored procedure `check_spam` là code chết** — backend không gọi tới, và so sánh SĐT chữ thường với cột đã mã hoá nên không bao giờ khớp | `database/hop_thu_an_ninh_so.sql` | Gây hiểu nhầm cho người đọc schema | Đã ghi trong README từ trước, chưa ai dọn | 2026-09-10 | Khi gộp migration (ND-006) |
| ND-006 | **Migration rời rạc**: `nang_cap_v6` … `v17` phải chạy 12 lệnh liên tiếp sau `TRON_BO_DATABASE_V5.sql` | `database/` | Người cài mới dễ chạy thiếu, chạy sai thứ tự | Chờ schema ổn định mới gộp thành bản "trọn bộ" mới | 2026-09-10 | Sau khi xong đợt audit |
| ND-007 | **Frontend không có test tự động** — chỉ có kiểm kiểu qua `tsc` | `src/` (16.8k dòng) | Sửa frontend không có lưới an toàn; hồi quy chỉ phát hiện bằng mắt | Chưa chọn công cụ (Vitest / Playwright) | 2026-09-10 | Sau khi xong đợt audit |
| ND-008 | **Ảnh bằng chứng lưu base64 thẳng vào MySQL** ở nhánh fallback khi chưa cấu hình Cloudinary | `server/src/lib/anh-an-toan.js` | Bảng phình nhanh, bản sao lưu nặng, truy vấn chậm khi nhiều đơn | Là nhánh dự phòng, chưa phải đường chính | 2026-09-10 | GĐ2 nhóm 8 (D6) |
| ND-009 | **Rate limit lưu trong RAM từng instance** (`express-rate-limit` store mặc định) | `server/src/index.js:89` và các route | Chạy 2 instance = hạn mức nhân đôi; cản scale ngang | Hiện chạy một instance nên chưa lộ | 2026-09-10 | GĐ2 nhóm 5+8 (D5–D6) |
| ND-010 | **Ba biến thể khởi động backend** (`index.js`, `may-chu-cong-khai.js`, `may-chu-can-bo.js` + `nen-tang.js`) dễ lệch cấu hình bảo mật | `server/src/` | Lớp bảo vệ thêm ở một file có thể thiếu ở hai file kia | Tách ra có chủ đích để bàn giao nội bộ | 2026-09-10 | GĐ2 nhóm 5 (D5) |
| ND-012 | **`BACKEND_VERSION` lệch giữa hai bản chép**: `index.js` ghi `v8-2026-07`, `nen-tang.js` ghi `v9-2026-08` | `server/src/index.js:95`, `server/src/nen-tang.js:27` | `/api/health` trả số phiên bản khác nhau tuỳ biến thể đang chạy — mà công dụng của biến này (theo chú thích trong code) đúng là để biết đã deploy bản mới chưa. Số sai thì mất tác dụng | Phát hiện khi kiểm kê ở P01, sửa là đụng code — ngoài phạm vi phiên `KHAO-SAT`. Bằng chứng cụ thể cho ND-010: hai bản chép song song đã bắt đầu trôi khỏi nhau | 2026-09-10 | Cùng lúc với ND-010 — GĐ2 nhóm 5 (D5) |
| ND-013 | **`server/src/lib/otp.js` là mã chết và đã trôi khỏi bản đang chạy** — không tệp nào import nó (`routes/otp.js` tự khai hằng số và hàm riêng). Hai bản lệch nhau: TTL 5 phút vs 10 phút, sinh mã `randomInt(0, 1e6)` vs `randomInt(1e5, 1e6)`, băm SHA-256 vs bcrypt | `server/src/lib/otp.js` | Không ảnh hưởng lúc chạy (mã chết thì không chạy). Ảnh hưởng là **gây hiểu nhầm cho người đọc**: bảng §2.2 của `01-GIAI-DOAN-1-KIEM-KE.md` đã từng dẫn nguồn giới hạn OTP về đúng bản chết này | Phát hiện khi kiểm kê ở P02; xoá là đụng code — ngoài phạm vi phiên `KHAO-SAT`. Cùng họ với ND-005 (thủ tục chết) và ND-012 (hai bản chép trôi khỏi nhau) | 2026-09-10 | **P03 đã xem xét (2026-09-10): xác nhận đúng là mã chết** — rà mục 1.10 đọc `routes/otp.js` và không thấy đường nào dẫn tới `lib/otp.js`. Không nâng thành lỗ hổng. Còn lại là việc **dọn**: xoá tệp, gộp cùng ND-014 trong một phiên `FIX`/dọn dẹp sau đợt audit |
| ND-014 | **Tàn dư của cơ chế khoá tài khoản đã bỏ**: cột `locked_until` vẫn được `SELECT` trong truy vấn đăng nhập rồi không dùng tới | `server/src/routes/auth.js:101` | Không ảnh hưởng lúc chạy. Ảnh hưởng là **gây hiểu nhầm**: người đọc code tưởng hệ thống có khoá tài khoản, trong khi dự án **cố ý không khoá** (lý do ở `auth.js:57-70`, khoá lại bằng test G5). Cùng họ với ND-005 và ND-013 | Phát hiện khi rà nhóm 1 ở P03; xoá là đụng code — ngoài phạm vi phiên `RA-SOAT`. Nên dọn cùng lượt với ND-013 để không mở hai lần | 2026-09-10 | Cùng lúc với ND-013 |
| ND-015 | **`otplib@^13.4.1` cài mà không dùng** — không tệp nào trong `server/src` import nó. Hệ thống **chưa có MFA** cho bất kỳ vai trò nào, kể cả `admin` | `server/package.json:27` | Hai mặt: (1) dependency thừa, làm phồng bề mặt tấn công và nhiễu khi triage `npm audit`; (2) tài khoản có quyền xem danh tính người tố giác hiện chỉ được chặn bằng **một lớp mật khẩu** | Phát hiện khi rà mục 1.3 ở P03. Không mở BUG vì đây là **thiếu tính năng**, không phải lỗ hổng khai thác được — nhưng cần một quyết định có chủ ý (bật MFA hay gỡ thư viện), không nên để lửng lơ | 2026-09-10 | **P10** — chốt Bug Log, lập SEC-DEC cho quyết định MFA |
| ND-016 | **Không có đường đổi mật khẩu cán bộ trong ứng dụng** — `routes/admin/staff.js` chỉ có `GET /`; không route nào chạm `password_hash`. Đổi mật khẩu chỉ làm được bằng script CLI trên máy chủ | `server/src/routes/admin/staff.js` | Cán bộ nghi mật khẩu bị lộ không tự xử lý được, phải nhờ người có quyền vào máy chủ. Xác nhận điểm nghi số 2 của P02 | Phát hiện ở P02, xác nhận ở P03 (mục kiểm 1.7). Thêm tính năng là việc của phiên `TINH-NANG`, không phải phiên rà soát | 2026-09-10 | Sau khi xong đợt audit — và **khi làm phải thu hồi phiên cũ cùng lúc**, nếu không sẽ đẻ ra lỗ hổng mới |
| ND-017 | **`buglogs/` không có git repo lồng bên trong** như `buglogs/README.md` và [QUY-TRINH-LAM-VIEC.md](QUY-TRINH-LAM-VIEC.md) §9 đều mô tả. Kiểm ngày 2026-09-23: không có | `buglogs/` | Bug Log không có lịch sử phiên bản. Sửa nhầm một dòng là mất, không lùi được — với một tệp đang là nguồn sự thật duy nhất cho các lỗ hổng chưa vá thì đó là rủi ro thật | Phát hiện ở P04 khi hợp nhất nhánh; ngoài phạm vi phiên `TAI-LIEU` đang chạy. Việc gọn, một lệnh `git init` | 2026-09-23 | **Ngay đầu phiên P05** — trước khi phiên retest đầu tiên ghi vào Bug Log |
| ND-018 | **Bộ đệm trạng thái tài khoản 30 giây nằm trong RAM từng instance** (`Map` trong `server/src/middleware/auth.js`) | `server/src/middleware/auth.js` | Cùng họ ND-009. Chạy nhiều instance thì xoá đệm ở instance này không ảnh hưởng instance kia. Hiện chạy một instance nên chưa lộ — giống hệt lý do ND-009 chưa lộ | Đến từ nhánh tính năng qua commit `22a588d`, không phải do phiên nào của đợt audit tạo ra. Đụng vào là sửa một bản vá bảo mật đang chờ retest | 2026-09-23 | **P13** — GĐ2 nhóm 5, cùng lượt với ND-009 |
| ND-019 | **`README.md` và commit của hai nhánh từng ghi ba con số test khác nhau** (285, 336, 339). Nguyên nhân gốc: chưa có cổng nào chặn việc chép số vào tài liệu | `README.md` và mọi tài liệu | Người đọc không biết tin số nào. Đã sửa triệu chứng hai lần (P00, P04), sẽ lặp lại lần ba nếu không có cổng | Cổng tự động cần một hook hoặc bước kiểm trong CI — dựng nó là việc khác với việc sửa tài liệu | 2026-09-23 | Sau khi xong đợt audit |

## Đã trả

| # | Món nợ | Trả ngày | Ghi chú |
|---|---|---|---|
| ND-001 | Không chạy được test/build vì thiếu `node_modules` | 2026-09-10 | `npm ci` ở cả gốc và `server/`. Cổng DoD giờ chạy được: `npm test` → **336/336 pass**, `npm run build` → 0 lỗi TypeScript |
| ND-002 | Tài liệu lệch số lượng test (README ghi 285, commit ghi 336, đếm tĩnh ra 257) | 2026-09-10 | Số thật đo được: **336 test / 71 suite, pass toàn bộ**. Commit `cc6f65f` đúng, README sai. Đã sửa README theo hướng **bỏ hẳn con số**, chỉ ghi lệnh — để không lệch lại lần nữa |
| ND-011 | `COMMIT.txt` + `HUONG-DAN-GOP-COMMIT.txt` xoá khỏi working tree nhưng chưa commit | 2026-09-10 | Nghỉ hưu cùng thói quen gộp commit. Quy tắc mới: một việc một commit — xem [QUY-TRINH-LAM-VIEC.md](QUY-TRINH-LAM-VIEC.md) §7 |

---

## Cách dùng sổ này

**Khi nào ghi vào đây:** đang làm việc A, nhìn thấy vấn đề B không thuộc phạm vi phiên.
Ghi B vào đây rồi tiếp tục làm A. Không sửa B ngay.

**Khi nào KHÔNG ghi vào đây:**
- B là lỗ hổng bảo mật → mở `buglogs/bugs/BUG-xxx.md` (nội bộ), không ghi chi tiết ở file công khai này
- B là quyết định kiến trúc → viết ADR trong `docs/adr/`
- B nhỏ và nằm ngay trong phạm vi đang sửa → cứ sửa luôn, không phải nợ

**Khi trả nợ:** chuyển dòng xuống bảng "Đã trả", điền ngày và commit. Không xoá — giữ lại
để biết dự án đã đi qua những gì.
