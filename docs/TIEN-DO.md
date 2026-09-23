# Tiến độ — nhật ký phiên làm việc

Mỗi phiên Claude một dòng. Ghi bằng [`/bat-dau-phien`](../.claude/commands/bat-dau-phien.md)
và [`/ket-thuc-phien`](../.claude/commands/ket-thuc-phien.md). Quy trình: [QUY-TRINH-LAM-VIEC.md](QUY-TRINH-LAM-VIEC.md).

> ⚠️ **File này công khai trên GitHub.** Chỉ ghi **mã** `BUG-xxx`, tuyệt đối không mô tả
> chi tiết lỗ hổng đang mở. Chi tiết nằm ở `buglogs/` (đã gitignore).

---

## Nhật ký phiên

| Mã | Ngày | Loại | Mục tiêu | Trạng thái | SHA mốc | Commit | Việc còn dở |
|---|---|---|---|---|---|---|---|
| P00 | 2026-09-10 | `TAI-LIEU` | Dựng quy trình làm việc theo phiên + CLAUDE.md | **XONG** | `cc6f65f` | `6248123` `9c88250` `5c531ea` `197bd2f` `495bd35` | Không còn. Đã cài `node_modules`, cổng DoD chạy được (336/336 pass, build 0 lỗi). Trả xong ND-001, ND-002, ND-011. Phát sinh: `npm audit` lộ 12 lỗ hổng dependency → gộp vào ND-003, để GĐ2-7 triage. |
| P01 | 2026-09-10 | `KHAO-SAT` | Điền hết dấu `?` trong ba bảng endpoint A/B/C của §1.1, lưu `kiem-thu-bao-mat/ket-qua/kiem-ke-endpoint.md` | **XONG** | `d8d11a9` | `e667152` | Không còn phần nào của mục tiêu. Ba bảng A/B/C đã đầy đủ, đối chiếu xong ba biến thể máy chủ (không lệch — vì dùng chung router). Ghi 3 điểm nghi ngờ vào `buglogs/` cho các phiên GĐ2. **Còn lại của D1 (cố ý ngoài phạm vi):** sơ đồ thành phần + bên thứ ba, và danh sách biến môi trường thật trên Render — hai ô chưa tích ở §1.3. |
| P02 | 2026-09-10 | `KHAO-SAT` | Vẽ 5 luồng dữ liệu nhạy cảm + điền cột “Thực thi ở đâu” cho 18 giới hạn nghiệp vụ (§2.2) | **XONG** | `c02088d` | `0b63885` `de159e1` `563a614` `42e7b18` | Không còn phần nào của mục tiêu. 5 luồng lưu ở `kiem-thu-bao-mat/ket-qua/luong-du-lieu-nhay-cam.md`; bảng §2.2 đầy đủ, thêm dòng thứ 19 (giới hạn video) mà bản kiểm kê cũ thiếu. Ghi 5 điểm nghi ngờ vào `buglogs/` cho các phiên GĐ2; ghi ND-013. **Ba đính chính cho tài liệu gốc** (phiên sau đừng tra lại): §2.1 luồng 3 mô tả sai — nội dung tố giác **không** gửi sang Gemini; §2.2 dẫn nguồn giới hạn OTP về một bản chết; §2.2 dẫn sai số dòng giới hạn body. **Còn lại của D1 (cố ý ngoài phạm vi, nguyên từ P01):** sơ đồ thành phần + bên thứ ba, và biến môi trường thật trên Render — hai ô chưa tích ở §1.3. |
| P03 | 2026-09-10 | `RA-SOAT` | Rà soát nhóm 1 — xác thực & phiên đăng nhập (12 mục kiểm) | **XONG** | `1f6f9cd` | `8619a35` `cfb035d` `73aa5cf` `9736336` `3dcee4a` | Không còn phần nào của mục tiêu: 12/12 mục kiểm có kết quả. Mở **BUG-001** (Critical), **BUG-002** (High), **BUG-003**, **BUG-004** (Medium) — chi tiết ở `buglogs/`, tài liệu công khai chỉ ghi mã. Bốn mục đạt: 1.1, 1.8, 1.9, 1.12. Ghi ND-014, ND-015, ND-016; đóng ND-013 (đã xem xét đúng hẹn, xác nhận là mã chết, còn lại là việc dọn). Xác nhận **BUG-001 bằng script chạy thật**, không chỉ đọc mã — script lưu trong `buglogs/`. **Ba việc cố ý để lại:** (1) mục 1.8 kết luận bằng đọc mã, chưa kiểm cờ cookie trên staging HTTPS thật; (2) chưa xác nhận được biến môi trường thật trên Render — điều kiện quyết định mức độ thật của BUG-002, và là ô còn trống ở §1.3 mà **ba phiên liên tiếp** đều vướng, nên hỏi thẳng người vận hành; (3) không lập ma trận quyền — có chạm danh sách route thiếu `authorize()` nhưng **chỉ để đo tác động BUG-001**, ma trận đầy đủ vẫn là việc của P04. ⚠️ **Phiên rà soát nhóm 2 (GĐ2-2) nên đọc BUG-001 trước khi bắt đầu.** |
| P04 | 2026-09-23 | `TAI-LIEU` | Hợp nhất nhánh đã rẽ, dựng lại kế hoạch audit trên mã mới, nâng cấp quy trình để sự cố không lặp | **XONG** | `30d8240` | `991a837` `5321a03` `35b3194` `c17dd4e` `ea30937` `61149c2` `4d31a6e` `31c548d` `0732e96` `6f561e5` `191c30c` | Không còn phần nào của mục tiêu. **Phát hiện chính:** nhánh GitHub đã rẽ khỏi máy từ `d8d11a9` — 13 commit ở máy, 19 trên GitHub. Ba phiên P01–P03 vì vậy đã rà soát trên bản mã lỗi thời (66 endpoint lúc kiểm, thực tế 78). Merge sạch, 339/339 test, build 0 lỗi. **Sự cố nặng nhất:** commit `76ee015` của nhánh kia đã xoá luật `.gitignore` giữ `buglogs/` ở máy, kèm một thay đổi không liên quan; cùng lúc `COMMIT.txt` (chứa `git add . && git push`) quay lại. Đã khôi phục luật và gỡ lại hai tệp đó. **Nợ đã sống lại và trả lại:** ND-002 (số test cứng trong README), ND-011 (COMMIT.txt). **Nợ mới:** ND-017, ND-018, ND-019. **Quy trình thêm:** luật khi nào bắt buộc mở phiên RETEST độc lập (§2.1), trọng tài subagent (§2.2), làm việc song song (§13), skill Anthropic (§14), bước kiểm lệch nhánh trong `/bat-dau-phien`, hai lệnh mới `/phien-ra-soat` và `/phien-fix`, và sổ tay cho người lập trình. **Phiên sau:** hai phiên RETEST của GĐ0, **phải mở bằng cửa sổ Claude hoàn toàn mới**. |
| P05 | 2026-09-23 | `TAI-LIEU` | Sắp xếp lại cấu trúc thư mục và nội dung tài liệu cho người đọc dễ định hướng; thay lịch 12 ngày đã chết bằng mốc theo phiên | **XONG** | `35673bd` | `5f61225` `c282449` `6ee203a` `0e79a91` | Không còn phần nào của mục tiêu. **Cấu trúc:** `kiem-thu-bao-mat/` chia ba thư mục con theo loại nội dung — `phuong-phap/` dạy cách làm, `bieu-mau/` là form trống, `ket-qua/` là sản phẩm đã làm ra. Trước đây 13 tệp nằm phẳng, không phân biệt được. Đổi tên cho nhất quán, bỏ nhãn `PHU-LUC-A/B/C/D` vô nghĩa. Dùng `git mv` nên lịch sử từng tệp còn tra được. **Bản đồ mới:** `docs/README.md` định tuyến theo vai trò người đọc, nối vào `README.md` gốc và `CLAUDE.md`. **Hai thứ nói dối đã gỡ:** (1) bảng lịch 12 ngày D1–D12 ghi hôm nay phải đang retest và còn hai ngày là nộp báo cáo; (2) kế hoạch đặt trước số phiên cho từng việc, đã phải đánh số lại hai lần trong một ngày. Nay kế hoạch dùng mã giai đoạn `GĐ0-a`…`GĐ2-8` và ghi *làm gì*; tiến độ ghi *ai làm, khi nào*. **Kiểm:** 121 liên kết trong repo, 0 gãy, bằng script. **Phiên sau:** GĐ0-a, tức `/phien-retest BUG-001`, **mở bằng cửa sổ Claude hoàn toàn mới**. |

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

