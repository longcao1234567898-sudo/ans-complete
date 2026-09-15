# Quy trình làm việc theo phiên — Hộp Thư An Ninh Số

Quy trình chuẩn để làm việc với Claude trên dự án này. Áp dụng cho **mọi loại việc**:
thêm tính năng, sửa lỗi, rà soát bảo mật, viết tài liệu.

Bản rút gọn luôn được nạp: [`CLAUDE.md`](../CLAUDE.md). File này là bản đầy đủ.

---

## 1. Vì sao cần quy trình

Dự án được viết phần lớn bởi AI qua nhiều phiên rời rạc. Bốn hệ quả đã thấy được trong repo:

| Triệu chứng | Bằng chứng |
|---|---|
| Tài liệu lệch thực tế | `README.md` ghi một số lượng test, commit gần nhất ghi số khác, đếm tĩnh ra số thứ ba |
| Commit gộp khổng lồ | `COMMIT.txt` dùng `git add . && git commit` — một commit nhiều việc không liên quan, không revert riêng được |
| Không có trí nhớ giữa phiên | Mỗi phiên bắt đầu từ số 0, hỏi lại thứ đã biết, sửa lại thứ đã sửa |
| Việc dở không để lại dấu | Phiên đứt giữa chừng thì phiên sau không biết đang ở đâu |

Thêm một ràng buộc cứng từ kế hoạch kiểm thử bảo mật: **người/AI đã fix không được tự xác
nhận đã fix đúng**. Ràng buộc đó chỉ thực thi được bằng cấu trúc phiên tách bạch, không thể
dựa vào lời hứa.

## 2. Sáu loại phiên

Mỗi phiên có **đúng một loại**. Đây là cơ chế chính để chống trôi phạm vi và để thực thi
nguyên tắc kiểm độc lập.

| Loại | Được làm | Cấm | Đầu ra |
|---|---|---|---|
| `KHAO-SAT` | Đọc code, kiểm kê, vẽ luồng dữ liệu, đo đạc | Sửa code | Tài liệu mô tả |
| `RA-SOAT` | Tìm lỗ hổng theo checklist, ghi Bug Log | Sửa code — thấy lỗi thì **ghi**, không vá | Bug Log |
| `FIX` | Viết test đỏ **trước**, rồi sửa, rồi commit | Retest chính bug mình vừa fix; sửa ngoài phạm vi BUG đang xử lý | Commit + test |
| `RETEST` | Chạy lại kịch bản gốc, đọc diff, kết luận | Sửa code; đọc lại giải thích của phiên FIX | Bug Log Phần 3 |
| `TINH-NANG` | Thêm/sửa tính năng kèm test | Đụng bản vá bảo mật đang mở | Commit + test |
| `TAI-LIEU` | Viết, sửa, đồng bộ tài liệu | Sửa code | Tài liệu |

### Luật chuyển tiếp

1. **Một phiên một loại.** Muốn đổi loại → kết thúc phiên, mở phiên mới.
2. **`FIX(BUG-X)` và `RETEST(BUG-X)` bắt buộc là hai phiên khác nhau.**
3. Phiên `RETEST` mở bằng `/phien-retest`, chỉ nạp: Bug Log của BUG-X + `git diff` + bộ test.
4. Yêu cầu "fix rồi kiểm luôn" phải bị **từ chối**, kèm giải thích.

> **Vì sao luật 2 không thoả hiệp được:** một phiên vừa bỏ công sửa xong đang ở trạng thái
> cần chứng minh mình làm đúng. Trạng thái đó khiến nó đọc diff của chính mình một cách khoan
> dung, chạy đúng những test nó biết sẽ pass, và diễn giải kết quả mơ hồ theo hướng có lợi.
> Đây là vấn đề cấu trúc, không phải vấn đề thiện chí — nên phải giải bằng cấu trúc.

## 3. Vòng đời một phiên

