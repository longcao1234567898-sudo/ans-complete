# Phụ lục A — Mẫu Bug Log

Bản gốc để sao chép nằm ở [`buglogs/_MAU-BUG.md`](../../buglogs/_MAU-BUG.md).
Bảng tổng hợp nằm ở [`buglogs/BUG-LOG.md`](../../buglogs/BUG-LOG.md).

---

## 1. Mẫu đầy đủ (một file cho mỗi lỗi: `buglogs/bugs/BUG-xxx.md`)

| Trường | Nội dung |
|---|---|
| **Mã lỗi** | BUG-001 |
| **Ngày phát hiện** | |
| **Mức độ nghiêm trọng** | Critical / High / Medium / Low |
| **Nhóm hạng mục** | 1–8 (theo Giai đoạn 2) |
| **Vị trí (file:dòng / endpoint)** | |
| **Mô tả lỗ hổng** | Sai ở đâu, vì sao sai |
| **Ảnh hưởng thực tế** | Ai bị hại, hại thế nào — viết cho người không chuyên hiểu |
| **Kịch bản khai thác (khái niệm, để tự kiểm thử)** | Các bước tái hiện trên môi trường local/staging với dữ liệu giả |
| **Biến thể cần thử khi retest** | Ít nhất 2 biến thể của kịch bản trên |
| **CWE / OWASP liên quan** | vd. CWE-639, OWASP A01:2021 |
| **Người/AI phát hiện** | |
| **Cách khắc phục đề xuất** | |
| **Quyết định liên quan** | SEC-DEC-xxx (nếu có) |
| **Ngày fix** | |
| **Người/AI thực hiện fix** | |
| **Commit** | |
| **Test tự động đã thêm** | đường dẫn + lệnh chạy |
| **Kết quả retest** | Fixed / Fixed nhưng phát sinh lỗi mới / Chưa fix triệt để |
| **Ngày retest & người retest** | ⚠️ **phải khác người fix** |
| **Bằng chứng retest** | output lệnh / ảnh chụp / log |
| **Lỗi mới phát sinh** | mã BUG mới nếu có |
| **Ghi chú** | |

## 2. Thang mức độ nghiêm trọng

Chấm theo hai trục rồi lấy ô giao nhau. Không tranh cãi cảm tính, cứ theo bảng.

**Trục 1 — Tác động nếu bị khai thác**

| Mức | Nghĩa trong hệ thống này |
|---|---|
| Nghiêm trọng | Lộ danh tính người tố giác · chiếm quyền admin · đọc/xoá được toàn bộ CSDL |
| Nặng | Đọc được nội dung tố giác của người khác · leo thang quyền giữa các vai trò cán bộ · lộ secret |
| Vừa | Lách được giới hạn nghiệp vụ · spam/DoS một tính năng · lộ metadata |
| Nhẹ | Rò rỉ thông tin phiên bản · thiếu header phòng thủ chiều sâu |

**Trục 2 — Độ dễ khai thác**

| Mức | Nghĩa |
|---|---|
| Dễ | Người ngoài, không cần đăng nhập, chỉ cần `curl` |
| Trung bình | Cần tài khoản cán bộ hợp lệ, hoặc cần điều kiện đua tranh |
| Khó | Cần quyền admin sẵn, hoặc cần truy cập hạ tầng |

**Ô giao nhau**

| Tác động ↓ / Độ dễ → | Dễ | Trung bình | Khó |
|---|---|---|---|
| **Nghiêm trọng** | Critical | Critical | High |
| **Nặng** | Critical | High | Medium |
| **Vừa** | High | Medium | Low |
| **Nhẹ** | Medium | Low | Low |

**Quy tắc nâng mức bắt buộc:** bất kỳ lỗi nào dẫn tới **lộ danh tính người tố giác** đều
là `Critical`, bất kể độ khó. Lý do: hậu quả không thể hoàn tác và có thể ảnh hưởng tới an
toàn thân thể của một người thật.

## 3. Ví dụ đã điền

> **Vì sao lấy một lỗi ĐÃ VÁ làm ví dụ:** file này công khai trên GitHub. Minh hoạ bằng lỗ
> hổng đang mở là tự đăng báo cáo lỗ hổng của chính mình. Ví dụ dưới đây lấy lỗi **C1 đã vá
> xong** trong [CHANGELOG-BAO-MAT.md](../CHANGELOG-BAO-MAT.md) — vốn đã công khai, nên tái
> hiện lại ở đây không lộ thêm gì. Khi ghi Bug Log thật, chi tiết đầy đủ nằm ở `buglogs/`
> (nội bộ), không nằm ở đây.

| Trường | Nội dung |
|---|---|
| **Mã lỗi** | BUG-000 (ví dụ mẫu — dựng lại từ lỗi C1 đã vá 2026-08-03) |
| **Ngày phát hiện** | 2026-08-03 |
| **Mức độ nghiêm trọng** | Critical *(tác động: Nghiêm trọng · độ dễ: Dễ)* |
| **Nhóm hạng mục** | 2 — Phân quyền |
| **Vị trí** | `server/src/routes/admin/kiosk.js`, `server/src/routes/admin/trash.js` |
| **Mô tả lỗ hổng** | Hai router quản trị quên gắn `requireAuth`. Mọi route bên trong chúng phục vụ cho bất kỳ ai gọi tới, không cần đăng nhập. |
| **Ảnh hưởng thực tế** | Người ngoài đọc được toàn bộ thùng rác (gồm tin tố giác đã xoá mềm) và chèn được tin giả mạo nhãn "đã xác minh tại trụ sở". Đây là kịch bản xấu nhất của hệ thống này: nội dung tố giác rời khỏi vòng kiểm soát. |
| **Kịch bản khai thác (khái niệm)** | Gọi thẳng một route dưới hai router đó mà không kèm token, quan sát máy chủ vẫn trả dữ liệu thay vì `401`. |
| **Biến thể cần thử khi retest** | (a) gọi kèm token đã hết hạn; (b) gọi kèm token cán bộ vai trò thấp nhất — phải bị chặn theo đúng ma trận quyền. |
| **CWE / OWASP** | CWE-306 (Missing Authentication for Critical Function), OWASP A01:2021 Broken Access Control |
| **Người/AI phát hiện** | *(điền)* |
| **Cách khắc phục đề xuất** | **Vá gốc, không vá triệu chứng:** thay vì thêm `requireAuth` vào từng router con, chốt nó ở tầng router cha `routes/admin/index.js` để không router con nào quên được nữa. |
| **Kết quả retest** | *(để trống — người fix không điền ô này)* |

> Chú ý cách viết ô **Cách khắc phục**: nó nêu rõ *vì sao chọn vá ở tầng cha*. Một bản vá
> chỉ thêm `requireAuth` vào đúng hai file đã quên sẽ hết lỗi hôm nay nhưng để nguyên cái
> bẫy cho router thứ ba viết sau này.
