# Bản đồ tài liệu — Hộp Thư An Ninh Số

Vào đây trước. Mỗi tệp trong `docs/` có đúng một việc; bảng dưới nói tệp nào làm việc gì.

---

## Bạn là ai, đọc gì trước

| Bạn là | Đọc theo thứ tự này |
|---|---|
| **Người mới, muốn hiểu hệ thống** | [TONG-QUAN-HE-THONG.md](TONG-QUAN-HE-THONG.md) → [../README.md](../README.md) (cách chạy) |
| **Người lập trình, sắp làm việc với Claude** | [SO-TAY-NGUOI-LAP-TRINH.md](SO-TAY-NGUOI-LAP-TRINH.md) → [TIEN-DO.md](TIEN-DO.md) |
| **Người muốn biết dự án đang ở đâu** | [TIEN-DO.md](TIEN-DO.md) → [NO-KY-THUAT.md](NO-KY-THUAT.md) |
| **Người làm đợt kiểm thử bảo mật** | [kiem-thu-bao-mat/README.md](kiem-thu-bao-mat/README.md) |
| **Claude, mở một phiên làm việc** | [../CLAUDE.md](../CLAUDE.md) → [QUY-TRINH-LAM-VIEC.md](QUY-TRINH-LAM-VIEC.md) |

**Một tệp duy nhất đọc được thay cho tất cả nếu bạn vội:** [SO-TAY-NGUOI-LAP-TRINH.md](SO-TAY-NGUOI-LAP-TRINH.md).

---

## Cây thư mục

```
docs/
├── README.md                    ← bạn đang ở đây
│
├── SO-TAY-NGUOI-LAP-TRINH.md    CHO NGƯỜI: gõ lệnh gì, khi nào,
│                                 và làm sao biết Claude đang đi chệch
├── QUY-TRINH-LAM-VIEC.md        CHO CLAUDE: quy trình đầy đủ, 6 loại phiên,
│                                 luật retest độc lập, cổng chặn trước commit
│
├── TONG-QUAN-HE-THONG.md        Hệ thống này là gì, gồm những phần nào
├── adr/                         Quyết định kiến trúc, mỗi quyết định một tệp
│
├── TIEN-DO.md                   Nhật ký phiên — đang làm tới đâu   ← cập nhật liên tục
├── NO-KY-THUAT.md               Nợ đã biết nhưng cố ý chưa sửa      ← cập nhật liên tục
├── CHANGELOG-BAO-MAT.md         Các đợt vá bảo mật ĐÃ xong
│
└── kiem-thu-bao-mat/            Đợt kiểm thử bảo mật đang chạy
    ├── README.md                ← bản đồ riêng + tình trạng thật
    ├── KE-HOACH.md              Kế hoạch đang chạy, chia theo phiên
    ├── phuong-phap/             CÁCH LÀM — không đổi theo từng đợt
    ├── bieu-mau/                BIỂU MẪU để điền
    └── ket-qua/                 SẢN PHẨM từng phiên đã làm ra
```

Ba thư mục con của `kiem-thu-bao-mat/` chia theo **loại nội dung**, không theo thứ tự đọc:
`phuong-phap/` dạy cách làm, `bieu-mau/` là form trống, `ket-qua/` là thứ đã làm ra. Trước
đây cả ba nằm lẫn trong một thư mục phẳng và không ai phân biệt được.

---

## Tệp nào ở ngoài `docs/`

| Ở đâu | Chứa gì | Lên GitHub? |
|---|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | Bản rút gọn luôn được Claude nạp đầu mỗi phiên. 11 luật bất di bất dịch | Có |
| [`../README.md`](../README.md) | Cách cài, cách chạy, cách deploy | Có |
| `../.claude/commands/` | Năm lệnh mở và đóng phiên | Có |
| `../buglogs/` | **Lỗ hổng đang mở**, kịch bản khai thác, Bug Log đầy đủ | **Không** — đã gitignore |

**Luật vàng:** tài liệu trong `docs/` chỉ được nhắc **mã** `BUG-xxx`, không bao giờ mô tả
lỗ hổng đang mở. Đây là hệ thống giữ dữ liệu tố giác tội phạm và repo này public; danh sách
lỗ hổng chưa vá là bản đồ tấn công.

---

## Hai quy ước đọc tài liệu này

**1. Không tin con số chép trong tài liệu.** Số lượng test, số endpoint — luôn chạy lệnh đếm:

```bash
ls server/tests/*.test.js | wc -l
grep -rnoE "router\.(get|post|put|patch|delete)\(" server/src/routes | wc -l
```

Dự án đã ba lần có ba con số khác nhau cho cùng một thứ. Tài liệu giờ chỉ ghi **lệnh**, không
ghi số. Thấy con số cứng ở đâu trong `docs/` là thấy một lỗi cần sửa.

**2. Mọi tài liệu đều có ngày và có chủ.** Bảng nào không nói nó được cập nhật ở phiên nào
thì đừng tin nó phản ánh mã hiện tại. `TIEN-DO.md` là nguồn sự thật về "đang ở đâu".
