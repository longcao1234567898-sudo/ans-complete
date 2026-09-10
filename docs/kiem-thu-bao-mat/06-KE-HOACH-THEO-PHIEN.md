# Kế hoạch audit bẻ theo phiên Claude

Bản [README.md](README.md) chia đợt audit theo **ngày làm việc**. File này bẻ tiếp thành
**phiên Claude** — đơn vị thực thi thật sự. Quy trình phiên: [../QUY-TRINH-LAM-VIEC.md](../QUY-TRINH-LAM-VIEC.md).

Ghi tiến độ ở [../TIEN-DO.md](../TIEN-DO.md).

---

## Nguyên tắc chia phiên

1. **Một phiên một loại, một mục tiêu đóng được** (WIP = 1).
2. **Phiên `RA-SOAT` không sửa code.** Thấy lỗ hổng thì ghi Bug Log, không vá — vá ngay là mất tính hệ thống của đợt rà soát, và trộn hai loại phiên.
3. **Phiên `FIX` và phiên `RETEST` của cùng một BUG bắt buộc tách rời.**
4. Ước lượng 1–2 phiên mỗi ngày làm việc. Phiên tràn thì đóng ở `XONG MỘT PHẦN`, không cố kéo.

---

## Giai đoạn 1 — Kiểm kê (D1–D2)

| Phiên | Loại | Mục tiêu | Xong khi | Tài liệu |
|---|---|---|---|---|
| **P01** | `KHAO-SAT` | Điền hết dấu `?` trong ba bảng endpoint — xác định mọi route dưới `/api/admin` có `authorize()` gì | Bảng A/B/C của §1.1 không còn dấu `?`; lưu `kiem-ke-endpoint.md` | [01-...KIEM-KE.md](01-GIAI-DOAN-1-KIEM-KE.md) §1.1 |
| **P02** | `KHAO-SAT` | Vẽ 5 luồng dữ liệu nhạy cảm + điền cột "Thực thi ở đâu" cho 18 giới hạn nghiệp vụ | 5 sơ đồ xong; bảng §2.2 đầy đủ; có danh sách điểm nghi ngờ chuyển sang GĐ2 | §2.1, §2.2 |

> **Lưu ý P01:** nhớ kiểm cả ba biến thể khởi động (`index.js`, `may-chu-cong-khai.js`,
> `may-chu-can-bo.js`) — xem ND-010 trong [../NO-KY-THUAT.md](../NO-KY-THUAT.md).

## Giai đoạn 2 — Rà soát (D3–D6)

Tám nhóm hạng mục → tám phiên. Nhóm 2 (phân quyền) là nhóm nặng nhất, để riêng một phiên.

| Phiên | Loại | Nhóm | Mục tiêu | Xong khi |
|---|---|---|---|---|
| **P03** | `RA-SOAT` | 1 | Xác thực & phiên đăng nhập (12 mục kiểm) | Mọi ô ☐ nhóm 1 có kết quả |
| **P04** | `RA-SOAT` | 2 | **Phân quyền / IDOR** (12 mục) — ưu tiên cao nhất | Ma trận `route × vai trò` đầy đủ; chuỗi `/assign` → `/reveal` đã thử |
| **P05** | `RA-SOAT` | 3 | Input validation & injection (13 mục) | Mọi ô ☐ nhóm 3 có kết quả |
| **P06** | `RA-SOAT` | 4 | Bảo vệ dữ liệu (10 mục) | Mọi ô ☐ nhóm 4 có kết quả |
| **P07** | `RA-SOAT` | 5 | Bảo mật API (12 mục) | Mọi ô ☐ nhóm 5 có kết quả |
| **P08** | `RA-SOAT` | 6 | Business logic & giới hạn (12 mục) + **viết bộ test phòng thủ** | Các test ở [PHU-LUC-C](PHU-LUC-C-BO-TEST-PHONG-THU.md) đã viết và chạy được |
| **P09** | `RA-SOAT` | 7 | Hạ tầng & secrets (12 mục) + **chạy công cụ tự động** | Semgrep + `npm audit` + soát git history xong; bảng đối chiếu [PHU-LUC-D](PHU-LUC-D-CONG-CU.md) §6 đã điền |
| **P10** | `RA-SOAT` | 8 | Scalability (8 mục) + **chốt và phân loại Bug Log** | Mọi lỗi đã chấm mức độ theo thang 2 trục; thứ tự fix đã chốt |

