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

### 2.1 Khi nào **bắt buộc** mở phiên RETEST độc lập

Luật chuyển tiếp số 2 nói `FIX` và `RETEST` phải tách phiên. Nó không nói khi nào thì
**phải có** một phiên RETEST. Thiếu chỗ đó, bản vá đến từ ngoài kế hoạch sẽ trôi vào
`master` mà không ai chấm.

Điều kiện kích hoạt **không phải** "vừa có lỗi được vá". Nó là **ai đứng ra chấm đạt**.

Bắt buộc mở phiên RETEST độc lập khi cả **ba** điều sau cùng đúng:

1. Thay đổi nhằm **đóng một lỗ hổng**, không phải thêm tính năng.
2. Người kết luận "đã xong" **trùng** với người viết bản vá — kể cả khi đó là hai phiên
   Claude khác nhau nhưng phiên sau đã đọc lời giải thích của phiên trước.
3. Bản vá hụt thì hậu quả **không hoàn tác được**: lộ danh tính người tố giác, leo quyền,
   đọc trộm hồ sơ.

#### Bốn dấu hiệu buộc phải retest kể cả khi ngoài kế hoạch

Đây là phần đắt nhất của luật này, vì nó bắt những ca không ai định trước:

| Dấu hiệu | Vì sao | Ví dụ thật trong dự án |
|---|---|---|
| Một commit **từ bên ngoài** chạm vào file đang có BUG mở | Người sửa không biết file đó đang nằm trong diện rà soát, nên không sửa theo danh sách biến thể đã ghi | `22a588d` sửa `middleware/auth.js` trong khi BUG-001 và BUG-003 đều trỏ vào file đó |
| Bản vá kèm câu "toàn bộ test pass" mà **không nói bài test nào đỏ trước khi vá** | Test viết sau bản vá chỉ chứng minh code chạy đúng như tác giả nghĩ, không chứng minh lỗ hổng đã bịt | Commit ghi "339/339 dat" — con số đúng, và không nói gì về ba biến thể mà Bug Log đã liệt kê sẵn |
| Bản vá chạm **nhiều file hơn phạm vi của lỗi** | Mỗi file thừa là một cơ hội sinh lỗi mới; đây là nguồn lỗi số một khi AI vá lỗi | |
| Lỗ hổng bị đóng như **tác dụng phụ** của việc khác | Không ai chủ ý, không ai ghi lại, nên lần refactor sau nó mở lại mà không ai biết | Kiểm `is_active` thêm vào cho BUG-003 có thể đã chặn luôn BUG-001 — chưa ai xác nhận |

#### Khi nào **không** cần retest độc lập

Đừng biến luật này thành nghi lễ. Không cần khi: đổi giao diện, đổi văn bản hiển thị,
thêm tính năng không chạm lớp bảo vệ, refactor đã có test bao phủ sẵn, sửa tài liệu.

#### Hai mức độ độc lập — dùng cái nào

| Mức | Cách làm | Dùng cho | Điểm yếu |
|---|---|---|---|
| **Mạnh** | Phiên Claude hoàn toàn mới, chạy `/phien-retest BUG-xxx` | `Critical`, `High`, và mọi ca dính bốn dấu hiệu trên | Tốn một phiên |
| **Nhẹ** | Subagent làm trọng tài ngay trong phiên (xem §2.2) | `Medium`, `Low`, sàng lọc sơ bộ trước khi gọi mức mạnh | Vẫn do phiên cha ra đề, nên vẫn thừa hưởng điểm mù của phiên cha |

Mức nhẹ **không thay thế** mức mạnh cho `Critical` và `High`. Nó là lớp sàng đầu, để mức
mạnh không phải tốn phiên vào những bản vá hỏng lộ liễu.

### 2.2 Subagent làm trọng tài độc lập trong phiên

Một subagent khởi động **không có ký ức** về phiên cha: không thấy cuộc hội thoại, không
thấy lời giải thích của người vừa vá, chỉ thấy đúng những gì đề bài đưa cho. Về mặt ngữ
cảnh, đó là độc lập thật.

Chỗ nó **không** độc lập: phiên cha là người ra đề. Phiên cha bỏ sót biến thể nào thì
subagent cũng không được giao biến thể đó.

Cách dùng để bù điểm yếu ấy:

- **Lấy đề bài từ Bug Log, không từ trí nhớ phiên cha.** Chép nguyên kịch bản khai thác
  và danh sách biến thể trong `buglogs/bugs/BUG-xxx.md` vào đề bài.
- **Không kể cho subagent nghe bản vá làm gì.** Chỉ đưa: mã lỗi, kịch bản gốc, phạm vi
  diff, và câu hỏi "lỗ hổng này còn khai thác được không".
- **Hỏi kết luận có bằng chứng.** Kết luận không kèm output lệnh không được tính.
- **Ghi rõ trong Bug Log Phần 3 là mức độ độc lập `nhẹ`** — để báo cáo tổng kết không
  nhầm nó với một phiên retest thật.


## 3. Vòng đời một phiên

