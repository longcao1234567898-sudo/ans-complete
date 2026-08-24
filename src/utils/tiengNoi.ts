/**
 * ĐỌC TO TIẾNG VIỆT — tiện ích dùng chung cho mọi nút loa trong hệ thống.
 * ============================================================================
 *
 * Gom về một chỗ vì ba nút (đọc bài tin, nghe toàn bộ tin, hướng dẫn từng bước)
 * trước đây lặp cùng một đoạn code, mà đoạn đó có ba điểm yếu với tiếng Việt.
 * Sửa một nơi, cả ba tốt lên.
 *
 * BA VẤN ĐỀ CỦA WEB SPEECH TIẾNG VIỆT VÀ CÁCH XỬ LÝ
 *
 * 1. GIỌNG VIỆT TẢI TRỄ
 *    getVoices() ở lần gọi đầu thường trả về mảng RỖNG — trình duyệt nạp danh
 *    sách giọng bất đồng bộ. Hệ quả: bấm loa ngay khi vừa mở trang thì không
 *    tìm thấy giọng Việt, máy đọc tiếng Việt bằng giọng tiếng Anh, nghe như
 *    người nước ngoài đọc bập bẹ. Nay chờ sự kiện voiceschanged và nạp sẵn
 *    danh sách giọng từ khi trang tải.
 *
 * 2. CÂU DÀI BỊ CẮT NGANG
 *    Nhiều trình duyệt (nhất là Chrome) tự dừng đọc sau khoảng 15 giây hoặc
 *    khi câu quá dài. Bài tin dài đọc tới giữa là im bặt. Nay CẮT NHỎ văn bản
 *    theo câu rồi đọc nối tiếp từng câu — mỗi câu ngắn, không chạm giới hạn.
 *
 * 3. CHỌN GIỌNG VIỆT TỐT NHẤT
 *    Máy có thể có nhiều giọng vi-VN (giọng hệ điều hành, giọng Google...).
 *    Chất lượng khác nhau nhiều. Nay ưu tiên theo thứ tự: giọng Google tiếng
 *    Việt (thường tự nhiên nhất) -> giọng vi-VN bất kỳ -> giọng có mã 'vi'.
 *
 * 4. MÁY KHÔNG CÓ GIỌNG VIỆT NÀO  ← vấn đề hay gặp nhất
 *    Nhiều máy tính và điện thoại KHÔNG cài sẵn giọng đọc tiếng Việt. Khi đó
 *    Web Speech lấy giọng mặc định (thường tiếng Anh) đọc chữ tiếng Việt —
 *    nghe sai hoàn toàn. Đây là hạn chế của THIẾT BỊ, không phải của mã.
 *    Cách xử lý: khi không tìm thấy giọng Việt nào trong máy, nhờ MÁY CHỦ đọc
 *    hộ qua route /api/tts — trình duyệt gọi API của chính hệ thống (cùng tên
 *    miền, không vướng CORS), máy chủ lấy âm thanh tiếng Việt về trả lại. Máy
 *    người dùng có giọng Việt hay không cũng không còn quan trọng.
 *    Gọi thẳng dịch vụ đọc từ trình duyệt KHÔNG chạy được vì bị chặn CORS và
 *    kiểm tra Referer — đó là lý do phải đi vòng qua máy chủ.
 * ============================================================================
 */

/** Bộ nhớ đệm danh sách giọng — nạp một lần, dùng lại. */
let cacheGiong: SpeechSynthesisVoice[] = [];

function docDanhSachGiong(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const ds = window.speechSynthesis.getVoices();
  if (ds.length) cacheGiong = ds;
  return cacheGiong;
}

/* Lắng nghe sự kiện giọng sẵn sàng — nạp danh sách vào cache ngay khi trình
   duyệt nạp xong, để lần bấm đầu tiên đã có giọng Việt. */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  docDanhSachGiong();
  window.speechSynthesis.onvoiceschanged = () => { docDanhSachGiong(); };
}

/** Chọn giọng tiếng Việt tốt nhất máy đang có. */
function chonGiongViet(): SpeechSynthesisVoice | undefined {
  const ds = docDanhSachGiong();
  return (
    ds.find((v) => v.lang.startsWith('vi') && /google/i.test(v.name)) ||
    ds.find((v) => v.lang === 'vi-VN') ||
    ds.find((v) => v.lang.startsWith('vi'))
  );
}

/* Cắt văn bản thành từng câu để đọc nối tiếp — tránh trình duyệt cắt ngang
   câu dài. Cắt sau dấu kết câu và sau xuống dòng. Câu vẫn dài quá thì cắt tiếp
   theo dấu phẩy. */
function catCau(text: string): string[] {
  const tho = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const ket: string[] = [];
  for (const cau of tho) {
    if (cau.length <= 180) { ket.push(cau); continue; }
    /* Câu quá dài -> cắt tiếp theo dấu phẩy để mỗi mẩu đủ ngắn. */
    let dem = '';
    for (const manh of cau.split(/,\s*/)) {
      if ((dem + manh).length > 160) { if (dem) ket.push(dem.trim()); dem = manh + ', '; }
      else dem += manh + ', ';
    }
    if (dem.trim()) ket.push(dem.replace(/,\s*$/, '').trim());
  }
  return ket;
}