> ⚠️ **P01, P02, P03 phải làm lại — không phải vì làm sai, mà vì làm trên nền sai.**
> Cả ba rà soát trên bản mã ở máy trong khi bản đang chạy đã đi tiếp 19 commit. Giữ lại:
> 4 BUG đã mở, phương pháp, checklist, danh sách biến thể của từng BUG, ba đính chính tài
> liệu của P02. Làm lại: ba bảng kiểm kê endpoint, 5 sơ đồ luồng dữ liệu, kết luận 12 mục
> kiểm nhóm 1. Chi tiết và thứ tự mới:
> [kiem-thu-bao-mat/KE-HOACH.md](kiem-thu-bao-mat/KE-HOACH.md).
>
> Nguyên nhân gốc đã được vá bằng quy trình, không chỉ bằng lời hứa: `/bat-dau-phien` giờ có
> bước 2 chạy `git fetch` và dừng phiên khi phát hiện lệch nhánh.

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
| Hợp nhất nhánh + nâng cấp quy trình | ✅ Xong 2026-09-23 | Phiên P04 |
| GĐ0 — Gỡ hai ẩn số đang treo | ⏳ Chưa bắt đầu | GĐ0-a và GĐ0-b, hai phiên RETEST, **mỗi phiên một cửa sổ Claude mới** |
| GĐ1 — Kiểm kê hệ thống | ⚠️ Phải làm lại | P01–P02 làm trên mã lỗi thời. Làm lại ở GĐ1-a và GĐ1-b, kèm bề mặt tấn công mới |
| GĐ2 — Rà soát 8 nhóm | ⚠️ Phải làm lại | Nhóm 1 (P03) làm lại ở GĐ2-1. Nhóm 2–8 ở GĐ2-2 tới GĐ2-8 |
| GĐ3 — Fix theo ưu tiên | ⏳ Chưa bắt đầu | Số phiên tuỳ số lỗi tìm được. Mở bằng `/phien-fix` |
| GĐ4 — Retest độc lập | ⏳ Chưa bắt đầu | Mỗi BUG một phiên `/phien-retest` |
| GĐ5 — Báo cáo tổng kết | ⏳ Chưa bắt đầu | Mục "Bài học" có sẵn số liệu thật từ sự cố lệch nhánh 2026-09-23 |

Kế hoạch phiên chi tiết cho đợt audit: [kiem-thu-bao-mat/KE-HOACH.md](kiem-thu-bao-mat/KE-HOACH.md)