```
/bat-dau-phien  ────────►  [làm việc]  ────────►  /ket-thuc-phien
      │                                                  │
      ├─ 1. Đọc TIEN-DO.md + NO-KY-THUAT.md              ├─ 1. Đối chiếu việc làm vs mục tiêu
      ├─ 2. ⚠️ Phát hiện phiên bỏ dở                     ├─ 2. ⚠️ Cổng DoD (7 mục)
      ├─ 3. Kiểm môi trường chạy được                    ├─ 3. Commit từng việc một
      ├─ 4. Xác định loại phiên                          ├─ 4. Cập nhật TIEN-DO.md
      ├─ 5. Kiểm Definition of Ready                     ├─ 5. Cập nhật tài liệu (bảng §6)
      ├─ 6. Cảnh báo nợ / luật / rủi ro                  ├─ 6. Ghi nợ kỹ thuật phát sinh
      ├─ 7. Đề xuất kế hoạch phiên                       ├─ 7. Ghi việc còn dở
      └─ 8. ⚠️ Ghi ĐANG CHẠY vào TIEN-DO                 └─ 8. Chốt phiên
```

**Hai bước có dấu ⚠️ ở đầu là quan trọng nhất**, vì chúng xử lý failure mode phổ biến nhất:
phiên đứt giữa chừng. Ghi trạng thái ở **đầu** phiên chứ không phải cuối — nếu chỉ ghi lúc
kết thúc thì đúng những phiên hỏng lại là những phiên không để lại dấu vết.

## 4. Definition of Ready — điều kiện vào phiên

Bốn điều. Thiếu bất kỳ điều nào → hỏi cho rõ **trước khi** làm.

- [ ] **Mục tiêu viết được thành một câu**, có động từ và đối tượng cụ thể
- [ ] **Tiêu chí xong đo được** — lệnh nào chạy, kết quả nào chứng minh
- [ ] **Biết trước sẽ đụng file nào**
- [ ] **Không phụ thuộc việc chưa xong** ở phiên khác

Kèm theo: **WIP = 1**. Một phiên một mục tiêu đóng được. Phiên ôm quá rộng sẽ cạn ngữ cảnh
giữa chừng và bỏ dở không dấu vết — thà cắt nhỏ còn hơn.

Và một mục bắt buộc trong kế hoạch phiên: **NGOÀI PHẠM VI PHIÊN NÀY**. Đây là hàng rào chống
trôi phạm vi, không phải hình thức.

## 5. Definition of Done — cổng chặn trước commit

| # | Kiểm | Cách kiểm |
|---|---|---|
| 1 | Test backend xanh **toàn bộ** | `cd server && npm test` |
| 2 | Frontend build + kiểu sạch | `npm run build` (khi có đụng `src/`) |
| 3 | Diff đã đọc từng file | Đối chiếu bảng dấu hiệu đáng ngờ §5.1 |
| 4 | Không secret lọt vào | Soát diff tìm chuỗi dài, khoá, mật khẩu, token |
| 5 | Không file ngoài phạm vi | File lạ trong `git diff --stat` → tách hoặc hoàn nguyên |
| 6 | Tài liệu đã đồng bộ | Bảng ánh xạ §6 |
| 7 | Số liệu là số **đo được** | Chạy lệnh đếm, không chép từ trí nhớ |

**Không đủ 7 mục → không commit.** Ghi lý do vào `TIEN-DO.md` với trạng thái `KHÔNG COMMIT`.

### 5.1 Bảng dấu hiệu đáng ngờ khi đọc diff

| Dấu hiệu | Vì sao đáng ngờ |
|---|---|
| File bị chạm ngoài phạm vi mục tiêu | "Tiện tay sửa thêm" — nguồn lỗi mới phổ biến nhất |
| Kiểm tra bị **nới lỏng** ở chỗ khác | Vá chỗ A bằng cách nới chỗ B cho hết đỏ test |
| `catch {}` mới nuốt lỗi im lặng | Biến lỗi thành fail-open |
| Điều kiện `&&` đổi thành `\|\|` | Cách kinh điển làm hỏng kiểm quyền |
| Test bị **sửa** thay vì thêm | Sửa kỳ vọng cho khớp code sai |
| `authorize()` bị bỏ hoặc thêm vai trò | Nới quyền để "cho chạy được" |
| Biến môi trường mới có giá trị mặc định | Mặc định thường yếu → fail-open |
| Comment "tạm thời", "TODO", "xử lý sau" | Vá triệu chứng, không vá gốc rễ |

