/**
 * Gọi Gemini TỪ PHÍA MÁY CHỦ — API key không bao giờ lộ xuống trình duyệt.
 * Node 18+ có sẵn fetch, không cần thư viện thêm.
 */
import { UNIT } from './unit.js';
/* Tri thức của trợ lý nằm ở tệp riêng: lib/tri-thuc-tro-ly.js
   Tách ra để người bàn giao cho đơn vị mới mở đúng một tệp có tên nói rõ nội
   dung, thay vì phải lần trong tệp xử lý này. */
import { HE_THONG_KNOWLEDGE } from './tri-thuc-tro-ly.js';

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