```
/bat-dau-phien  ────────►  [làm việc]  ────────►  /ket-thuc-phien
      │                                                  │
      ├─ 1. Đọc TIEN-DO.md + NO-KY-THUAT.md              ├─ 1. Đối chiếu việc làm vs mục tiêu
      ├─ 2. ⚠️ Kiểm lệch nhánh thượng nguồn              ├─ 2. ⚠️ Cổng DoD (7 mục)
      ├─ 3. ⚠️ Phát hiện phiên bỏ dở                     ├─ 3. Commit từng việc một
      ├─ 4. Kiểm môi trường chạy được                    ├─ 4. Cập nhật TIEN-DO.md
      ├─ 5. Xác định loại phiên                          ├─ 5. Cập nhật tài liệu (bảng §6)
      ├─ 6. Kiểm Definition of Ready                     ├─ 6. Ghi nợ kỹ thuật phát sinh
      ├─ 7. Cảnh báo nợ / luật / rủi ro                  ├─ 7. Ghi việc còn dở
      ├─ 8. Đề xuất kế hoạch phiên                       └─ 8. Chốt phiên
      └─ 9. ⚠️ Ghi ĐANG CHẠY vào TIEN-DO
```

**Ba bước có dấu ⚠️ ở đầu là quan trọng nhất**, vì chúng xử lý ba failure mode đã thật sự
xảy ra trong dự án này:

| Bước | Failure mode nó chặn | Đã xảy ra chưa |
|---|---|---|
| 2. Kiểm lệch nhánh | Rà soát trên một bản mã không còn là bản đang chạy | **Rồi** — P01, P02, P03 đều rà trên bản đã lỗi thời 19 commit |
| 3. Phát hiện phiên bỏ dở | Mở phiên mới đè lên phiên treo, mất dấu việc dở | Chưa |
| 9. Ghi `ĐANG CHẠY` ngay | Phiên đứt giữa chừng không để lại dấu vết | Chưa |

Ghi trạng thái ở **đầu** phiên chứ không phải cuối — nếu chỉ ghi lúc kết thúc thì đúng
những phiên hỏng lại là những phiên không để lại dấu vết.

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
| 8 | **Không tệp nhạy cảm nào đang bị theo dõi** | Lệnh ở ngay dưới — phải không in ra dòng nào |

```bash
git ls-files | grep -iE "sao-luu/|(^|/)\.env($|\.)|ca\.pem$|\.sql\.bak$|^buglogs/" | grep -v "\.env\.example"
```

**Không đủ 8 mục → không commit.** Ghi lý do vào `TIEN-DO.md` với trạng thái `KHÔNG COMMIT`.

**Mục 8 khác hẳn bảy mục trên: nó không soát diff, nó soát toàn bộ cây tệp đang được theo
dõi.** Bảy mục đầu chỉ nhìn thay đổi của phiên hiện tại, nên một tệp đã bị `git add` từ lâu
là vô hình với chúng. `.gitignore` cũng không cứu: luật ignore **chỉ áp dụng cho tệp chưa
được theo dõi**, nên thêm luật vào đó **không** gỡ được thứ đã lỡ commit — phải
`git rm --cached`.

Ngày 2026-09-23, khi quét an toàn trước lần push đầu tiên, phát hiện một bản sao lưu toàn bộ
cơ sở dữ liệu đã nằm công khai trên GitHub đúng theo đường đó. Nó sống sót qua năm phiên vì
không phiên nào nhìn ra ngoài diff của chính mình. Chi tiết: BUG-005 trong `buglogs/`.

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
| Thêm/xoá endpoint | `docs/kiem-thu-bao-mat/phuong-phap/1-kiem-ke.md`, `server/README.md` |
| Đổi giới hạn nghiệp vụ (rate limit, quota, kích thước) | Bảng §2.2 của `docs/kiem-thu-bao-mat/phuong-phap/1-kiem-ke.md` |
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

## 13. Làm việc song song với người khác trên cùng repo

Quy trình này ban đầu giả định **một người, nhiều phiên**. Giả định đó đã sai một lần và
tốn ba phiên rà soát.

### Chuyện đã xảy ra

Ngày 2026-09-10, phiên P00 đóng ở commit `d8d11a9`. Từ đó hai nhánh đi song song mà không
bên nào biết:

| | Ở máy | Trên GitHub |
|---|---|---|
| Nội dung | 13 commit tài liệu audit P01–P03 | 19 commit tính năng và vá bảo mật |
| Chạm vào | `docs/` | `src/`, `server/`, `database/` |
| Push chưa | Chưa | Rồi |

Hậu quả, phát hiện ngày 2026-09-23:

1. **Bảng kiểm kê endpoint của P01 sai.** 66 endpoint lúc kiểm, 78 lúc phát hiện.
2. **BUG-003 đã bị vá bởi người không biết nó là BUG-003** — không có test đỏ trước, không
   có SEC-DEC, và theo chính danh sách biến thể trong Bug Log thì mới đóng được một trong ba.
3. **BUG-001 mức Critical có thể đã bị vá tình cờ** — tác dụng phụ của bản vá trên, không ai
   chủ ý và không ai ghi lại.