## 6. Bảng ánh xạ code ↔ tài liệu

| Đụng vào | Phải cập nhật |
|---|---|
| Thêm/xoá endpoint | `docs/kiem-thu-bao-mat/01-GIAI-DOAN-1-KIEM-KE.md`, `server/README.md` |
| Đổi giới hạn nghiệp vụ (rate limit, quota, kích thước) | Bảng §2.2 của `01-GIAI-DOAN-1-KIEM-KE.md` |
| Đổi biến môi trường | `.env.example`, `server/.env.example`, `render.yaml`, `README.md` |
| Đổi schema DB | File `database/nang_cap_vXX.sql` mới + `README.md` (thứ tự import) |
| Quyết định kiến trúc | ADR mới trong `docs/adr/` |
| Vá bảo mật | `buglogs/` (nội bộ) · `docs/CHANGELOG-BAO-MAT.md` chỉ sau khi đã retest xong |
| Thêm/bớt test | **Không chép số vào đâu cả** — tài liệu chỉ ghi *lệnh đếm* |

## 7. Kỷ luật commit

**Một bug / một việc = một commit. Push thẳng, không squash.**

Lịch sử cũ của dự án là những commit gộp khổng lồ (`COMMIT.txt` dùng `git add . && git commit`).
Cách đó đã nghỉ hưu: nó làm mất khả năng revert riêng từng bản vá, và khi AI sửa lan sang chỗ
khác thì không tách bạch được cái gì gây ra cái gì.

Mẫu commit — tiếng Việt **không dấu** ở tiêu đề, theo lối sẵn có của dự án:

```
<Mo ta ngan viec da lam> [BUG-xxx neu co]

VAN DE: <mot cau — vi sao phai sua>
CACH SUA: <mot den hai cau>
ANH HUONG: <file/luong nao bi cham toi>
KIEM THU: <n/n dat> · TypeScript: <n loi>
```

Chỉ ghi con số kiểm thử **thật sự vừa chạy được**.

**Không** chạy formatter/linter toàn dự án chung với commit vá lỗi.

## 8. Đường lùi

`/bat-dau-phien` ghi SHA mốc vào `TIEN-DO.md` trước khi làm việc. Khi cần lùi:

```bash
git log --oneline <SHA-mốc>..HEAD    # xem phiên này đã commit gì
git revert <SHA>                      # lùi một commit cụ thể
```

Dùng `git revert`, **không** dùng `reset --hard`: commit đã push lên GitHub, viết lại lịch sử
chung là chuyện khác hẳn.

Vì mỗi bug một commit nên revert được đúng một bản vá mà không đụng những bản vá khác — đây
chính là lợi ích đổi lấy việc bỏ thói quen gộp commit.

## 9. Hai tầng tài liệu

| Tầng | Ở đâu | Chứa gì | Lên GitHub? |
|---|---|---|---|
| **Công khai** | `docs/` | Phương pháp, quy trình, kiến trúc, tiến độ, nợ kỹ thuật | Có |
| **Nội bộ** | `buglogs/` | Lỗ hổng đang mở, kịch bản khai thác, Bug Log đầy đủ | **Không** — đã gitignore |

**Luật vàng:** tài liệu công khai chỉ nhắc **mã** `BUG-xxx`, không bao giờ mô tả lỗ hổng
đang mở. `docs/TIEN-DO.md` cũng công khai — áp dụng đúng luật này.

Lý do: đây là hệ thống giữ dữ liệu tố giác tội phạm, repo đẩy lên GitHub. Danh sách lỗ hổng
chưa vá là bản đồ tấn công. Cùng nguyên tắc đã áp dụng cho tài liệu phân tích đợt vá
2026-08-03 (xem `docs/CHANGELOG-BAO-MAT.md`).