export interface DieuKhienDoc {
  /** Dừng đọc ngay */
  dung: () => void;
}

/* Cắt văn bản thành các mẩu ≤ 190 ký tự cho dịch vụ đọc qua mạng (giới hạn
   độ dài mỗi lần gọi). Cắt theo câu trước, mẩu vẫn dài thì cắt theo khoảng
   trắng. */
function catChoAudio(text: string): string[] {
  const mau = catCau(text);
  const ket: string[] = [];
  for (const m of mau) {
    if (m.length <= 190) { ket.push(m); continue; }
    let dem = '';
    for (const tu of m.split(' ')) {
      if ((dem + ' ' + tu).length > 190) { if (dem) ket.push(dem.trim()); dem = tu; }
      else dem += ' ' + tu;
    }
    if (dem.trim()) ket.push(dem.trim());
  }
  return ket;
}

/* Địa chỉ máy chủ, để gọi route đọc /api/tts. Lấy từ cùng biến môi trường mà
   các service khác dùng. Trống nghĩa là chưa cấu hình backend. */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';

/**
 * Đọc bằng cách phát tệp âm thanh tiếng Việt do MÁY CHỦ đọc hộ (/api/tts).
 * Dùng khi máy KHÔNG có giọng Việt. Gọi API của chính hệ thống nên không vướng
 * CORS, và máy chủ gửi kèm header hợp lệ nên nguồn đọc không chặn. Phát nối
 * tiếp từng mẩu.
 *
 * @param onLoi  gọi khi mẩu ĐẦU TIÊN phát lỗi — để nơi gọi lùi về Web Speech.
 */
function docBangAudio(text: string, onXong?: () => void, onLoi?: () => void): DieuKhienDoc {
  /* Không có backend -> không có route đọc -> báo lỗi ngay để lùi Web Speech. */
  if (!API_URL) { onLoi?.(); return { dung: () => {} }; }

  const cac = catChoAudio(text);
  let i = 0;
  let daDung = false;
  let daPhatDuocMauNao = false;
  /* CỜ CHỐNG GỌI HAI LẦN.

     Một lần phát lỗi có thể kích hoạt CẢ audio.onerror LẪN .catch() của
     audio.play() — trình duyệt bắn cả hai. Nếu mỗi cái đều gọi onLoi thì lùi
     về Web Speech HAI lần, sinh hai luồng đọc song song, mỗi câu đọc hai lần.
     Đây đúng là lỗi "mỗi câu lặp lại 2 lần". Cờ này bảo đảm onLoi/onXong chỉ
     chạy một lần duy nhất. */
  let daKetThuc = false;
  const audio = new Audio();

  const bao = (cb?: () => void) => {
    if (daKetThuc) return;
    daKetThuc = true;
    cb?.();
  };

  const phatTiep = () => {
    if (daDung || i >= cac.length) { bao(onXong); return; }
    /* Gọi route đọc của MÁY CHỦ, không gọi thẳng dịch vụ ngoài. Máy chủ lo phần
       lấy âm thanh tiếng Việt và trả về, nên đây luôn cùng tên miền backend. */
    audio.src = `${API_URL}/api/tts?q=${encodeURIComponent(cac[i])}`;
    audio.onplaying = () => { daPhatDuocMauNao = true; };
    audio.onended = () => { i += 1; daKetThuc = false; phatTiep(); };
    audio.onerror = () => {
      if (!daPhatDuocMauNao && i === 0) { bao(onLoi); return; }
      i += 1; daKetThuc = false; phatTiep();
    };
    audio.play().catch(() => {
      if (!daPhatDuocMauNao && i === 0) { bao(onLoi); return; }
      bao(onXong);
    });
  };
  phatTiep();

  return {
    dung: () => { daDung = true; audio.pause(); audio.src = ''; bao(onXong); },
  };
}

/* ============================================================================
   CHỈ MỘT LUỒNG ĐỌC TẠI MỘT THỜI ĐIỂM

   Mỗi nút đọc (đọc từng bài, nghe toàn bộ tin, hướng dẫn bước) trước đây tự
   quản luồng của mình, không biết nút khác. Bấm nghe bài B trong khi bài A
   đang đọc thì cả hai đọc chồng lên nhau, chói tai.

   Giữ tham chiếu tới luồng đang chạy ở cấp module. Mỗi lần bắt đầu đọc mới thì
   dừng luồng cũ trước. Nút nào bị dừng sẽ nhận onXong (qua dung()) nên tự cập
   nhật lại nhãn về "Nghe". */
let dangChay: DieuKhienDoc | null = null;

function dungLuongCu() {
  if (dangChay) {
    const cu = dangChay;
    dangChay = null;
    cu.dung();
  }
}

