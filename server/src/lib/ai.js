/**
 * Gọi Gemini TỪ PHÍA MÁY CHỦ — API key không bao giờ lộ xuống trình duyệt.
 * Node 18+ có sẵn fetch, không cần thư viện thêm.
 */
import { UNIT } from './unit.js';

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
// Đổi model bằng biến môi trường GEMINI_MODEL trên Render (không cần sửa code):
//   gemini-2.5-pro    — thông minh nhất (MẶC ĐỊNH)
//   gemini-2.5-flash  — nhanh hơn, hạn mức free cao hơn
/**
 * ⚠️ QUAN TRỌNG: Từ 01/4/2026, Google ĐÃ GỠ dòng PRO khỏi gói MIỄN PHÍ.
 *    Dùng gemini-2.5-pro với API key free -> LUÔN LỖI 429 (hết quota).
 *    Chỉ dòng FLASH còn miễn phí. Vì vậy mặc định là Flash.
 *
 *    Muốn dùng Pro -> phải bật thanh toán (billing) ở Google Cloud,
 *    rồi đặt biến GEMINI_MODEL=gemini-2.5-pro trên Render.
 */
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim();

// CHATBOX -> Flash (nhiều lượt gọi, cần NHANH, hạn mức free cao hơn nhiều)
const GEMINI_CHAT_MODEL = (process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash').trim();

/* Khi model chính hết hạn mức (lỗi 429) -> tự động dùng model này thay thế.
 *
 * ⚠️ PHẢI ĐỌC ĐƯỢC TỪ BIẾN MÔI TRƯỜNG. Trước đây dòng này viết cứng
 * 'gemini-2.5-flash'. Hậu quả: Google đã NGỪNG CẤP model đó cho tài khoản
 * đăng ký mới ("no longer available to new users"), nên khi chuyển dự án sang
 * tài khoản Google khác thì model chính đổi được bằng biến môi trường, còn
 * model dự phòng vẫn trỏ vào model đã chết. Bình thường chạy tốt, nhưng đúng
 * lúc đông người hỏi (429) mới hỏng — kiểu lỗi rất khó lần ra.
 *
 * Đặt GEMINI_FALLBACK_MODEL trên Render nếu muốn dùng model khác.
 */
const FALLBACK_MODEL = (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite').trim();

const isPro = (m) => String(m).includes('pro');

/**
 * ⚠️ BẪY: Gemini 2.5 PRO KHÔNG CHO TẮT "thinking".
 *    - Flash: thinkingBudget = 0  -> tắt được
 *    - Pro:   thinkingBudget tối thiểu 128 -> đặt 0 sẽ LỖI API
 * Hàm này tự chọn giá trị hợp lệ cho từng model.
 *
 * @param {number} proBudget - ngân sách suy nghĩ cho Pro (128 = ít nhất, nhanh nhất)
 */
function thinking(model, proBudget = 128) {
  return { thinkingConfig: { thinkingBudget: isPro(model) ? proBudget : 0 } };
}
const urlOf = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const aiAvailable = () => Boolean(GEMINI_API_KEY);

/**
 * KIẾN THỨC VỀ CHÍNH HỆ THỐNG — để chatbot trả lời được câu hỏi về web.
 * Trước đây bot chỉ biết luật + thủ tục chung, hỏi "gửi ẩn danh sao?" là bí.
 * Giờ nạp toàn bộ cách dùng web vào đây -> bot hướng dẫn được từng bước.
 */
const HE_THONG_KNOWLEDGE = `
=== KIẾN THỨC VỀ WEBSITE HỘP THƯ SỐ — ĐIỂM CHẠM AN NINH ===

## TÊN VÀ KHẨU HIỆU
Tên đầy đủ của hệ thống: "Hộp Thư Số — Điểm Chạm An Ninh"
Khẩu hiệu: "Chạm để kết nối — Kết nối để bình yên"

Ý nghĩa: chỉ cần một cú chạm trên điện thoại là bà con kết nối được với cơ quan
công an; và chính sự kết nối đó góp phần giữ bình yên cho địa bàn.
(Dùng để trả lời khi bà con hỏi về cách dùng trang web này)

## CÁCH GỬI Ý KIẾN (5 bước)
Bấm "Gửi ý kiến ngay" ở trang chủ, hoặc vào mục "Gửi ý kiến":

BƯỚC 1 — Nhập nội dung sự việc (tối thiểu 20 ký tự).
  - Nên nêu rõ 4 điều: THỜI GIAN, ĐỊA ĐIỂM, SỰ VIỆC, NGƯỜI LIÊN QUAN.
  - Không cần gõ đúng chính tả hay có dấu — AI tự hiểu và chỉnh lại.
  - Có nút MICRO "Nói thay vì gõ": bấm rồi nói tiếng Việt, chữ tự hiện ra.
    (Dành cho bà con ngại gõ phím hoặc mắt kém. Cần có mạng.)
  - Đính kèm tối đa 5 ẢNH. Hệ thống tự xoá thông tin vị trí GPS trong ảnh.
  - Chọn MỨC ĐỘ: Bình thường / Quan trọng / Khẩn cấp.

BƯỚC 2 — AI đọc và gợi ý nhóm xử lý, đồng thời tự đánh giá mức khẩn cấp.
  Nếu AI thấy khẩn cấp sẽ hiện băng đỏ kèm lý do. Bà con vẫn được chọn lại.

BƯỚC 3 — Chọn 1 trong 4 nhóm:
  Tố giác tin báo / Khiếu nại / Phản ánh / Đề xuất.

BƯỚC 4 — Điền họ tên, số điện thoại, email.
  - Hệ thống gửi mã 6 số về email để xác thực (mã sống 10 phút).
  - Có ô XÁC MINH "Tôi không phải người máy" (Cloudflare) — thường tự tích xanh,
    không phải chọn ảnh gì cả. Nếu chưa tích thì chờ vài giây.
  - Hoặc bật "Gửi ẩn danh" (xem mục dưới).

BƯỚC 5 — Tick đồng ý điều khoản, bấm Gửi.
  Nhận MÃ TRA CỨU 6 ký tự. Hệ thống TỰ TẢI VỀ MÁY một tấm PHIẾU (ảnh PNG) có:
  mã tra cứu cỡ lớn, nhóm xử lý, ngày gửi, HẠN XỬ LÝ, và MÃ QR để quét xem
  kết quả. Phiếu nằm trong thư viện ảnh điện thoại, mở lại lúc nào cũng được.
  Nếu máy không tự tải, bấm nút "Tải phiếu về máy".

Nội dung đang gõ dở được TỰ ĐỘNG LƯU. Lỡ tắt trình duyệt, vào lại vẫn còn
(giữ trong 24 giờ), có nút khôi phục.

## GỬI ẨN DANH (chỉ nhóm Tố giác tin báo)
Ở bước 4, bật công tắc "Gửi ẩn danh". Khi đó KHÔNG cần họ tên, SĐT, email.
Thay vào đó hệ thống hiện mã 6 số ngay trên màn hình (ô vàng) để xác thực.
Vẫn phải qua ô xác minh "Tôi không phải người máy".

Điều kiện chặt hơn: nội dung tối thiểu 50 ký tự, mỗi ngày tối đa 2 tin,
mỗi lần cách nhau 10 phút.

QUAN TRỌNG: gửi ẩn danh thì cán bộ KHÔNG LIÊN HỆ LẠI ĐƯỢC để hỏi thêm,
nên bà con phải viết thật đầy đủ ngay từ đầu, kèm ảnh nếu có.

Tin ẩn danh qua bước KIỂM DUYỆT của cán bộ trước khi vào quy trình xử lý,
nên trạng thái ban đầu là "Chờ kiểm duyệt".
Cán bộ KHÔNG THỂ xem danh tính người gửi ẩn danh — hệ thống chặn hoàn toàn.

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
- Nội dung TỐ GIÁC được phân tích nội bộ, KHÔNG gửi sang dịch vụ AI bên ngoài
- Chi tiết xem trang "Chính sách bảo mật"

## VÌ SAO CÓ Ô "TÔI KHÔNG PHẢI NGƯỜI MÁY"
Để chặn máy tính tự động gửi hàng nghìn tin rác làm nghẽn hệ thống.
Ô này thường TỰ TÍCH XANH sau vài giây, bà con không phải làm gì.
Nếu mãi không tích: thử tải lại trang, hoặc đổi sang mạng khác (4G),
hoặc tắt phần mềm chặn quảng cáo.

## NÚT SOS KHẨN CẤP
Nút tròn màu đỏ góc dưới bên trái màn hình. Bấm vào để gọi ngay 113
hoặc gọi trực ban đơn vị. Dùng khi có nguy hiểm cần lực lượng đến ngay.

## KHÔNG CÓ ĐIỆN THOẠI / KHÔNG BIẾT DÙNG MÁY
Bà con đến thẳng trụ sở, cán bộ tiếp dân sẽ nhập hộ trên máy tại quầy
và in phiếu có mã tra cứu đưa bà con cầm về. Không cần email, không cần điện thoại.

## CÁC MỤC KHÁC TRÊN WEB
- Trang chủ: tin tức an ninh, cảnh báo lừa đảo, hướng dẫn thủ tục
- Giới thiệu: quy trình xử lý, cam kết bảo mật
- Chính sách bảo mật: cách thu thập và bảo vệ dữ liệu
- Bản đồ các phường/xã trên địa bàn
- Chế độ tối (dark mode): bấm biểu tượng mặt trăng ở đầu trang
- Cài vào màn hình chính: trình duyệt sẽ hỏi "Thêm vào màn hình chính",
  dùng như một ứng dụng

## MỘT SỐ TÌNH HUỐNG HAY GẶP
- Không nhận được email chứa mã: kiểm tra hộp thư Spam/Quảng cáo; chờ 60 giây
  rồi bấm gửi lại; mỗi giờ chỉ xin được tối đa 5 mã.
- Nhập mã sai nhiều lần: sai quá 5 lần thì mã bị huỷ, phải xin mã mới.
- Mất mã tra cứu: vào trang Tra cứu xem danh sách máy đã tự nhớ; hoặc mở lại
  phiếu PNG đã tải trong thư viện ảnh; hoặc gọi trực ban nhờ tra giúp.
- Gửi nhầm nội dung: liên hệ trực ban đơn vị, không tự xoá được trên web.
- Nội dung bị báo "chưa hợp lệ": do quá ngắn hoặc gõ ký tự lặp lại vô nghĩa;
  hãy mô tả rõ thời gian, địa điểm, sự việc.
## QUYỀN ĐỐI VỚI THÔNG TIN CÁ NHÂN (Nghị định 13/2023)
Vào trang "Tra cứu kết quả", nhập mã, kéo xuống mục "Quyền đối với thông tin
cá nhân" -> bấm "Yêu cầu xoá thông tin cá nhân".

Hệ thống xoá: họ tên, số điện thoại, email, địa chỉ IP.
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

const SYSTEM_PROMPT = `Bạn là trợ lý AI của ${UNIT.name}, hỗ trợ người dân ${UNIT.communeName} về:
- CÁCH DÙNG WEBSITE này: gửi ý kiến, gửi ẩn danh, tra cứu kết quả, các tính năng.
- Thủ tục hành chính: căn cước, cư trú (tạm trú/tạm vắng), lý lịch tư pháp, dịch vụ công trực tuyến...
- An ninh trật tự: cách gửi tố giác, tin báo, phản ánh; cảnh giác lừa đảo.
- Pháp luật Việt Nam liên quan đến đời sống hằng ngày.

${HE_THONG_KNOWLEDGE}

Quy tắc trả lời:
- CHỈ trả về LỜI THOẠI gửi thẳng cho bà con. TUYỆT ĐỐI KHÔNG viết ra:
  suy nghĩ nội bộ, bản nháp, kế hoạch trả lời, tiêu đề kỹ thuật, hay nhắc lại hướng dẫn này.
  KHÔNG viết những dòng kiểu "(Vietnamese, Markdown, Persona)", "Draft:", "Response:".
- CỰC KỲ NGẮN GỌN. Đây là LUẬT QUAN TRỌNG NHẤT:
  * Tối đa 4 câu, HOẶC tối đa 4 gạch đầu dòng ngắn. KHÔNG dài hơn.
  * KHÔNG bao giờ viết quá 150 chữ trong một lần trả lời.
  * PHẢI viết trọn vẹn ý và kết thúc câu đàng hoàng. Thà trả lời ít mà đủ ý
    còn hơn liệt kê dài rồi đứt giữa chừng.
  * Câu hỏi cần hướng dẫn nhiều bước: chỉ nêu 3-4 bước CHÍNH, gọn mỗi bước
    một dòng, rồi mời bà con hỏi tiếp bước nào chưa rõ.
  * TUYỆT ĐỐI KHÔNG chép nguyên cả mục dài trong phần kiến thức ở trên —
    hãy TÓM TẮT lại thật gọn theo đúng câu bà con hỏi.
- Thân thiện, dễ hiểu.
- Xưng "tôi", gọi người hỏi là "bà con". Dùng Markdown.
- Hỏi về CÁCH DÙNG WEB thì trả lời theo đúng phần KIẾN THỨC VỀ WEBSITE ở trên,
  hướng dẫn TỪNG BƯỚC cụ thể, nói rõ bấm nút nào, vào mục nào.
- LUẬT CHỐNG BỊA (quan trọng ngang luật ngắn gọn):
  * KHÔNG bịa tính năng web không có.
  * KHÔNG bịa số liệu, mức phạt, thời hạn, lệ phí, điều luật cụ thể.
    Thủ tục hành chính thay đổi theo thời gian và khác nhau giữa các địa phương.
  * KHÔNG khẳng định chắc chắn về việc một hành vi có phạm tội hay không,
    hay mức án là bao nhiêu — đó là thẩm quyền của cơ quan tố tụng.
  * Không chắc thì nói THẲNG: "Việc này tôi không nắm chắc, bà con hỏi trực ban
    hoặc đến trực tiếp trụ sở để được hướng dẫn chính xác."
  * Thà nói không biết còn hơn nói sai — bà con làm theo thông tin sai sẽ mất
    công đi lại, thậm chí thiệt hại thật.
- Trả lời thẳng vào câu hỏi, không liệt kê dài dòng. Cần thêm thì mời bà con hỏi tiếp.
- Khẩn cấp: hướng dẫn gọi ngay ${UNIT.emergency} hoặc hotline ${UNIT.name}: ${UNIT.hotline}.
- Vụ việc phức tạp: khuyên đến trực tiếp trụ sở (${UNIT.address}). Chỉ trả lời bằng tiếng Việt.`;

/** Gọi Gemini 1 lần với model chỉ định */
async function callOnce(model, body, opts = {}) {
  const res = await fetch(urlOf(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Gemini lỗi HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts;
  const text = parts?.map((p) => p.text ?? '').join('').trim();

  // Bị cắt vì hết token
  if (cand?.finishReason === 'MAX_TOKENS') {
    // Chatbox: trả phần đã viết được, kèm ghi chú (tốt hơn là báo lỗi trắng)
    if (opts.allowTruncated && text) {
      console.warn('⚠️  Câu trả lời chat bị cắt vì hết token.');

      /* CẮT VỀ CÂU HOÀN CHỈNH CUỐI CÙNG.
         Trước đây trả nguyên phần bị cắt -> câu đứt giữa chừng, đọc rất khó chịu
         ("Bà con vào mục Tra c"). Giờ lùi về dấu chấm/xuống dòng gần nhất
         để câu cuối luôn trọn vẹn. */
      let sach = text;
      const cuoi = Math.max(
        text.lastIndexOf('. '), text.lastIndexOf('.\n'),
        text.lastIndexOf('!'), text.lastIndexOf('?'),
        text.lastIndexOf('\n')
      );
      // Chỉ cắt nếu không mất quá 30% nội dung
      if (cuoi > text.length * 0.7) sach = text.slice(0, cuoi + 1).trim();

      return sach + '\n\nBà con muốn tôi nói rõ thêm phần nào không?';
    }
    // Phân tích ý kiến: JSON cắt dở là vô dụng -> báo lỗi để dùng phân tích dự phòng
    throw new Error('Gemini bị cắt giữa chừng (hết token). Cần tăng maxOutputTokens.');
  }
  if (!text) throw new Error('Gemini trả về nội dung rỗng');
  return text;
}

/**
 * Gọi Gemini — TỰ ĐỘNG DỰ PHÒNG khi hết hạn mức.
 *
 * Gemini 2.5 PRO bản free có hạn mức rất thấp (~5 lượt/phút).
 * Hết quota -> lỗi 429 -> AI chết hoàn toàn.
 * Hàm này bắt lỗi 429 và tự chuyển sang Flash (hạn mức cao hơn nhiều),
 * chỉnh lại thinkingBudget cho hợp lệ. Người dùng KHÔNG bị gián đoạn.
 */
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(model, body, opts = {}) {
  try {
    return await callOnce(model, body, opts);
  } catch (err) {
    const outOfQuota = err.status === 429;

    /* ĐANG Ở MODEL DỰ PHÒNG MÀ VẪN 429 -> trước đây chết hẳn.
       Hạn mức miễn phí tính THEO PHÚT, nên chờ vài giây rồi thử lại
       thường là qua. Thử 2 lần: chờ 2 giây, rồi 5 giây.
       Đây chính là lỗi "hỏi liên tục thì chatbot đứt". */
    if (outOfQuota && model === FALLBACK_MODEL) {
      for (const doi of [2000, 5000]) {
        console.warn(`⚠️  ${model} chạm hạn mức — chờ ${doi / 1000}s rồi thử lại...`);
        await nghi(doi);
        try {
          return await callOnce(model, body, opts);
        } catch (e2) {
          if (e2.status !== 429) throw e2;
        }
      }
      const e = new Error('Trợ lý đang bận do có nhiều người hỏi cùng lúc. Bà con chờ khoảng 1 phút rồi hỏi lại giúp tôi nhé.');
      e.status = 429;
      throw e;
    }

    if (!outOfQuota || model === FALLBACK_MODEL) throw err;

    console.warn(`⚠️  ${model} hết hạn mức (429) — tự chuyển sang ${FALLBACK_MODEL}`);

    // Flash TẮT được thinking (Pro thì không) -> phải chỉnh lại cho hợp lệ
    const fallbackBody = {
      ...body,
      generationConfig: {
        ...body.generationConfig,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    return await callOnce(FALLBACK_MODEL, fallbackBody, opts);
  }
}

/** Rút JSON ra khỏi văn bản, kể cả khi Gemini bọc trong ```json ... ``` */
function extractJson(raw) {
  let t = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/** Trợ lý chat — kèm ngữ cảnh 8 tin nhắn gần nhất */
/** Dọn phần "suy nghĩ" mà model lỡ viết ra màn hình */
function cleanChatReply(text) {
  let t = String(text);
  // Bỏ các nhãn kỹ thuật model hay lỡ in ra
  t = t.replace(/\*\*\(?(Vietnamese|Markdown|Persona|Draft|Response|Thinking|Final Answer)[^)]*\)?:?\*\*/gi, '');
  t = t.replace(/^\s*(Draft|Response|Final Answer|Thinking|Plan)\s*:.*$/gim, '');
  // Bỏ khối <thinking>...</thinking> nếu có
  t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  return t.trim();
}

export async function geminiChat(message, history = []) {
  // Chỉ gửi 6 lượt gần nhất, mỗi lượt tối đa 800 ký tự.
  // VÌ SAO: hội thoại dài -> token đầu vào phình -> dễ chạm hạn mức và chậm.
  // 6 lượt đủ để bot nhớ mạch chuyện mà không tốn kém.
  const contents = [
    ...history.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content ?? '').slice(0, 800) }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];
  const reply = await callGemini(GEMINI_CHAT_MODEL, {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      // Nâng lên 8192: câu trả lời dài (hướng dẫn nhiều bước) không bị cắt ngang.
      // Flash mặc định bật "thinking", phần suy nghĩ cũng ăn vào hạn mức này.
      maxOutputTokens: 8192,
      // ⚠️ KHÔNG tắt hẳn thinking cho CHAT.
      // Tắt (thinkingBudget: 0) -> model mất chỗ suy nghĩ nội bộ nên VIẾT RA MÀN HÌNH
      // cả phần nháp và cấu trúc prompt (VD: "**(Vietnamese, Markdown, Persona):**").
      // Cho nó một khoảng nghĩ vừa đủ -> trả lời sạch sẽ.
      thinkingConfig: { thinkingBudget: 256 },
      temperature: 0.4,
    },
  }, { allowTruncated: true }); // chat bị cắt -> vẫn trả phần đã có, còn hơn báo lỗi

  return cleanChatReply(reply);
}

const VALID_CATEGORIES = new Set(['to_giac', 'khieu_nai', 'phan_anh', 'de_xuat']);

/** AI phân tích + phân loại ý kiến — yêu cầu Gemini trả JSON thuần */
/* =====================================================================
   BẢO VỆ DỮ LIỆU TỐ GIÁC — KHÔNG GỬI SANG BÊN THỨ BA
   =====================================================================
   Gói Gemini miễn phí: Google có quyền dùng dữ liệu để cải thiện mô hình.
   Nội dung TỐ GIÁC TỘI PHẠM là thông tin nhạy cảm nhất của hệ thống
   (liên quan an toàn tính mạng người tố giác) -> TUYỆT ĐỐI không gửi ra ngoài.

   Cơ chế: quét từ khoá tội phạm (đã bỏ dấu) TRƯỚC khi gọi Gemini.
   Có dấu hiệu tố giác -> phân tích HOÀN TOÀN NỘI BỘ, không gọi API.
   ===================================================================== */

const bo_dau = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Từ khoá dấu hiệu tội phạm (so khớp KHÔNG DẤU để bắt cả văn bản thiếu dấu) */
const TO_GIAC_KEYWORDS = [
  'trom cap', 'trom xe', 'an trom', 'an cap', 'cuop', 'cuop giat',
  'ma tuy', 'nghien', 'chich hut', 'hut chich', 'choi da', 'bay lac', 'tang tru',
  'danh bac', 'da ga', 'so de', 'ghi de', 'ca do', 'xoc dia',
  'cho vay nang lai', 'tin dung den', 'doi no thue', 'xiet no',
  'lua dao', 'chiem doat', 'da cap',
  'danh nhau', 'chem', 'dam chem', 'hanh hung', 'gay thuong tich', 'con do',
  'mai dam', 'gai goi', 'chua chap',
  'buon lau', 'hang cam', 'hang gia', 'thuoc la lau',
  'sung', 'vu khi', 'hung khi', 'dao kiem', 'vat lieu no', 'phao no',
  'vuot bien', 'dua nguoi trai phep', 'buon nguoi', 'bat coc',
  'giet', 'hiep dam', 'xam hai', 'dam o',
  'to giac', 'to cao toi pham', 'trinh bao', 'bao an',
];


/** Phân tích NỘI BỘ cho tố giác — không gửi gì ra ngoài hệ thống */
/**
 * Từ khoá nhận diện mức KHẨN CẤP — dùng cho tố giác (phân tích nội bộ,
 * không gửi sang AI ngoài). Đã bỏ dấu để khớp cả khi bà con gõ thiếu dấu.
 */
const URGENT_KEYWORDS = [
  'dang danh nhau', 'dang danh', 'dam chem', 'chem nguoi', 'cuop', 'cuop giat',
  'bat coc', 'giet nguoi', 'doa giet', 'chay nha', 'chay no', 'hoa hoan',
  'tai nan', 'bi thuong', 'nguy hiem tinh mang', 'dang xay ra', 'ngay bay gio',
  'cap cuu', 'bao hanh', 'danh vo', 'danh con', 'hiep dam', 'tu tu', 'nhay cau',
];
const IMPORTANT_KEYWORDS = [
  'trom', 'trom cap', 'mat trom', 'lua dao', 'chiem doat', 'ma tuy', 'cai nghien',
  'danh bac', 'ca do', 'so de', 'tin dung den', 'cho vay nang lai', 'doi no',
  'gay roi', 'tu tap', 'quay roi', 'de doa', 'buon lau', 'hang gia', 'mai dam',
];




