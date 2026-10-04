# ADR 004 — Cảnh báo nguy cơ ngập tự động theo lượng mưa (Open-Meteo)

- **Trạng thái**: Đã chấp nhận — **bổ sung mục 8** (ngưỡng theo từng tuyến, P53, 2026-10-04)
- **Ngày**: 2026-10-04
- **Người quyết định**: người vận hành, phiên P51 ("lấy API Open-Meteo làm tự động cảnh báo lũ
  dựa vào lượng mưa để cảnh báo người dân, lập ra các mức dự báo"). Claude đề xuất phương án
- **Liên quan**: P50 — đường hay ngập, "đang ngập" do cán bộ xác nhận (`server/src/lib/duong-ngap.js`)
- **Mở**: nợ kỹ thuật ND-051 (chưa tính triều; phần hiệu chỉnh theo địa bàn đã làm ở mục 8)

---

## Bối cảnh

P50 làm trạng thái "đang ngập" do cán bộ bấm, vì Google Maps không có dịch vụ trả đường đang
ngập. Người vận hành muốn thêm cảnh báo **tự động** theo lượng mưa và nêu tên Open-Meteo Flood API.

Kiểm trước khi làm:

- **Flood API của Open-Meteo trả lưu lượng sông** (mô hình GloFAS, ô lưới chừng 5 km). Nó hợp
  với lũ sông lớn, không nói gì về nước ngập trên mặt đường. Ngập đường đô thị đến từ mưa dồn
  quá sức cống — đo bằng **lượng mưa**, có ở Forecast API (`hourly=precipitation`) của cùng
  nhà cung cấp.
- **Điều khoản bản miễn phí**: chỉ dùng phi thương mại; dưới 10.000 lượt/ngày, 5.000/giờ,
  600/phút; dữ liệu theo CC BY 4.0 — phải ghi nguồn; nhà cung cấp có thể chặn nếu lạm dụng.
- **Phân loại mưa của ngành khí tượng thuỷ văn Việt Nam**: 24 giờ — mưa vừa 16–50 mm, mưa to
  51–100 mm, mưa rất to trên 100 mm; 12 giờ — vừa 8–25 mm, to 26–50 mm, rất to trên 50 mm.

## Quyết định

### 1. Nguồn: lượng mưa theo giờ, không dùng Flood API

`https://api.open-meteo.com/v1/forecast`, `hourly=precipitation`, `past_days=1`,
`forecast_days=3`, `timeformat=unixtime`. Địa chỉ là hằng; toạ độ là số đã kiểm, làm tròn
2 chữ số. Bài canh A10 (`ra-soat-owasp.test.js`) kiểm cả lời gọi này.

### 2. Máy chủ gọi, trình duyệt không gọi

Máy chủ lấy, giữ 30 phút, gộp mọi yêu cầu đến cùng lúc thành một lượt, vừa lỗi thì nghỉ 5 phút.
Người dân gọi `GET /api/diem-den/du-bao-mua`; cán bộ gọi `GET /api/admin/diem-den/du-bao-mua`
(thêm toạ độ và nguồn toạ độ — máy chủ cán bộ chạy tách không có route công khai).

Vì sao: IP người dân không sang bên thứ ba; không phải nới CSP; cả web chỉ tốn vài chục lượt
mỗi ngày thay vì mỗi người xem một lượt — ngày mưa to đông người xem nhất lại là ngày dễ vượt
hạn mức nhất.

### 3. Bốn mức

| Mức | Tên | Điều kiện (một trong hai là đủ) |
|---|---|---|
| 0 | Bình thường | Dưới 16 mm/24 giờ **và** dưới 8 mm/12 giờ |
| 1 | Theo dõi | Mưa vừa: từ 16 mm/24 giờ, hoặc từ 8 mm dồn trong 12 giờ |
| 2 | Cảnh báo | Mưa to: trên 50 mm/24 giờ, hoặc trên 25 mm dồn trong 12 giờ |
| 3 | Nguy hiểm | Mưa rất to: trên 100 mm/24 giờ, hoặc trên 50 mm dồn trong 12 giờ |

"24 giờ" là 24 giờ tới. "12 giờ" là mọi khung 12 giờ liên tiếp trong 3 giờ vừa qua + 24 giờ
tới — mưa vừa dứt thì nước chưa kịp rút, nên vẫn tính. Ngưỡng nằm một chỗ (`NGUONG` trong
`server/src/lib/du-bao-mua.js`); bản sao để giải thích trên giao diện có test bắt lệch.

Không thêm ngưỡng 3 giờ theo sức cống: cống nội đô TP.HCM thiết kế cho chừng 76–96 mm/3 giờ,
cống cũ dưới 40 mm — đều trên 25 mm, nên mưa đủ làm tràn cống thì ngưỡng 12 giờ đã báo.

### 4. Không có dữ liệu không phải trời yên (luật 1)

Lấy lỗi, dữ liệu sai dạng, thiếu bất kỳ giờ nào trong khung tính, phản hồi quá lớn → trạng thái
`khong_co_du_lieu`, không bao giờ quy về mức 0. Làm mới hỏng thì dùng bản cũ tối đa 3 giờ và
ghi rõ là cũ. Giao diện nói thẳng "không có dự báo không có nghĩa là trời yên" và chỉ tới bản
tin chính thức nchmf.gov.vn.

### 5. Dự báo không đánh dấu "đang ngập"

Mô hình thời tiết ô lưới vài km, sai số lớn với mưa dông nhiệt đới. Mức Cảnh báo trở lên chỉ
thêm nhãn "Nguy cơ ngập — dự báo mưa to" cho đường hay ngập và nhắc cán bộ cử người đi xem.
"ĐANG NGẬP" vẫn chỉ đến từ cán bộ xác nhận (P50).

### 6. Điểm dự báo

1. `DU_BAO_MUA_TOA_DO="vĩ độ,kinh độ"` nếu khai. `tat` = tắt hẳn. Khai sai → không hiện dự báo,
   ghi log đỏ, trang cán bộ báo đỏ — không lặng lẽ đoán điểm khác.
2. Không khai → trung vị toạ độ các đường hay ngập đang công khai (đúng chỗ cần dự báo; trung vị
   để một điểm nhập sai không kéo lệch). Điểm ngoài khung Việt Nam bị bỏ (thường là nhập ngược
   vĩ độ / kinh độ).
3. Chưa có đường hay ngập → trung vị điểm đen tai nạn đang công khai.
4. Không có gì → không gọi Open-Meteo.

### 7. Hiện ở đâu

- Trang chủ: dải trên cùng, **chỉ từ mức 2** — ngày thường không chiếm chỗ.
- Trang Điểm đen: khung mọi mức, sau khung "đang ngập" của cán bộ, kèm bảng giải thích các mức.
- Trang cán bộ Điểm đen: như trên, thêm lý do, điểm dự báo và lời nhắc đi kiểm tra.
- Mọi nơi ghi "Dữ liệu thời tiết: Open-Meteo.com (CC BY 4.0)".

### 8. Ngưỡng theo từng tuyến, học từ các lần báo ngập (bổ sung P53, 2026-10-04)

Người vận hành: "xem lại việc gắn lượng mưa phù hợp với mức địa bàn địa phương". Không có nguồn công
khai nào cho mức mưa gây ngập ở từng tuyến của địa bàn (đã tra; báo chí chỉ nói chung kiểu "gần
100 mm trong vài giờ là ngập"). Nên hệ thống học từ chính địa bàn (`lib/nguong-ngap.js`,
`nang_cap_v34.sql`):

- Mỗi lần cán bộ bấm "Đang ngập", ghi lượng mưa lúc đó: mưa dồn 3 giờ lớn nhất trong 12 giờ trước
  (trận mưa gây ngập thường đã qua lúc cán bộ ra tới nơi) và tổng 12 giờ — số của mô hình thời tiết.
- Từ 3 lần có số mưa -> gợi ý ngưỡng = hạng thấp của tứ phân vị dưới, làm tròn xuống 5 mm. Chọn phía
  thấp: thà báo sớm còn hơn báo muộn.
- **Lãnh đạo** đặt ngưỡng (5–300 mm mưa dồn 3 giờ); máy chỉ gợi ý. Mỗi lần đặt ghi nhật ký cũ -> mới.
- Dự báo báo nguy cơ cho **từng tuyến**: có ngưỡng riêng -> mưa dồn 3 giờ dự báo đạt ngưỡng; chưa có ->
  theo mức chung (Cảnh báo trở lên); **mức Nguy hiểm -> mọi tuyến** — lưới an toàn để một ngưỡng đặt
  nhầm cao không làm im cảnh báo mưa rất to.
- Ngưỡng riêng cho phép cả hai chiều: tuyến trũng báo ngay ở mức Theo dõi; tuyến cống tốt không bị
  báo oan ở mức Cảnh báo.

Đánh đổi: số mưa là của mô hình thời tiết (ô lưới vài km), không phải trạm đo tại tuyến — gợi ý có
sai số. Vì thế máy không tự đặt ngưỡng, và có lưới an toàn ở mức Nguy hiểm.

## Phương án đã loại

| Phương án | Vì sao loại |
|---|---|
| Flood API (lưu lượng sông) | Không phản ánh ngập đường phố; ô 5 km |
| Trình duyệt gọi thẳng Open-Meteo | Lộ IP người dân cho bên thứ ba, phải nới CSP, dễ vượt hạn mức |
| Mưa vượt ngưỡng thì tự đánh dấu "đang ngập" | Báo sai trên trang công an → người dân né nhầm hoặc lao vào đường ngập |
| Không có dữ liệu thì hiện "Bình thường" | Chính là fail-open: mạng chập chờn lúc mưa to thành lời trấn an sai |
| Thêm ngưỡng 3 giờ theo sức cống | Bị ngưỡng 12 giờ bao trùm (xem mục 3) |

## Hệ quả

- **Thêm một phụ thuộc bên ngoài.** Open-Meteo sập hoặc chặn → khung dự báo ghi "chưa lấy được",
  mọi phần khác của web không ảnh hưởng. Không có khoá API nào phải giữ.
- **Điều khoản phi thương mại.** Trang phục vụ công không thu tiền; nếu đơn vị xác định khác thì
  đặt `DU_BAO_MUA_TOA_DO=tat` (hoặc mua gói có khoá — chưa làm, cần thêm mã).
- **Ngưỡng là của cả nước, chưa hiệu chỉnh theo từng tuyến; chưa tính triều cường** → ND-051.
- Không chạm dữ liệu người tố giác, không phải lớp bảo vệ an ninh.

## Nguồn tham khảo

- Điều khoản, hạn mức, giấy phép Open-Meteo: <https://open-meteo.com/en/terms>,
  <https://open-meteo.com/en/pricing>, <https://open-meteo.com/en/licence>
- Phân loại lượng mưa: <https://baochinhphu.vn/tim-hieu-thuat-ngu-va-bieu-tuong-dung-trong-ban-tin-du-bao-khi-tuong-thuy-van-10281992.htm>,
  <http://kttv.angiang.gov.vn/kien-thuc-kttv?a=I6>, <https://kttvtaynguyen.org.vn/mua-lon/>
- Sức thoát nước cống TP.HCM: <https://plo.vn/ngap-la-do-mua-to-cong-nho-post304792.html>,
  <https://www.sggp.org.vn/dieu-chinh-quy-hoach-chung-xay-dung-tphcm-bai-2-bi-noc-ao-truoc-bien-doi-khi-hau-post469806.html>
