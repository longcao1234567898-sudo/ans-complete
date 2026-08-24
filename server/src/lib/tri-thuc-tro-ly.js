/**
 * TRI THỨC CỦA TRỢ LÝ HỎI ĐÁP — NẠP THEO ĐƠN VỊ
 * ============================================================================
 *
 * Tách riêng khỏi ai.js để việc bàn giao cho đơn vị khác chỉ phải mở ĐÚNG MỘT
 * tệp có tên nói rõ nó chứa gì. Trước đây khối này nằm lẫn giữa mã xử lý trong
 * ai.js, người bàn giao không biết là có, nên trợ lý cứ đọc thông tin của đơn
 * vị cũ cho bà con đơn vị mới nghe.
 *
 * Sau khi sửa xong, chạy để soát lại:
 *     node server/scripts-kiem-tri-thuc.js
 *
 * ============================================================================
 */
import { UNIT } from './unit.js';

export const HE_THONG_KNOWLEDGE = `
=== KIẾN THỨC VỀ WEBSITE HỘP THƯ SỐ — ĐIỂM CHẠM AN NINH ===

## TÊN VÀ KHẨU HIỆU
Tên đầy đủ của hệ thống: "Hộp Thư Số — Điểm Chạm An Ninh"
Khẩu hiệu: "Chạm để kết nối — Kết nối để bình yên"

Ý nghĩa: chỉ cần một cú chạm trên điện thoại là bà con kết nối được với cơ quan
công an; và chính sự kết nối đó góp phần giữ bình yên cho địa bàn.
(Dùng để trả lời khi bà con hỏi về cách dùng trang web này)

## MÃ TRA CỨU VÀ MÃ PIN — HAI MÃ KHÁC NHAU, ĐỪNG NHẦM

Gửi ý kiến xong, bà con nhận được HAI mã, in chung trên một phiếu tải về:

1. MÃ TRA CỨU (6 ký tự, ví dụ A3K9P2)
   - Dùng để XEM tiến độ xử lý tại trang "Tra cứu"
   - Lộ ra cũng chỉ biết đơn đang ở bước nào

2. MÃ PIN (6 chữ số, ví dụ 481907)
   - Dùng để vào PHÒNG TRAO ĐỔI với cán bộ
   - CHỈ HIỆN MỘT LẦN duy nhất lúc gửi xong
   - Hệ thống chỉ lưu bản mã hoá nên KHÔNG CẤP LẠI ĐƯỢC

Nếu bà con mất mã PIN: vẫn tra cứu tiến độ bình thường bằng mã tra cứu,
nhưng không vào được phòng trao đổi. Muốn bổ sung thông tin thì gọi trực ban
hoặc gửi ý kiến mới.

## KÊNH TRAO ĐỔI HAI CHIỀU VỚI CÁN BỘ

Đây là tính năng để cán bộ hỏi thêm khi cần làm rõ vụ việc.

CÁCH VÀO: trang "Tra cứu" -> nhập mã tra cứu -> tìm khung "Trao đổi thêm với
cán bộ" -> nhập mã PIN 6 số -> vào phòng.

ĐIỂM QUAN TRỌNG: kênh này KHÔNG LỘ DANH TÍNH. Hệ thống chỉ lưu nội dung tin
nhắn, không lưu tên, số điện thoại, email hay địa chỉ mạng. Cán bộ trao đổi
với bà con mà vẫn không biết bà con là ai. Bà con gửi ẩn danh vẫn dùng được.

KHI NÀO KÊNH ĐÓNG: hồ sơ đã giải quyết xong hoặc bị từ chối thì kênh đóng lại,
không nhắn thêm được nhưng vẫn đọc lại được toàn bộ nội dung cũ.

## HỆ THỐNG PHÂN LOẠI Ý KIẾN — KHÔNG DÙNG AI

Nếu bà con hỏi "AI có đọc đơn của tôi không", trả lời rõ: KHÔNG.

Việc phân loại ý kiến do một bộ từ khoá nghiệp vụ chạy HOÀN TOÀN trong hệ
thống đảm nhiệm, không gửi nội dung đơn ra bất kỳ dịch vụ nào bên ngoài.
Trợ lý hỏi đáp này (tức là tôi) là chỗ DUY NHẤT có dùng AI, và tôi chỉ trả lời
câu hỏi chung về cách dùng web — tôi không đọc được nội dung đơn của bà con.

## MÃ QR ĐỊNH VỊ

Ở một số điểm công cộng — cổng chợ, đầu ấp, bến phà — có dán mã QR. Bà con quét
bằng camera điện thoại là mở thẳng trang gửi ý kiến, và hệ thống TỰ CHỌN SẴN
phường/xã, không phải tự tìm trong danh sách.

## CÁCH GỬI Ý KIẾN (5 bước)
Bấm "Gửi ý kiến ngay" ở trang chủ, hoặc vào mục "Gửi ý kiến":

BƯỚC 1 — Nhập nội dung sự việc (tối thiểu 20 ký tự).
  - Nên nêu rõ 4 điều: THỜI GIAN, ĐỊA ĐIỂM, SỰ VIỆC, NGƯỜI LIÊN QUAN.
  - Không cần gõ đúng chính tả hay có dấu — hệ thống tự hiểu và chỉnh lại.
  - Có nút MICRO "Nói thay vì gõ": bấm rồi nói tiếng Việt, chữ tự hiện ra.
    (Dành cho bà con ngại gõ phím hoặc mắt kém. Cần có mạng.)
  - Đính kèm tối đa 5 ẢNH. Hệ thống tự xoá thông tin vị trí GPS trong ảnh.
  - Chọn MỨC ĐỘ: Bình thường / Quan trọng / Khẩn cấp.

BƯỚC 2 — Hệ thống đọc nội dung, gợi ý nhóm xử lý và tự đánh giá mức khẩn cấp.
  Việc này do bộ TỪ KHOÁ trong hệ thống làm, KHÔNG gửi nội dung ra ngoài.
  Hệ thống chỉ ra đúng cụm từ nó bắt được, nên bà con thấy ngay vì sao nó
  xếp như vậy. Nếu thấy khẩn cấp sẽ hiện băng đỏ kèm lý do.
  Bà con vẫn được chọn lại nhóm khác nếu thấy chưa đúng.

BƯỚC 3 — Chọn 1 trong 4 nhóm:
  Tố giác tin báo / Khiếu nại / Phản ánh / Đề xuất.

BƯỚC 4 — Điền họ tên, số điện thoại. Email không bắt buộc.
  - KHÔNG cần chờ mã xác thực qua email. Điền xong là đi tiếp được ngay.
  - Có ô XÁC MINH "Tôi không phải người máy" (Cloudflare) — thường tự tích xanh,
    không phải chọn ảnh gì cả. Nếu chưa tích thì chờ vài giây.
  - Hoặc bật "Gửi ẩn danh" (xem mục dưới).

BƯỚC 5 — Tick đồng ý điều khoản, bấm Gửi.
  Nhận MÃ TRA CỨU 6 ký tự. Hệ thống TỰ TẢI VỀ MÁY một tấm PHIẾU (ảnh PNG) có:
  mã tra cứu cỡ lớn, nhóm xử lý, ngày gửi, HẠN XỬ LÝ, và MÃ QR để quét xem
  kết quả. Phiếu nằm trong thư viện ảnh điện thoại, mở lại lúc nào cũng được.
  Nếu máy không tự tải, bấm nút "Tải phiếu về máy".
  Ở màn hình này có ba lối ra: "Xem tiến độ ngay", "Về trang chủ", và
  "Gửi ý kiến khác".

MUỐN SỬA LẠI NỘI DUNG KHI ĐANG Ở BƯỚC CUỐI: ở màn hình xác nhận trước khi gửi
có nút "Về bước nhập nội dung" bên cạnh nút "Quay lại". Bấm vào đó nhảy thẳng
về bước 1 mà GIỮ NGUYÊN mọi thứ đã nhập, không phải gõ lại từ đầu.

Nội dung đang gõ dở được TỰ ĐỘNG LƯU. Lỡ tắt trình duyệt, vào lại vẫn còn
(giữ trong 24 giờ), có nút khôi phục.

## GỬI ẨN DANH (chỉ nhóm Tố giác tin báo)
Ở bước 4, bật công tắc "Gửi ẩn danh". Khi đó KHÔNG cần họ tên, SĐT, email.
Vẫn phải qua ô xác minh "Tôi không phải người máy".

Điều kiện chặt hơn: nội dung tối thiểu 50 ký tự, mỗi ngày tối đa 2 tin,
mỗi lần cách nhau 10 phút.

Tin ẩn danh qua bước KIỂM DUYỆT của cán bộ trước khi vào quy trình xử lý,
nên trạng thái ban đầu là "Chờ kiểm duyệt".
Cán bộ KHÔNG THỂ xem danh tính người gửi ẩn danh — hệ thống chặn hoàn toàn.

## GỬI ẨN DANH VẪN TRAO ĐỔI ĐƯỢC VỚI CÁN BỘ
Đây là điều nhiều bà con chưa biết, nên nói rõ khi được hỏi.

Gửi ẩn danh KHÔNG có nghĩa là mất liên lạc. Lúc gửi xong, ngoài mã tra cứu
6 ký tự, hệ thống còn cấp thêm MÃ PIN 6 SỐ. Vào trang tra cứu, nhập mã tra
cứu rồi nhập PIN là mở được PHÒNG NHẮN TIN với cán bộ.

Trong đó cán bộ hỏi thêm được: đối tượng mặc áo màu gì, khoảng mấy giờ,
xe biển số bao nhiêu — những chi tiết quyết định việc xác minh.

Phòng nhắn tin CHỈ lưu nội dung tin nhắn, bên gửi là ai và thời điểm.
KHÔNG lưu tên, số điện thoại, email hay địa chỉ mạng. Cán bộ trao đổi với
bà con mà vẫn không biết bà con là ai.

Vì sao cần thêm PIN chứ không chỉ mã tra cứu: mã tra cứu lộ ra thì người
khác chỉ biết đơn đang ở bước nào. Còn phòng nhắn tin có câu hỏi nghiệp vụ
của cán bộ — lộ ra là lộ hướng xác minh, và kẻ bị tố giác có thể mạo danh
người báo tin để đánh lạc hướng.

PIN cấp MỘT LẦN lúc gửi đơn, hệ thống chỉ giữ bản băm nên không cấp lại
được. Bà con phải chụp màn hình hoặc ghi ra giấy ngay lúc đó.

Dù vậy vẫn nên viết thật đầy đủ ngay từ đầu kèm ảnh — vì không phải bà con
nào cũng giữ được PIN.

## TRA CỨU KẾT QUẢ — 3 CÁCH
1. QUÉT MÃ QR trên phiếu đã tải về (nhanh nhất, không cần gõ).
2. Vào mục "Tra cứu kết quả", nhập mã 6 ký tự. KHÔNG cần đăng nhập tài khoản.
3. Máy TỰ NHỚ các mã bà con đã gửi — vào trang tra cứu là thấy sẵn danh sách,
   bấm vào xem ngay, không cần nhớ mã.
   Muốn xoá thì bấm nút X từng mã, hoặc "Xoá hết" nếu dùng máy chung.

## CÁC TRẠNG THÁI XỬ LÝ
- Chờ kiểm duyệt: tin ẩn danh đang được cán bộ sàng lọc
- Đã tiếp nhận: đơn vị đã nhận, chuẩn bị xử lý
- Đang xử lý: cán bộ đang giải quyết
- Đã giải quyết: xong, có kết quả trả lời
- Từ chối / chuyển đơn vị khác: không thuộc thẩm quyền

## THỜI HẠN XỬ LÝ (theo quy định pháp luật)
- Tố giác tin báo tội phạm: 20 ngày
- Khiếu nại: 30 ngày
- Phản ánh, kiến nghị: 15 ngày
- Đề xuất, thắc mắc: 10 ngày
Hệ thống tự tính hạn và cảnh báo cán bộ khi sắp hoặc đã quá hạn.
Hạn cụ thể có ghi trên phiếu tải về và ở trang tra cứu.

## MỨC ĐỘ KHẨN CẤP
- Khẩn cấp (đỏ): đang có người nguy hiểm, sự việc đang diễn ra
- Quan trọng (vàng): việc nghiêm trọng nhưng không đang diễn ra
- Bình thường: phản ánh hạ tầng, môi trường, góp ý
Ý kiến khẩn cấp được tự động đưa lên đầu danh sách của cán bộ.
LƯU Ý: nếu đang có nguy hiểm thật, phải GỌI NGAY 113 thay vì chờ xử lý qua web.

## THÔNG TIN CỦA BÀ CON ĐƯỢC BẢO VỆ THẾ NÀO
- Họ tên, số điện thoại được MÃ HOÁ chuẩn AES-256 trước khi lưu
- Ảnh gửi lên tự động xoá thông tin vị trí GPS
- Cán bộ chỉ thấy tên che sẵn (Nguyễn V*** A**); muốn xem đầy đủ phải bấm nút
  và hệ thống GHI NHẬT KÝ ai xem, lúc nào
- Nội dung ý kiến được phân loại NGAY TRONG HỆ THỐNG bằng bộ từ khoá,
  KHÔNG gửi sang dịch vụ AI bên ngoài. Trợ lý hỏi đáp này là phần DUY NHẤT
  có dùng dịch vụ AI, và nó không đọc nội dung ý kiến bà con đã gửi.
- Chi tiết xem trang "Chính sách bảo mật"

## VÌ SAO CÓ Ô "TÔI KHÔNG PHẢI NGƯỜI MÁY"
Để chặn máy tính tự động gửi hàng nghìn tin rác làm nghẽn hệ thống.
Ô này thường TỰ TÍCH XANH sau vài giây, bà con không phải làm gì.
Nếu mãi không tích: thử tải lại trang, hoặc đổi sang mạng khác (4G),
hoặc tắt phần mềm chặn quảng cáo.

## GỬI MÃI KHÔNG THẤY CÁN BỘ TRẢ LỜI — CÓ THỂ THIẾT BỊ BỊ KHOÁ

Hệ thống có chặn thiết bị gửi tin rác. Thiết bị bị khoá vẫn gửi được và vẫn
thấy màn hình báo thành công, nhưng đơn không vào hàng chờ của cán bộ.

Quy tắc hiện hành:
  - Bị cán bộ đánh dấu tin rác một lần: khoá 24 giờ
  - Bị đánh dấu BA LẦN LIÊN TIẾP trong 30 ngày: khoá 30 ngày
  - Xen giữa có một đơn được duyệt thì chuỗi đứt, đếm lại từ đầu
  - Khoá LUÔN CÓ HẠN, không bao giờ vĩnh viễn
  - Khi đánh dấu tin rác, các đơn khác cùng thiết bị gửi trong 24 giờ trước đó
    cũng được đưa vào Thùng rác (giữ 7 ngày, cán bộ khôi phục được)

NẾU BÀ CON NGHI MÌNH BỊ KHOÁ NHẦM: gọi trực ban ${UNIT.hotline}. Cán bộ tra
được và gỡ khoá ngay. Đơn đã gửi vẫn còn trong hệ thống, không mất.

⚠️ CÁCH TRẢ LỜI: nếu bà con than gửi mãi không ai xử lý, ĐỪNG khẳng định là họ
bị khoá — có thể chỉ là hồ sơ đang chờ tới lượt. Hãy hướng bà con tra cứu bằng
mã trước; tra cứu không ra mã thì mới gợi ý gọi trực ban để kiểm tra.

## NÚT SOS KHẨN CẤP
Nút tròn màu đỏ góc dưới bên trái màn hình. Bấm vào để gọi ngay 113
hoặc gọi trực ban đơn vị. Dùng khi có nguy hiểm cần lực lượng đến ngay.

## KHÔNG CÓ ĐIỆN THOẠI / KHÔNG BIẾT DÙNG MÁY
Bà con đến thẳng trụ sở, cán bộ tiếp dân sẽ nhập hộ trên máy tại quầy
và in phiếu có mã tra cứu đưa bà con cầm về. Không cần email, không cần điện thoại.

## NHÓM ZALO CỦA ĐỊA BÀN
Ở CHÂN TRANG (kéo xuống cuối trang) có mã QR nhóm Zalo do ${UNIT.name} quản lý.
Quét mã bằng camera điện thoại để vào nhóm. Xem trên máy tính thì bấm thẳng
vào khối đó, nó mở trang nhóm luôn.

Nhóm là nơi đơn vị thông báo tình hình an ninh trật tự và nhắc bà con cảnh
giác thủ đoạn lừa đảo mới. KHÔNG dùng nhóm để gửi tố giác — tố giác phải gửi
qua mục "Gửi ý kiến" thì mới có mã tra cứu và mới được tính hạn xử lý.

## CÁC MỤC KHÁC TRÊN WEB
- Trang chủ: tin tức an ninh, cảnh báo lừa đảo, hướng dẫn thủ tục
- Giới thiệu: quy trình xử lý, cam kết bảo mật
- Chính sách bảo mật: cách thu thập và bảo vệ dữ liệu
- Bản đồ các phường/xã trên địa bàn
- Chế độ tối (dark mode): bấm biểu tượng mặt trăng ở đầu trang
- Cài vào màn hình chính: trình duyệt sẽ hỏi "Thêm vào màn hình chính",
  dùng như một ứng dụng

## MỘT SỐ TÌNH HUỐNG HAY GẶP
- Mất mã tra cứu: vào trang Tra cứu xem danh sách máy đã tự nhớ; hoặc mở lại
  phiếu PNG đã tải trong thư viện ảnh; hoặc gọi trực ban nhờ tra giúp.
- Mất mã PIN phòng nhắn tin: không cấp lại được vì hệ thống chỉ giữ bản băm.
  Bà con gọi trực ban trình bày, hoặc gửi lại tin mới có nội dung đầy đủ hơn.
- Gửi nhầm nội dung: liên hệ trực ban đơn vị, không tự xoá được trên web.
- Nội dung bị báo "chưa hợp lệ": do quá ngắn hoặc gõ ký tự lặp lại vô nghĩa;
  hãy mô tả rõ thời gian, địa điểm, sự việc.
- Gửi xong không thấy đơn đâu, tra cứu vẫn ra: bình thường, tin ẩn danh nằm ở
  bước "Chờ kiểm duyệt" cho tới khi cán bộ sàng lọc xong.
- Bấm gửi mà báo lỗi liên tục: thử đổi sang mạng khác (4G), tắt phần mềm chặn
  quảng cáo, rồi tải lại trang.
## QUYỀN ĐỐI VỚI THÔNG TIN CÁ NHÂN (Nghị định 13/2023)
Vào trang "Tra cứu kết quả", nhập mã, kéo xuống mục "Quyền đối với thông tin
cá nhân" -> bấm "Yêu cầu xoá thông tin cá nhân".

Hệ thống xoá: họ tên, số điện thoại, email (nếu có), địa chỉ mạng.
Hệ thống GIỮ LẠI: nội dung ý kiến ở dạng không còn danh tính (phục vụ thống kê).

Ba trường hợp:
- Tin gửi ẩn danh -> không có gì để xoá, hệ thống vốn không lưu thông tin cá nhân
- Hồ sơ ĐÃ ĐÓNG (đã giải quyết / từ chối) -> xoá ngay lập tức
- Hồ sơ ĐANG XỬ LÝ -> ghi nhận yêu cầu, tự động xoá ngay khi đóng hồ sơ
  (vì cán bộ cần thông tin để xác minh vụ việc)

LƯU Ý QUAN TRỌNG: sau khi xoá, cán bộ KHÔNG liên hệ lại được để báo kết quả.
Bà con vẫn tra cứu bằng mã bình thường.

## BỐN NHÓM XỬ LÝ — CHỌN NHÓM NÀO
- TỐ GIÁC TIN BÁO: báo về hành vi có dấu hiệu tội phạm (trộm cắp, ma tuý,
  đánh bạc, lừa đảo, cố ý gây thương tích...). Đây là nhóm DUY NHẤT được gửi ẩn danh.
- KHIẾU NẠI: không đồng ý với quyết định, hành vi của cơ quan hoặc cán bộ.
- PHẢN ÁNH, KIẾN NGHỊ: báo về tình hình an ninh trật tự, hạ tầng, tiếng ồn,
  vệ sinh môi trường, đề nghị xử lý.
- ĐỀ XUẤT, THẮC MẮC: hỏi thủ tục, góp ý cải tiến, đề nghị hỗ trợ.

Không chắc chọn nhóm nào thì cứ viết nội dung, AI sẽ gợi ý nhóm phù hợp.

## THỦ TỤC HÀNH CHÍNH HAY HỎI
CĂN CƯỚC CÔNG DÂN: mang sổ hộ khẩu hoặc giấy tờ tuỳ thân đến công an cấp
xã/phường nơi thường trú. Trẻ dưới 14 tuổi cần người giám hộ đi cùng.
Nhiều nơi có làm lưu động cho người già yếu, bệnh tật — hỏi trực ban.

ĐĂNG KÝ TẠM TRÚ: đến công an nơi tạm trú trong 30 ngày kể từ ngày đến ở.
Mang theo giấy tờ tuỳ thân và giấy tờ chứng minh chỗ ở hợp pháp.

KHAI BÁO TẠM VẮNG: đi khỏi nơi thường trú từ 30 ngày trở lên thì khai báo
tại công an xã/phường nơi thường trú.

LÝ LỊCH TƯ PHÁP: nộp tại Sở Tư pháp tỉnh, không phải công an xã.

Chi tiết từng thủ tục bà con nên hỏi trực ban hoặc đến trực tiếp — quy định
có thể thay đổi và mỗi trường hợp một khác.

## CẢNH GIÁC LỪA ĐẢO PHỔ BIẾN
- Giả danh công an, viện kiểm sát, toà án gọi điện báo "liên quan vụ án",
  yêu cầu chuyển tiền để "chứng minh trong sạch". CƠ QUAN CHỨC NĂNG KHÔNG BAO
  GIỜ làm việc qua điện thoại kiểu này, không bao giờ yêu cầu chuyển tiền.
- Việc nhẹ lương cao, tuyển cộng tác viên chốt đơn online.
- Đầu tư sinh lời nhanh, sàn ảo, tiền ảo.
- Giả người thân nhắn tin mượn tiền gấp -> phải gọi lại xác minh.
- Link lạ, mã QR lạ dẫn tới trang giả yêu cầu đăng nhập ngân hàng.

Nghi ngờ bị lừa: giữ nguyên tin nhắn, sao kê chuyển tiền, báo ngay cho công an.

## SỐ ĐIỆN THOẠI KHẨN CẤP
113 — Công an (an ninh trật tự, tội phạm đang xảy ra)
114 — Cứu hoả, cứu nạn cứu hộ
115 — Cấp cứu y tế
111 — Tổng đài bảo vệ trẻ em

## TÌNH HUỐNG KHÓ HAY GẶP
- Muốn BỔ SUNG thông tin cho ý kiến đã gửi: hệ thống chưa cho sửa tin đã gửi.
  Bà con gửi ý kiến mới ghi rõ "bổ sung cho mã XXXXXX", hoặc gọi trực ban.
- Gửi NHẦM nội dung: liên hệ trực ban để cán bộ xử lý, không tự xoá được trên web.
- Ý kiến QUÁ HẠN chưa được trả lời: liên hệ trực ban kèm mã tra cứu.
- Không đồng ý với kết quả giải quyết: gửi khiếu nại mới, ghi rõ mã cũ.
- Máy tính/điện thoại người khác: nhớ bấm "Xoá hết" trong danh sách mã đã lưu
  ở trang Tra cứu.

=== HẾT PHẦN KIẾN THỨC VỀ WEBSITE ===
`;
