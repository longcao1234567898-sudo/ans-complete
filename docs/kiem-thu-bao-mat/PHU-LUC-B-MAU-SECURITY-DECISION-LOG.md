# Phụ lục B — Mẫu Security Decision Log

Bản gốc để sao chép: [`buglogs/_MAU-SEC-DEC.md`](../../buglogs/_MAU-SEC-DEC.md).
Bảng tổng hợp: [`buglogs/SECURITY-DECISION-LOG.md`](../../buglogs/SECURITY-DECISION-LOG.md).

**Bắt buộc lập với mọi fix `Critical` và `High`.** Với `Medium/Low` chỉ cần khi phương án
fix có đánh đổi đáng kể hoặc chạm vào luồng nghiệp vụ.

**Mục đích kép:** (1) buộc người fix phải nghĩ ít nhất 2 phương án trước khi sửa — chống
đúng cái tật của AI là chộp lấy phương án đầu tiên nghĩ ra; (2) làm nguyên liệu thuyết trình,
mỗi bảng đọc thẳng thành một slide.

---

## 1. Mẫu

| Trường | Nội dung |
|---|---|
| **Mã quyết định** | SEC-DEC-001 |
| **Liên quan Bug** | BUG-001 |
| **Ngày** | |
| **Người ra quyết định** | |
| **Vấn đề cần giải quyết** | Viết bằng ngôn ngữ nghiệp vụ, không dùng thuật ngữ. Người nghe phải hiểu *ai bị hại và hại thế nào* mà không cần biết gì về code. |
| **Các phương án đã cân nhắc** | **A.** … — ưu: … / nhược: …<br>**B.** … — ưu: … / nhược: …<br>**C.** … — ưu: … / nhược: … |
| **Phương án được chọn** | |
| **Lý do chọn** | Nêu rõ tiêu chí đã dùng: an toàn hơn / đúng quy trình nghiệp vụ thật / không phá luồng cũ / chi phí thấp hơn / theo khuyến nghị chuẩn ngành (dẫn nguồn ASVS, CWE…) |
| **Đánh đổi chấp nhận** | Nói thẳng cái mất. Ví dụ: chậm hơn 40 ms mỗi request; cán bộ phải thao tác thêm một bước; chỉ huy bận thì hồ sơ chờ lâu hơn |
| **Ảnh hưởng tới các phần khác** | File/luồng/màn hình nào bị chạm; có cần migration DB không; có cần đổi tài liệu/đào tạo cán bộ không |
| **Phương án bị loại và lý do loại** | Ghi lại — để 6 tháng sau không có ai đề xuất lại đúng phương án đã cân nhắc và loại |
| **Cách kiểm chứng quyết định này đúng** | Test tự động nào chứng minh; chỉ số nào theo dõi sau khi lên production |
| **Người phê duyệt** | |

## 2. Ví dụ đã điền (minh hoạ cách viết — **không phải kết luận đã xác minh**)

| Trường | Nội dung |
|---|---|
| **Mã quyết định** | SEC-DEC-000 (ví dụ mẫu) |
| **Liên quan Bug** | BUG-000 |
| **Ngày** | 2026-09-21 |
| **Người ra quyết định** | *(điền)* |
| **Vấn đề cần giải quyết** | Hệ thống có giới hạn "mỗi hồ sơ chỉ được khiếu nại 2 lần". Cách kiểm hiện tại là đếm số lần đã gửi rồi mới ghi bản ghi mới. Nếu ai đó bấm gửi nhiều lần cùng lúc, tất cả các lần đều đếm ra "mới có 1 lần" và cùng được ghi — giới hạn 2 lần bị lách. |
| **Các phương án đã cân nhắc** | **A. Thêm ràng buộc UNIQUE ở cơ sở dữ liệu** — ưu: database tự đảm bảo, không lách được kể cả khi chạy nhiều máy chủ; nhược: cần migration, phải xử lý lỗi trùng khoá cho đẹp.<br>**B. Bọc trong transaction có khoá hàng (`SELECT ... FOR UPDATE`)** — ưu: không cần migration; nhược: giữ khoá lâu hơn, nguy cơ deadlock khi tải cao.<br>**C. Chỉ thêm rate limit chặt hơn** — ưu: sửa một dòng; nhược: **không giải quyết gốc**, chỉ làm khó hơn chứ vẫn lách được. |
| **Phương án được chọn** | A — ràng buộc UNIQUE ở database, kết hợp xử lý lỗi trùng khoá thành thông báo thân thiện. |
| **Lý do chọn** | Giới hạn được đảm bảo ở tầng thấp nhất, đúng nguyên tắc "một nguồn sự thật". Quan trọng hơn: hệ thống dự kiến chạy nhiều instance trên Render — phương án B chỉ đúng khi tất cả đi qua cùng một database (đúng ở đây), còn phương án C hoàn toàn không chống được đua tranh. Khớp khuyến nghị OWASP ASVS V11 về tính toàn vẹn logic nghiệp vụ. |
| **Đánh đổi chấp nhận** | Cần một migration SQL và một lần dừng ngắn để thêm ràng buộc. Phải dọn dữ liệu trùng có sẵn trước khi thêm. Đổi lại: giới hạn không thể lách bằng bất kỳ cách nào từ phía client. |
| **Ảnh hưởng tới các phần khác** | `server/src/routes/khieu-nai.js`, thêm file `database/nang_cap_v18.sql`, thông báo lỗi mới ở màn khiếu nại phía frontend. |
| **Phương án bị loại và lý do loại** | B — đúng về mặt kỹ thuật nhưng phụ thuộc vào việc lập trình viên sau này nhớ giữ transaction; ràng buộc DB thì không quên được. C — vá triệu chứng, bị loại thẳng. |
| **Cách kiểm chứng** | Test `server/tests/khieu-nai-dua-tranh.test.js`: bắn 20 request song song, kỳ vọng đúng 2 bản ghi. Sau khi lên production, theo dõi số lỗi trùng khoá — tăng đột biến nghĩa là có người đang thử lách. |
| **Người phê duyệt** | *(điền)* |
