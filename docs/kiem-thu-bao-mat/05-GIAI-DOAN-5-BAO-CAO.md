# Giai đoạn 5 — Tổng hợp & chuẩn bị thuyết trình

**Thời gian:** D12 (25/09/2026)
**Đầu ra:** báo cáo tổng kết + bộ slide dùng được cho stakeholder / nhà đầu tư / kiểm toán.

---

## 1. Cấu trúc báo cáo tổng kết

Lưu tại `buglogs/BAO-CAO-TONG-KET-2026-09-25.md`.

### Phần 1 — Tóm tắt cho lãnh đạo (1 trang, không thuật ngữ kỹ thuật)
- Đã rà soát cái gì, trong bao lâu, bằng phương pháp nào.
- Số lỗi theo mức độ: `Critical / High / Medium / Low`.
- Số lỗi đã đóng, số còn tồn đọng.
- **Một câu kết luận thẳng thắn** về việc hệ thống đã sẵn sàng vận hành thật chưa.
  Nếu chưa thì nói chưa — báo cáo tô hồng là báo cáo vô dụng.

### Phần 2 — Phương pháp
- Chuẩn tham chiếu: OWASP ASVS, OWASP Top 10, CWE.
- 8 nhóm hạng mục đã rà (dẫn sang [02-GIAI-DOAN-2-RA-SOAT.md](02-GIAI-DOAN-2-RA-SOAT.md)).
- Công cụ tự động đã dùng và kết quả đối chiếu.
- **Nêu rõ giới hạn của đợt kiểm thử**: cái gì *không* nằm trong phạm vi (ví dụ: chưa
  pentest hạ tầng nhà cung cấp, chưa kiểm thử vật lý thiết bị kiosk, chưa audit bên thứ ba).

### Phần 3 — Kết quả chi tiết
- Bảng Bug Log đầy đủ.
- Với mỗi lỗi Critical/High: một trang riêng theo cấu trúc
  `Vấn đề → Ảnh hưởng thực tế → Cách vá → Bằng chứng đã vá`.

### Phần 4 — Quyết định bảo mật
- Toàn bộ Security Decision Log.
- Nhấn vào các đánh đổi đã chấp nhận có ý thức (ví dụ: shadow-ban có thể chặn oan người
  dùng chung máy — đã chấp nhận vì mất tin báo thật còn hại hơn).

### Phần 5 — Rủi ro còn tồn đọng
Với mỗi rủi ro chưa xử lý, ghi đủ 4 ô: **rủi ro là gì · vì sao chưa fix · biện pháp giảm
thiểu tạm thời · ngày dự kiến xử lý dứt điểm**. Rủi ro không có ngày xử lý là rủi ro sẽ bị quên.

### Phần 6 — Bài học về việc dùng AI để fix
Phần này **giá trị riêng** với dự án viết bằng AI, nên tách hẳn ra:
- Bao nhiêu lỗi mới phát sinh do chính quá trình fix? (số liệu từ GĐ4)
- Kiểu sai nào lặp lại? (nới lỏng kiểm tra chỗ khác, sửa test thay vì sửa code, `catch {}` nuốt lỗi…)
- Điều chỉnh gì cho quy trình lần sau?

### Phần 7 — Roadmap bảo trì bảo mật định kỳ

| Nhịp | Việc |
|---|---|
| Mỗi lần release tính năng lớn | Chạy lại GĐ2 giới hạn trong phạm vi tính năng đó + toàn bộ Nhóm 2 (phân quyền) |
| Hàng tháng | `npm audit` ở gốc và `server/`, cập nhật dependency có CVE |
| Hàng quý | Rà lại ma trận phân quyền; rà nhật ký `reveal_identity` tìm bất thường |
| 6 tháng | Chạy lại trọn bộ 5 giai đoạn |
| Khi có sự cố | Kích hoạt quy trình ngay, không đợi lịch |
| Khi đổi nhân sự có quyền admin | Xoay `JWT_SECRET`, rà lại danh sách tài khoản |

---

## 2. Bộ slide thuyết trình

Dùng chính bảng Security Decision Log làm khung. **Mỗi lỗi Critical/High = một slide**,
theo đúng năm ô, viết bằng ngôn ngữ người không chuyên bảo mật hiểu được:

```
┌──────────────────────────────────────────────────────────┐
│  BUG-007 · Cán bộ tự phân công hồ sơ để xem danh tính     │
├──────────────────────────────────────────────────────────┤
│  VẤN ĐỀ                                                   │
│  Người tố giác được hứa là chỉ cán bộ phụ trách mới biết  │
│  họ là ai. Thực tế, một cán bộ có thể tự gán hồ sơ cho    │
│  mình rồi mở danh tính ra xem.                            │
├──────────────────────────────────────────────────────────┤
│  PHƯƠNG ÁN ĐÃ CÂN NHẮC                                    │
│  A. Chỉ chỉ huy mới được phân công hồ sơ                  │
│  B. Cho tự nhận việc, nhưng phải chờ duyệt mới xem được   │
│  C. Giữ nguyên, chỉ ghi nhật ký chặt hơn                  │
├──────────────────────────────────────────────────────────┤
│  QUYẾT ĐỊNH: Phương án A                                  │
├──────────────────────────────────────────────────────────┤
│  LÝ DO                                                    │
│  Đúng với quy trình nghiệp vụ ngoài đời (chỉ huy phân     │
│  việc). Nhật ký chỉ phát hiện SAU khi danh tính đã lộ —   │
│  với người tố giác thì đã muộn.                           │
│  Đánh đổi: chỉ huy bận thì hồ sơ chờ lâu hơn.             │
├──────────────────────────────────────────────────────────┤
│  KẾT QUẢ RETEST (24/09, người retest: ___)                │
│  ✅ Kịch bản gốc không còn tái hiện được                  │
│  ✅ 3 luồng nghiệp vụ liên quan chạy bình thường          │
└──────────────────────────────────────────────────────────┘
```

*(Nội dung slide trên là ví dụ minh hoạ cấu trúc, không phải kết luận đã xác minh.)*

**Ba slide mở đầu nên có:**
1. **Bối cảnh** — hệ thống này giữ danh tính người tố giác; rủi ro cao nhất không phải mất
   tiền mà là mất an toàn của một con người.
2. **Cách làm** — 5 giai đoạn, 12 ngày, có bước retest độc lập bắt buộc.
3. **Vì sao có bước retest độc lập** — vì code do AI viết và AI sửa; đợt này ghi nhận được
   N lỗi phát sinh do chính quá trình fix. Đây là điểm gây ấn tượng mạnh nhất với người
   nghe: nó cho thấy quy trình có tính hoài nghi được thiết kế sẵn, không phải chỉ tin AI.

**Slide kết:** rủi ro còn tồn đọng + roadmap. Kết thúc bằng cam kết có ngày tháng, không
kết thúc bằng "hệ thống đã an toàn" — không ai nói được câu đó một cách trung thực.

## 3. Checklist chốt D12
- [ ] Báo cáo tổng kết đủ 7 phần
- [ ] Bộ slide đủ: 3 slide mở đầu + 1 slide/lỗi Critical-High + slide kết
- [ ] Bug Log và Security Decision Log đã khoá, không còn ô trống
- [ ] Roadmap bảo trì đã có người chịu trách nhiệm và ngày cụ thể
- [ ] Cập nhật [docs/CHANGELOG-BAO-MAT.md](../CHANGELOG-BAO-MAT.md) với đợt rà soát này
- [ ] Cập nhật mục "Việc còn tồn đọng" trong `README.md` cho khớp thực tế sau đợt fix
