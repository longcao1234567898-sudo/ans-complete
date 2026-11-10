# Bộ tài liệu Word — Hộp Thư An Ninh Số

Bộ tài liệu dùng để **hiểu, trình bày, tập huấn và bàn giao** trang web (tên trên màn hình: *Điểm Chạm
An Ninh*). Bản cập nhật ngày **10/11/2026**: mọi con số đếm lại từ mã nguồn và từ một cơ sở dữ liệu
MySQL 8.0 đã chạy đủ các tệp nâng cấp tới `nang_cap_v40.sql`.

Mở tệp **0_MUC_LUC.docx** trước — nó nói dùng tài liệu nào khi nào và đã đổi gì so với bản 25/08/2026.

| # | Tệp | Dùng khi |
|---|---|---|
| 0 | `0_MUC_LUC.docx` | Mục lục, số liệu chính, nơi hệ thống đang chạy |
| 1 | `1_TAI_LIEU_TONG_THE.docx` | Viết báo cáo, chuẩn bị trình bày |
| 2 | `2_NGAN_HANG_PHAN_BIEN.docx` | Ôn câu hỏi phản biện |
| 3 | `3_CAM_NANG_QUAN_TRI.docx` | Quản trị hằng ngày (cán bộ, tin tức, hạn xử lý) |
| 4 | — | *Cẩm nang đổi tên đơn vị: không có trong bộ tải lên lần này* |
| 5 | `5_CAM_NANG_DOI_DATABASE.docx` | Đổi nhà cung cấp kho dữ liệu |
| 6 | `6_CAM_NANG_DOI_KHOA_MA_HOA.docx` | Nghi khoá mã hoá bị lộ |
| 7 | `7_HO_SO_CHUYEN_TAI_KHOAN.docx` | Hồ sơ lần chuyển tài khoản 02/08/2026 |
| 8 | `8_DANH_SACH_TU_KHOA.docx` | Giải trình cơ chế phân loại — trích tự động từ mã nguồn |
| 9 | `9_DE_XUAT_NGUOI_YEU_THE.docx` | Đề xuất cho người lớn tuổi, vùng sâu — kèm bảng đã làm / chưa làm |
| 10 | `HUONG_DAN_TINH_NANG_MOI.docx` | Các tính năng bổ sung |
| 11 | `CAM_NANG_XU_LY_SU_CO.docx` | Cán bộ trực dùng khi hệ thống hỏng |
| 12 | `HUONG_DAN_CAI_MAY_MOI.docx` | Cài môi trường làm việc trên máy Windows mới |
| 13 | `HUONG_DAN_TACH_HAI_MAY_CHU.docx` | Tách / gộp máy chủ khi còn chạy thử trên Render |
| 14 | `14_KICH_BAN_TRINH_BAY.docx` | **Mới.** Kịch bản trình diễn trang web 20 phút |
| 15 | `15_HUONG_DAN_NGUOI_DAN.docx` | **Mới.** In phát cho bà con |
| 16 | `16_HUONG_DAN_CAN_BO.docx` | **Mới.** Tập huấn cán bộ và lãnh đạo |
| 17 | `17_TOM_TAT_KIEM_THU_BAO_MAT.docx` | **Mới.** Tóm tắt đợt kiểm thử bảo mật — chỉ mã lỗi và trạng thái |

## Luật cho bộ tài liệu này

- **Kho mã nguồn đang công khai.** Không đưa vào tệp nào: khoá, mật khẩu, địa chỉ kho dữ liệu, tên
  tài khoản dịch vụ, chi tiết cách khai thác lỗ hổng. Bản cập nhật này đã bỏ địa chỉ và tên tài khoản
  Aiven có trong bản 25/08/2026.
- Số liệu trong tài liệu là ảnh chụp ngày 10/11/2026. Muốn số mới thì **đếm lại bằng lệnh** (xem
  `CLAUDE.md`), đừng chép số cũ sang bản sau.
- Tài liệu triển khai lên Viettel nằm ở dạng Markdown, không nằm trong bộ Word này:
  [`../SO-TAY-TRIEN-KHAI.md`](../SO-TAY-TRIEN-KHAI.md), [`../HUONG-DAN-TRIEN-KHAI.md`](../HUONG-DAN-TRIEN-KHAI.md).
