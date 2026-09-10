# CLAUDE.md — Hộp Thư An Ninh Số

Đọc file này trước khi làm bất cứ việc gì. Quy trình đầy đủ: [docs/QUY-TRINH-LAM-VIEC.md](docs/QUY-TRINH-LAM-VIEC.md).

---

## Hệ thống này là gì

Web tiếp nhận ý kiến, phản ánh, **tố giác tội phạm** của công dân, dùng cho Công an cấp cơ sở.

**Tài sản cần bảo vệ nhất: danh tính người tố giác.** Không phải tiền, không phải uptime.
Lộ danh tính là hậu quả không hoàn tác được và có thể ảnh hưởng tới an toàn thân thể của
một người thật. Khi phân vân giữa hai phương án, luôn chọn phương án bảo vệ người tố giác —
kể cả khi đó là để hệ thống **từ chối phục vụ** thay vì âm thầm chạy sai.

**Mô hình đe doạ:** (1) người ngoài đọc trộm danh tính · (2) **cán bộ tha hoá** tra danh tính
hồ sơ mình không phụ trách · (3) spam/bot làm nghẽn kênh tiếp nhận.

## Kiến trúc

| Phần | Công nghệ | Thư mục |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind | `src/` |
| Backend | Node/Express + MySQL, JWT, bcryptjs, helmet | `server/src/` |
| Schema & migration | SQL rời theo phiên bản | `database/` |
| Tài liệu | Tiếng Việt, có ADR | `docs/` |
| Nhật ký lỗ hổng | **Nội bộ, gitignored** | `buglogs/` |

Frontend chạy được **một mình** ở chế độ offline (localStorage), không bắt buộc có backend.

⚠️ Có **ba biến thể khởi động backend**: `server/src/index.js`, `may-chu-cong-khai.js`,
`may-chu-can-bo.js` (dùng chung `nen-tang.js`). Sửa lớp bảo vệ ở một file → **phải kiểm cả ba**.

## Lệnh hay dùng

```bash
npm run build                 # frontend: tsc + vite build (cổng kiểm kiểu)
npm run dev                   # frontend dev, cổng 3000
cd server && npm test         # backend: node --test, không cần MySQL
cd server && npm run dev      # backend dev, cổng 4000
```

**Không hard-code số liệu vào tài liệu.** Muốn biết bao nhiêu test, bao nhiêu endpoint thì
*chạy lệnh*, đừng chép lại con số. `README.md` hiện ghi một số, commit gần nhất ghi số khác,
đếm tĩnh ra số thứ ba — đó là hậu quả của việc chép số vào tài liệu.

```bash
ls server/tests/*.test.js | wc -l                                  # số file test
grep -rnoE "router\.(get|post|put|patch|delete)\(" server/src/routes | wc -l   # số endpoint
```

## Luật bất di bất dịch

1. **Fail-safe, không fail-open.** Thiếu cấu hình → từ chối phục vụ, không âm thầm chạy chế độ yếu. `JWT_SECRET`/`ENCRYPTION_KEY`/`HASH_PEPPER` thiếu là server không khởi động — cố ý, đừng "sửa" nó.
2. **Kiểm ở backend, luôn luôn.** Sửa frontend chỉ để trải nghiệm tốt hơn, không bao giờ tính là một lớp bảo vệ.
3. **IP chỉ lấy từ `req.ip`** (đã qua `trust proxy`). Không bao giờ tin header client tự đặt.
4. **Không đặt secret vào biến `VITE_*`.** Vite nhúng thẳng vào bundle JS, ai mở DevTools cũng đọc được.
5. **Allow-list, không deny-list.** Tên cột `ORDER BY`, loại file upload, origin CORS: liệt kê cái được phép.
6. **Mọi giới hạn đếm phải atomic.** `SELECT COUNT` rồi `INSERT` là sai — lách được bằng request song song.
7. **Một bug một commit.** Không gộp. Không chạy formatter toàn dự án chung với commit vá lỗi.
8. **Không tự chấm bài mình.** Phiên đã fix một lỗi **không được** là phiên xác nhận lỗi đó đã fix xong.
9. **Không sửa ngoài phạm vi.** Thấy vấn đề khác → ghi vào [docs/NO-KY-THUAT.md](docs/NO-KY-THUAT.md) hoặc mở BUG mới. Không tiện tay sửa.
10. **Không đưa lỗ hổng đang mở lên GitHub.** Chi tiết lỗ hổng sống chỉ nằm trong `buglogs/` (đã gitignore). Tài liệu công khai chỉ nhắc **mã** `BUG-xxx`.

## Làm việc theo phiên

Mỗi phiên Claude có **một loại** và **một mục tiêu đóng được**.

| Loại | Được làm | Cấm |
|---|---|---|
| `KHAO-SAT` | Đọc code, kiểm kê, vẽ luồng | Sửa code |
| `RA-SOAT` | Tìm lỗ hổng, ghi Bug Log | Sửa code — thấy lỗi thì **ghi**, không vá |
| `FIX` | Viết test đỏ **trước**, rồi sửa, rồi commit | Retest chính bug mình vừa fix |
| `RETEST` | Chạy lại kịch bản gốc, đọc diff, kết luận | Sửa code; đọc lại giải thích của phiên FIX |
| `TINH-NANG` | Thêm/sửa tính năng kèm test | Đụng bản vá bảo mật đang mở |
| `TAI-LIEU` | Viết, sửa, đồng bộ tài liệu | Sửa code |

**Mở phiên:** `/bat-dau-phien` · **Đóng phiên:** `/ket-thuc-phien` · **Kiểm độc lập:** `/phien-retest BUG-xxx`

`FIX(BUG-X)` và `RETEST(BUG-X)` **bắt buộc là hai phiên khác nhau**. Nếu người dùng yêu cầu
retest ngay trong phiên vừa fix, hãy từ chối và giải thích: phiên vừa bỏ công sửa đang ở
trạng thái cần chứng minh mình làm đúng, nên sẽ đọc diff của chính nó một cách khoan dung.
Đây là vấn đề cấu trúc, không phải vấn đề cố gắng.

## Trạng thái hiện tại

| Xem gì | Ở đâu |
|---|---|
| Đang làm tới đâu | [docs/TIEN-DO.md](docs/TIEN-DO.md) |
| Nợ kỹ thuật đã biết | [docs/NO-KY-THUAT.md](docs/NO-KY-THUAT.md) |
| Quyết định kiến trúc | [docs/adr/](docs/adr/) |
| Đợt vá bảo mật đã xong | [docs/CHANGELOG-BAO-MAT.md](docs/CHANGELOG-BAO-MAT.md) — **đọc trước khi kết luận lỗi mới**, tránh báo trùng thứ đã vá |
| Kế hoạch audit đang chạy | [docs/kiem-thu-bao-mat/](docs/kiem-thu-bao-mat/) |
| Lỗ hổng đang mở | `buglogs/` (chỉ có trên máy, không lên GitHub) |

## Viết code và tài liệu

- **Tiếng Việt** cho tài liệu, comment, tên biến nghiệp vụ — dự án đã theo lối này, giữ nguyên.
- Comment giải thích **vì sao**, không giải thích *cái gì*. Code trong `server/src/lib/chan-spam.js` là mẫu tốt: nói rõ đánh đổi đã chấp nhận và vì sao.
- Commit: tiếng Việt **không dấu** ở dòng tiêu đề, thân commit ghi rõ vì sao + kết quả kiểm thử.