/**
 * Đọc to một đoạn văn bản bằng tiếng Việt.
 *
 * Tự chọn cách đọc: máy CÓ giọng Việt thì dùng Web Speech (nhanh, chạy cả khi
 * mất mạng); máy KHÔNG có giọng Việt thì phát âm thanh tiếng Việt từ mạng, để
 * không bị đọc chữ Việt bằng giọng tiếng Anh.
 *
 * @param text     nội dung cần đọc
 * @param onXong   gọi khi đọc hết hoặc bị dừng — để nút cập nhật trạng thái
 * @returns        đối tượng có hàm dung() để dừng giữa chừng
 */
export function docTiengViet(text: string, onXong?: () => void): DieuKhienDoc {
  /* Dừng luồng đọc đang chạy (nếu có) trước khi bắt đầu luồng mới — để bấm
     nghe bài khác thì bài đang nghe tắt ngay, không đọc chồng. */
  dungLuongCu();

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      const dkAudio = docBangAudio(text, onXong);
      dangChay = dkAudio;
      return dkAudio;
    }
    onXong?.();
    return { dung: () => {} };
  }

  const synth = window.speechSynthesis;
  synth.cancel(); // dừng đoạn đang đọc nếu có
  const cac = catCau(text);

  const chayWebSpeech = (giong?: SpeechSynthesisVoice): DieuKhienDoc => {
    let i = 0;
    let daDung = false;
    const docTiep = () => {
      if (daDung || i >= cac.length) { onXong?.(); return; }
      const u = new SpeechSynthesisUtterance(cac[i]);
      u.lang = 'vi-VN';   // báo cho trình duyệt đây là tiếng Việt dù không có giọng riêng
      u.rate = 0.95;   // chậm hơn chút cho người lớn tuổi dễ nghe
      u.pitch = 1;
      if (giong) u.voice = giong;
      u.onend = () => { i += 1; docTiep(); };
      u.onerror = () => { i += 1; docTiep(); };
      synth.speak(u);
    };
    docTiep();
    return { dung: () => { daDung = true; synth.cancel(); onXong?.(); } };
  };

  let dk: DieuKhienDoc = { dung: () => {} };
  const quyetDinh = () => {
    /* ƯU TIÊN MÁY CHỦ ĐỌC (giọng Google tiếng Việt, luôn chuẩn).

       Vì sao không ưu tiên giọng trên máy: nhiều máy có một giọng GẮN NHÃN
       'vi' nhưng chất lượng rất kém, hoặc trình duyệt báo có giọng Việt mà
       thật ra đọc chữ Việt bằng engine tiếng Anh — nghe như người nước ngoài
       đọc bập bẹ. Đó chính là lỗi "đọc thành tiếng Anh" hay gặp.

       Máy chủ đọc qua Google cho giọng Việt chuẩn bất kể máy người dùng có
       giọng gì. Chỉ khi máy chủ hỏng (chưa cấu hình backend, mất mạng, nguồn
       đọc chặn) mới lùi về Web Speech với giọng tốt nhất tìm được — đọc bằng
       giọng sẵn có còn hơn im lặng. */
    dk = docBangAudio(text, onXong, () => {
      /* Tới đây nghĩa là máy chủ đọc KHÔNG được — ghi log rõ để chẩn đoán.
         Mở DevTools (F12) -> Console sẽ thấy dòng này khi nút đọc ra tiếng
         Anh. Nguyên nhân thường gặp: VITE_API_URL trống hoặc sai, /api/tts
         trên máy chủ lỗi (nguồn đọc chặn IP máy chủ), hoặc mất mạng. */
      console.warn(
        '[đọc tiếng Việt] Máy chủ /api/tts không phản hồi — lùi về giọng trên máy. ' +
        'API_URL hiện tại:', API_URL || '(TRỐNG — chưa cấu hình VITE_API_URL)'
      );
      const giongViet = chonGiongViet();
      if (!giongViet) {
        console.warn(
          '[đọc tiếng Việt] Máy này KHÔNG có giọng tiếng Việt nào -> sẽ đọc bằng ' +
          'giọng mặc định (thường là tiếng Anh). Cần /api/tts hoạt động để đọc đúng.'
        );
      }
      dk = chayWebSpeech(giongViet);   // giongViet có thể undefined -> giọng mặc định
    });
  };

  /* Không cần chờ nạp danh sách giọng nữa: máy chủ đọc trước, chỉ khi máy chủ
     hỏng mới cần tới giọng trên máy — lúc đó danh sách thường đã nạp xong rồi. */
  quyetDinh();

  /* dk có thể được gán lại khi lùi về Web Speech, nên dung() phải gọi vào dk
     hiện tại tại thời điểm người dùng bấm dừng. */
  const dieuKhien: DieuKhienDoc = {
    dung: () => {
      if (dangChay === dieuKhien) dangChay = null;
      dk.dung();
    },
  };
  /* Đăng ký làm luồng đang chạy — lần docTiengViet sau sẽ gọi dung() vào đây
     trước khi bắt đầu, nên bài đang nghe tự tắt. */
  dangChay = dieuKhien;
  return dieuKhien;
}
