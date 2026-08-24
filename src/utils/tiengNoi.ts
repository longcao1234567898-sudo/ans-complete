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

/**
 * Đọc to một đoạn văn bản bằng tiếng Việt.
 *
 * @param text     nội dung cần đọc
 * @param onXong   gọi khi đọc hết hoặc bị dừng — để nút cập nhật trạng thái
 * @returns        đối tượng có hàm dung() để dừng giữa chừng
 */
export function docTiengViet(text: string, onXong?: () => void): DieuKhienDoc {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onXong?.();
    return { dung: () => {} };
  }

  const synth = window.speechSynthesis;
  synth.cancel(); // dừng đoạn đang đọc nếu có

  const cac = catCau(text);
  const giong = chonGiongViet();
  let i = 0;
  let daDung = false;

  const docTiep = () => {
    if (daDung || i >= cac.length) { onXong?.(); return; }
    const u = new SpeechSynthesisUtterance(cac[i]);
    u.lang = 'vi-VN';
    u.rate = 0.95;        // chậm hơn chút cho người lớn tuổi dễ nghe
    u.pitch = 1;
    if (giong) u.voice = giong;
    u.onend = () => { i += 1; docTiep(); };
    u.onerror = () => { i += 1; docTiep(); };  // lỗi một câu thì bỏ qua, đọc tiếp
    synth.speak(u);
  };

  /* Nếu giọng chưa nạp kịp (cache rỗng), chờ một nhịp rồi mới đọc — cho sự
     kiện voiceschanged kịp chạy. Tránh đọc bằng giọng ngoại ở lần đầu. */
  if (!giong && cacheGiong.length === 0) {
    setTimeout(docTiep, 250);
  } else {
    docTiep();
  }

  return {
    dung: () => { daDung = true; synth.cancel(); onXong?.(); },
  };
}
