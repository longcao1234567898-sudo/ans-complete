# Tiến độ — nhật ký phiên làm việc

Mỗi phiên Claude một dòng. Ghi bằng [`/bat-dau-phien`](../.claude/commands/bat-dau-phien.md)
và [`/ket-thuc-phien`](../.claude/commands/ket-thuc-phien.md). Quy trình: [QUY-TRINH-LAM-VIEC.md](QUY-TRINH-LAM-VIEC.md).

> ⚠️ **File này công khai trên GitHub.** Chỉ ghi **mã** `BUG-xxx`, tuyệt đối không mô tả
> chi tiết lỗ hổng đang mở. Chi tiết nằm ở `buglogs/` (đã gitignore).

---

## Nhật ký phiên

| Mã | Ngày | Loại | Mục tiêu | Trạng thái | SHA mốc | Commit | Việc còn dở |
|---|---|---|---|---|---|---|---|
| P00 | 2026-09-10 | `TAI-LIEU` | Dựng quy trình làm việc theo phiên + CLAUDE.md | **XONG** | `cc6f65f` | `6248123` `9c88250` `5c531ea` `197bd2f` `495bd35` | Không còn. Đã cài `node_modules`, cổng DoD chạy được (336/336 pass, build 0 lỗi). Trả xong ND-001, ND-002, ND-011. Phát sinh: `npm audit` lộ 12 lỗ hổng dependency → gộp vào ND-003, để P09 triage. |
| P01 | 2026-09-10 | `KHAO-SAT` | Điền hết dấu `?` trong ba bảng endpoint A/B/C của §1.1, lưu `kiem-ke-endpoint.md` | **XONG** | `d8d11a9` | `e667152` | Không còn phần nào của mục tiêu. Ba bảng A/B/C đã đầy đủ, đối chiếu xong ba biến thể máy chủ (không lệch — vì dùng chung router). Ghi 3 điểm nghi ngờ vào `buglogs/` cho P04/P05/P08. **Còn lại của D1 (cố ý ngoài phạm vi):** sơ đồ thành phần + bên thứ ba, và danh sách biến môi trường thật trên Render — hai ô chưa tích ở §1.3. |

<!--
Dòng mẫu để copy:
| P01 | 2026-09-11 | KHAO-SAT | Kiểm kê 48 endpoint, điền hết dấu ? trong bảng phân quyền | ĐANG CHẠY | abc1234 | | |
-->

> ⚠️ **Lịch sử git đã được viết lại ngày 2026-09-10** (reset về `9c88250` rồi commit lại).
> Các SHA ghi ở dòng P00 là SHA **cũ, không còn tra được**. Ánh xạ sang SHA hiện tại:
> `5c531ea`→`71a7e17` · `197bd2f`→`3e22d7b` · `495bd35`→`c9cd8bf` · `c57be24`→`d8d11a9`.
> Nội dung không mất gì: commit "Bo mo ta lo hong dang mo khoi tai lieu cong khai"
> (`152704e` cũ) đã được gộp vào lịch sử mới — `git diff 152704e HEAD` cho kết quả rỗng.
> Giữ nguyên SHA cũ ở dòng P00 vì đó là bản ghi của phiên khác; ghi chú này để phiên sau
> không mất công tra một SHA đã biến mất.

## Trạng thái dùng được

| Trạng thái | Nghĩa |
|---|---|
| `ĐANG CHẠY` | Phiên đang mở. **Phải có tối đa một dòng ở trạng thái này.** |
| `XONG` | Đạt mục tiêu, qua đủ cổng DoD, đã commit |
| `XONG MỘT PHẦN` | Đạt một phần — phần còn lại ghi rõ ở cột việc còn dở |
| `KHÔNG COMMIT` | Có làm nhưng chưa qua cổng DoD — ghi rõ vướng mục nào |
| `BỎ DỞ` | Phiên đứt giữa chừng |

---

## Cột mốc lớn

| Mốc | Trạng thái | Ghi chú |
|---|---|---|
| Đợt vá bảo mật khẩn cấp | ✅ Xong 2026-08-03 | [CHANGELOG-BAO-MAT.md](CHANGELOG-BAO-MAT.md) |
| Kế hoạch kiểm thử bảo mật 12 ngày | 📋 Đã lập 2026-09-09 | [kiem-thu-bao-mat/](kiem-thu-bao-mat/) |
| Quy trình làm việc theo phiên | ✅ Xong 2026-09-10 | Phiên P00 |
| GĐ1 — Kiểm kê hệ thống | ⏳ Chưa bắt đầu | Dự kiến P01–P02 |
| GĐ2 — Rà soát 8 nhóm | ⏳ Chưa bắt đầu | Dự kiến P03–P10 |
| GĐ3 — Fix theo ưu tiên | ⏳ Chưa bắt đầu | Số phiên tuỳ số lỗi tìm được |
| GĐ4 — Retest độc lập | ⏳ Chưa bắt đầu | Mỗi BUG một phiên `/phien-retest` |
| GĐ5 — Báo cáo tổng kết | ⏳ Chưa bắt đầu | |

Kế hoạch phiên chi tiết cho đợt audit: [kiem-thu-bao-mat/06-KE-HOACH-THEO-PHIEN.md](kiem-thu-bao-mat/06-KE-HOACH-THEO-PHIEN.md)