`buglogs/` có **git repo riêng lồng bên trong** để vẫn có lịch sử phiên bản — xem `buglogs/README.md`.

## 10. Ánh xạ sang chuẩn doanh nghiệp

Quy trình này không phát minh gì mới, chỉ áp các thực hành đã có tên vào bối cảnh làm việc
với AI theo phiên:

| Thực hành ở đây | Chuẩn tương ứng | Mục đích gốc |
|---|---|---|
| Definition of Ready / Definition of Done | Scrum | Không bắt đầu việc mơ hồ, không tuyên bố xong khi chưa xong |
| WIP = 1, một phiên một mục tiêu | Kanban | Giảm việc dở dang, tăng tỉ lệ hoàn thành |
| Mỗi bug một commit, push thẳng `master` | Trunk-based development | Thay đổi nhỏ, tích hợp liên tục, revert được |
| `FIX` ≠ `RETEST` (khác phiên) | **Segregation of duties** — ISO 27001 A.5.3, SOX | Người thực hiện không được là người phê duyệt |
| BUG-xxx ↔ commit ↔ test ↔ kết quả retest | Traceability matrix | Chứng minh mọi yêu cầu đều được kiểm chứng |
| `docs/adr/` | Architecture Decision Records | Quyết định có lý do, tra lại được |
| `docs/NO-KY-THUAT.md` | Technical debt register | Nợ được ghi nhận thay vì bị quên |
| Mục "Bài học" trong báo cáo tổng kết | Post-implementation review | Cải tiến quy trình dựa trên số liệu thật |
| Bug Log có thang mức độ 2 trục | CVSS-lite / risk matrix | Ưu tiên theo rủi ro, không theo cảm tính |

Điểm khác biệt duy nhất so với môi trường doanh nghiệp thông thường: ở đây "người thực hiện"
và "người kiểm" đều có thể là AI. Nên sự tách bạch phải được dựng bằng **ranh giới phiên**
và **test tự động làm trọng tài**, thay vì bằng hai con người khác nhau.

## 11. Mẫu ghi nhật ký phiên

Một dòng trong `docs/TIEN-DO.md`:

| Cột | Nội dung |
|---|---|
| Mã phiên | `P01`, `P02`… liên tục, không tái sử dụng |
| Ngày | YYYY-MM-DD |
| Loại | Một trong sáu loại |
| Mục tiêu | Một câu |
| Trạng thái | `ĐANG CHẠY` / `XONG` / `XONG MỘT PHẦN` / `KHÔNG COMMIT` / `BỎ DỞ` |
| SHA mốc | SHA lúc bắt đầu phiên (để lùi) |
| Commit | SHA các commit phiên tạo ra |
| Việc còn dở | Ngắn gọn, viết cho **người lạ** đọc |

## 12. Câu hỏi thường gặp

**Phiên trước bỏ dở, giờ làm sao?**
`/bat-dau-phien` tự phát hiện ở bước 2 và hỏi bạn: tiếp tục, hay đóng lại rồi mở phiên mới.

**Đang làm giữa chừng thì thấy một lỗi khác, sửa luôn được không?**
Không. Ghi vào `NO-KY-THUAT.md` (nếu là chất lượng) hoặc mở `buglogs/bugs/BUG-xxx.md` (nếu
là bảo mật). Sửa ngoài phạm vi là nguồn lỗi mới số một khi AI vá lỗi.

**Không cài `node_modules` thì có commit được không?**
Không qua được cổng DoD mục 1–2. `/bat-dau-phien` cảnh báo ngay ở bước 3 để bạn biết trước,
chứ không để tới cuối phiên mới phát hiện.

**Một phiên nên dài bao nhiêu?**
Đo bằng mục tiêu chứ không đo bằng thời gian: một mục tiêu đóng được. Nếu tới giữa phiên thấy
mục tiêu quá lớn, dừng lại, đóng phiên với trạng thái `XONG MỘT PHẦN`, ghi rõ phần còn lại.