> **P08 là phiên đặc biệt:** vừa rà soát vừa viết test. Test ở đây là **kiểm thử phòng thủ** —
> khẳng định "phải bị chặn", chạy trên local/staging với dữ liệu giả. Bộ test này sau đó
> chính là **trọng tài** cho các phiên RETEST ở GĐ4.

> **P09 phụ thuộc ND-001** (chưa cài `node_modules`) — `npm audit` không chạy được nếu chưa cài.

## Giai đoạn 3 — Fix (D7–D9)

Số phiên **tuỳ số lỗi tìm được ở GĐ2**. Ước lượng:

| Mức độ | Lỗi/phiên | Vì sao |
|---|---|---|
| `Critical` | **1** | Một lỗi Critical một phiên, một commit. Không gộp. |
| `High` | 1–2 | Tuỳ độ phức tạp |
| `Medium` / `Low` | 2–4 | Được gộp trong một phiên nhưng **vẫn mỗi lỗi một commit** |

Đặt mã phiên tiếp nối: `P11`, `P12`, … Mỗi phiên `FIX` ghi rõ trong mục tiêu là fix BUG nào.

**Bắt buộc trong mọi phiên `FIX`:**
1. Viết test tái hiện lỗ hổng **trước**, xác nhận test **đỏ**
2. Sửa code
3. Xác nhận test chuyển xanh + toàn bộ bộ test vẫn xanh
4. Lập Security Decision Log (với `Critical`/`High`)
5. Commit riêng
6. **Để trống Phần 3 của Bug Log** — không tự chấm bài mình

## Giai đoạn 4 — Retest (D10–D11)

**Mỗi BUG một phiên `/phien-retest`, mở bằng phiên Claude hoàn toàn mới.**

| Thứ tự | Phạm vi |
|---|---|
| Trước | Toàn bộ `Critical` |
| Sau | Toàn bộ `High` |
| Cuối | `Medium` / `Low` + một phiên hồi quy toàn hệ thống |

Phiên retest **không được** là phiên đã fix bug đó, và **không được** đọc lại giải thích của
phiên fix. Chỉ nạp: Bug Log + `git diff` + bộ test.

Lỗi mới phát sinh → mở BUG mới, ghi `Sinh ra bởi: fix của BUG-xxx`, quay lại GĐ3 với một
phiên `FIX` mới.

## Giai đoạn 5 — Báo cáo (D12)

| Phiên | Loại | Mục tiêu |
|---|---|---|
| Cuối | `TAI-LIEU` | Tổng hợp báo cáo 7 phần + bộ slide theo [05-GIAI-DOAN-5-BAO-CAO.md](05-GIAI-DOAN-5-BAO-CAO.md) |

Đầu ra cuối cùng cập nhật vào: `docs/CHANGELOG-BAO-MAT.md`, `README.md` (mục việc tồn đọng),
`docs/NO-KY-THUAT.md` (rủi ro chấp nhận).

---

## Bảng theo dõi

| Phiên | Loại | Ngày dự kiến | Trạng thái | Ghi chú |
|---|---|---|---|---|
| P01 | KHAO-SAT | D1 | ⏳ | |
| P02 | KHAO-SAT | D2 | ⏳ | |
| P03 | RA-SOAT | D3 | ⏳ | |
| P04 | RA-SOAT | D3 | ⏳ | Nhóm nặng nhất |
| P05 | RA-SOAT | D4 | ⏳ | |
| P06 | RA-SOAT | D4 | ⏳ | |
| P07 | RA-SOAT | D5 | ⏳ | |
| P08 | RA-SOAT | D5 | ⏳ | Kèm viết bộ test phòng thủ |
| P09 | RA-SOAT | D6 | ⏳ | Phụ thuộc ND-001 |
| P10 | RA-SOAT | D6 | ⏳ | Chốt Bug Log |
| P11+ | FIX | D7–D9 | ⏳ | Số phiên tuỳ số lỗi |
| … | RETEST | D10–D11 | ⏳ | Mỗi BUG một phiên mới |
| … | TAI-LIEU | D12 | ⏳ | Báo cáo tổng kết |

Trạng thái thật cập nhật ở [../TIEN-DO.md](../TIEN-DO.md); bảng này chỉ là khung dự kiến.