4. **Luật `.gitignore` giữ `buglogs/` ở máy bị xoá** trong một commit thêm bộ đếm lượt truy
   cập. Cùng lúc `COMMIT.txt` chứa `git add . && git push` quay trở lại. Hai thứ đó gặp nhau
   là toàn bộ nhật ký lỗ hổng chưa vá lên GitHub công khai.

Điểm 4 là điểm đáng sợ nhất, vì không ai cố ý và không ai nhận ra.

### Luật rút ra

1. **Mọi phiên bắt đầu bằng `git fetch` và đối chiếu.** Đã đưa thành bước 2 của `/bat-dau-phien`.
2. **Lệch nhánh thì hợp nhất trước, rà soát sau.** Không có ngoại lệ. Rà soát trên bản cũ
   không phải là rà soát chậm, nó là rà soát vứt đi.
3. **Merge, không rebase, không force-push.** Nhánh kia đã public; viết lại lịch sử chung là
   chuyện khác hẳn (§8).
4. **Sau mỗi lần merge, kiểm ba thứ trước khi làm gì tiếp:**

```bash
git check-ignore -v buglogs/BUG-LOG.md            # luat gitignore con khong
git diff --stat <diem-re>..origin/master -- server/ database/   # ben kia cham gi
git log --oneline <diem-re>..origin/master --grep="va\|lo hong\|bao mat"  # co va bao mat khong
```

5. **Bản vá bảo mật đến từ ngoài kế hoạch phải đi qua RETEST** — §2.1, bốn dấu hiệu.

### Nếu người kia cũng dùng Claude

Thì bên đó cũng nên chạy quy trình này, hoặc tối thiểu là ba điều: một việc một commit,
không `git add .`, và không đụng `.gitignore` chung với việc khác. Gửi cho họ
[SO-TAY-NGUOI-LAP-TRINH.md](SO-TAY-NGUOI-LAP-TRINH.md).

Nếu không thoả thuận được, thì coi mọi commit từ bên đó là **mã chưa được kiểm**, và rà soát
nó như rà soát mã của người lạ. Tốn công hơn, nhưng đó là cái giá của việc không thoả thuận.

## 14. Dùng skill bảo mật do Anthropic phát hành

Claude Code có sẵn vài skill rà soát không phải do dự án này viết. Chúng **bổ sung**, không
thay thế, quy trình phiên ở trên.

| Skill | Làm gì | Chỗ hợp trong quy trình này |
|---|---|---|
| `/security-review` | Rà soát bảo mật phần thay đổi đang chờ trên nhánh hiện tại | Chạy ở cuối phiên `FIX` và phiên `TINH-NANG`, trước khi commit. Nó đọc diff bằng một danh sách khác với danh sách của dự án, nên bắt được thứ checklist mình bỏ sót |
| `/code-review` | Rà lỗi đúng-sai và chỗ rườm rà trong diff, nhiều mức công sức | Chạy khi bản vá đụng nhiều file. Mức `high` trở lên chịu khó báo cả thứ chưa chắc |
| `/code-review ultra` | Rà nhiều tác nhân, chạy trên cloud | Dùng cho bản vá `Critical`. **Người dùng tự gõ**, Claude không tự khởi động được |

### Giới hạn phải biết trước khi tin

- **Chúng không biết mô hình đe doạ của dự án này.** Không skill nào biết rằng tài sản cần
  bảo vệ nhất ở đây là danh tính người tố giác, hay rằng có ba biến thể khởi động backend
  phải kiểm cả ba. Checklist trong `docs/kiem-thu-bao-mat/` mới biết.
- **Chúng đọc diff, không đọc Bug Log.** Nên chúng không biết danh sách biến thể cần thử của
  BUG-xxx, và không kết luận được "bản vá này đã đóng hết biến thể chưa".
- **Chạy trong phiên đã vá thì vẫn là cùng một phiên.** `/security-review` gọi trong phiên
  `FIX` không đạt mức độc lập mạnh. Nó dùng một checklist khác, thế là tốt, nhưng không
  thay thế `/phien-retest`.
- Riêng `/code-review ultra` chạy tách hẳn trên cloud nên **đạt mức độc lập mạnh** — đây là
  ngoại lệ duy nhất, và đổi lại là tốn phí.

### Thứ tự đề nghị cho một bản vá `Critical`

```
/phien-fix BUG-xxx
   ├─ test đỏ trước
   ├─ vá
   ├─ trọng tài subagent          (độc lập nhẹ)
   └─ /security-review            (checklist khác, cùng phiên)
        │
        ▼
   [đóng phiên, mở phiên Claude MỚI]
        │
        ▼
/phien-retest BUG-xxx             (độc lập mạnh — bắt buộc)
   └─ người dùng tự chạy /code-review ultra nếu muốn thêm một lớp
```

Ba lớp đó bắt ba loại lỗi khác nhau: subagent bắt lỗi lộ liễu, `/security-review` bắt lỗi
ngoài checklist của dự án, `/phien-retest` bắt lỗi "vá không hết biến thể". Bỏ lớp nào cũng
được, miễn là biết mình đang bỏ lớp nào.
