/**
 * VoiceInput — nút MICRO: bấm để NÓI, hệ thống tự chuyển thành chữ.
 *
 * VÌ SAO CẦN: người lớn tuổi, người mắt kém, người ngại gõ phím trên điện
 * thoại. Bấm micro, đọc nội dung, chữ tự hiện ra.
 *
 * Kỹ thuật: Web Speech API — CÓ SẴN trong Chrome/Edge/Safari, MIỄN PHÍ.
 * Trình duyệt không hỗ trợ thì nút tự ẩn, không ảnh hưởng gì.
 *
 * ============================================================================
 * BỐN ĐIỂM NÂNG CẤP SO VỚI BẢN TRƯỚC
 * ============================================================================
 *
 * 1. CHỌN ĐƯỢC NGÔN NGỮ (Việt / Anh)
 *    Bản trước khoá cứng 'vi-VN'. Người nước ngoài sinh sống trên địa bàn
 *    bấm micro nói tiếng Anh sẽ ra một chuỗi tiếng Việt vô nghĩa, vì bộ nhận
 *    dạng cố ép âm tiếng Anh thành âm tiếng Việt.
 *
 * 2. HIỆN CHỮ NGAY TRONG LÚC NÓI (interim results)
 *    Bản trước chỉ lấy câu đã chốt, nên bà con nói xong cả câu dài mà màn
 *    hình vẫn trống — tưởng máy hỏng, bấm lung tung. Nay chữ chạy theo lời
 *    nói, thấy máy đang nghe thì yên tâm nói tiếp.
 *
 * 3. TỰ NGHE LẠI KHI BỊ NGẮT GIỮA CHỪNG
 *    Trình duyệt tự dừng nhận dạng sau vài giây im lặng. Bà con kể chuyện
 *    thường ngừng để nhớ lại, rồi nói tiếp — bản trước là mất, phải bấm lại.
 *    Nay tự nghe tiếp cho tới khi bà con chủ động bấm dừng.
 *
 * 4. BÁO LỖI CỤ THỂ THEO TỪNG NGUYÊN NHÂN
 *    Micro bị chặn, không có mạng, không nghe thấy gì — mỗi trường hợp một
 *    cách xử lý khác nhau, nói chung chung thì bà con không biết làm gì.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Languages } from 'lucide-react';

interface VoiceInputProps {
  /** Được gọi với đoạn chữ vừa nói xong — cha tự nối vào nội dung */
  onText: (text: string) => void;
  className?: string;
}

/* --------------------------------------------------------------------------
   CHUẨN HOÁ LỜI NÓI THÀNH VĂN BẢN ĐỌC ĐƯỢC

   Web Speech API với tiếng Việt KHÔNG tự chấm câu. Bà con kể một mạch năm
   phút thì ra một khối chữ liền không dấu chấm nào — cán bộ đọc rất mệt, mà
   bộ phân loại cũng khó tách ý.

   Nay nhận lệnh chấm câu bằng lời: bà con nói "chấm", "phẩy", "xuống dòng"
   thì hệ thống thay bằng dấu tương ứng. Đây là cách quen thuộc với người hay
   đọc chính tả.

   Cũng viết hoa chữ đầu câu — chỉ là hình thức, nhưng lá đơn gửi cơ quan nhà
   nước mà toàn chữ thường thì thiếu nghiêm túc.
   -------------------------------------------------------------------------- */
const LENH_DAU_CAU: [RegExp, string][] = [
  [/\s*\b(chấm hết|dấu chấm hết)\b\s*/gi, '. '],
  [/\s*\b(xuống dòng|sang dòng|dòng mới|new line|next line)\b\s*/gi, '\n'],
  [/\s*\b(dấu phẩy|phẩy)\b\s*/gi, ', '],
  /* CHỈ nhận "dấu chấm", KHÔNG nhận "chấm câu".
     "chấm câu" là danh từ thường gặp trong lời nói bình thường — câu
     "không có lệnh chấm câu nào ở đây" từng bị cắt thành "Không có lệnh. Nào
     ở đây". Lệnh giọng nói phải chọn cụm KHÔNG dùng được trong câu thường. */
  [/\s*\bdấu chấm\b\s*/gi, '. '],
  [/\s*\b(chấm hỏi|dấu chấm hỏi|question mark)\b\s*/gi, '? '],
  [/\s*\b(chấm than|dấu chấm than|exclamation mark)\b\s*/gi, '! '],
  [/\s*\b(dấu hai chấm|colon)\b\s*/gi, ': '],
  [/\s*\b(mở ngoặc|open bracket)\b\s*/gi, ' ('],
  [/\s*\b(đóng ngoặc|close bracket)\b\s*/gi, ') '],
  [/\s*\b(comma)\b\s*/gi, ', '],
  [/\s*\b(full stop|period)\b\s*/gi, '. '],
];

function chuanHoaLoiNoi(chu: string): string {
  let t = chu;
  for (const [tim, thay] of LENH_DAU_CAU) t = t.replace(tim, thay);

  /* Dọn khoảng trắng thừa quanh dấu câu */
  t = t
    .replace(/\s+([,.!?:])/g, '$1')
    .replace(/([,.!?:])(?=[^\s\n])/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s+/g, '\n');

  /* Viết hoa chữ đầu câu và sau mỗi dấu kết câu */
  t = t.replace(/(^|[.!?]\s+|\n)([a-zà-ỹ])/g, (_m, dau, ky) => dau + ky.toUpperCase());

  return t;
}

/* Web Speech API chưa có trong bộ kiểu chuẩn của TypeScript */
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{
      /* Chỉ mục số: bộ nhận dạng trả về nhiều phương án nghe (maxAlternatives).
         Có confidence để chọn phương án đáng tin nhất. */
      [i: number]: { transcript: string; confidence?: number };
      isFinal: boolean;
      length: number;
    }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onstart: (() => void) | null;
};

function taoBoNhanDang(): SpeechRec | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRec)
    | undefined;
  return Ctor ? new Ctor() : null;
}

type MaNgonNgu = 'vi-VN' | 'en-US';

const NGON_NGU: { ma: MaNgonNgu; ten: string; nhan: string }[] = [
  { ma: 'vi-VN', ten: 'Tiếng Việt', nhan: 'VI' },
  { ma: 'en-US', ten: 'English', nhan: 'EN' },
];

export default function VoiceInput({ onText, className }: VoiceInputProps) {
  const recRef = useRef<SpeechRec | null>(null);
  /** Cờ báo người dùng CHỦ ĐỘNG dừng — để phân biệt với trình duyệt tự ngắt */
  const nguoiDungDungRef = useRef(false);
  /** Giữ hàm onText mới nhất, tránh phải dựng lại bộ nhận dạng mỗi lần cha vẽ lại */
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const [hoTro, setHoTro] = useState(false);
  const [dangNghe, setDangNghe] = useState(false);
  const [ngonNgu, setNgonNgu] = useState<MaNgonNgu>('vi-VN');
  const [chuTam, setChuTam] = useState('');   // chữ đang nói dở, chưa chốt
  const [loi, setLoi] = useState('');

  /* Dựng lại bộ nhận dạng mỗi khi đổi ngôn ngữ.
     Không thể đổi thuộc tính lang khi đang chạy — phải tạo cái mới. */
  useEffect(() => {
    const rec = taoBoNhanDang();
    if (!rec) return;
    setHoTro(true);

    rec.lang = ngonNgu;
    rec.continuous = true;
    rec.interimResults = true;   // hiện chữ ngay trong lúc nói
    /* 3 phương án thay vì 1: bộ nhận dạng trả về nhiều cách nghe, ta chọn
       cái có độ tin cậy cao nhất. Tên riêng và địa danh hay bị nghe nhầm. */
    rec.maxAlternatives = 3;

    rec.onstart = () => setLoi('');

    rec.onresult = (e) => {
      let tam = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const chu = r[0].transcript;
        if (r.isFinal) {
          /* Lấy phương án có độ tin cậy cao nhất trong các phương án trả về.
             Trước đây chỉ lấy r[0]; với maxAlternatives = 3 thì chọn được
             bản nghe đúng hơn, nhất là với tên riêng và địa danh. */
          let tot = r[0];
          for (let k = 1; k < r.length; k += 1) {
            if ((r[k]?.confidence ?? 0) > (tot?.confidence ?? 0)) tot = r[k];
          }
          onTextRef.current(chuanHoaLoiNoi(tot.transcript).trim() + ' ');
        } else {
          tam += chu;
        }
      }
      setChuTam(tam);
    };

    rec.onend = () => {
      setChuTam('');
      /* Trình duyệt tự dừng sau vài giây im lặng. Nếu bà con CHƯA bấm dừng
         thì nghe tiếp — người kể chuyện hay ngừng giữa chừng để nhớ lại. */
      if (!nguoiDungDungRef.current) {
        try {
          rec.start();
          return;              // vẫn đang nghe, không đổi trạng thái nút
        } catch {
          /* start() lỗi (thường do gọi quá nhanh) -> coi như dừng hẳn */
        }
      }
      setDangNghe(false);
    };

    rec.onerror = (e) => {
      setChuTam('');
      /* 'no-speech' và 'aborted' là chuyện thường, không phải lỗi thật:
         im lặng vài giây, hoặc chính mình gọi stop(). Để onend xử lý. */
      if (e.error === 'no-speech' || e.error === 'aborted') return;

      nguoiDungDungRef.current = true;   // lỗi thật -> đừng tự nghe lại
      setDangNghe(false);

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setLoi('Trang web chưa được phép dùng micro. Bà con bấm biểu tượng ổ khoá cạnh ô địa chỉ rồi chọn "Cho phép micro".');
      } else if (e.error === 'audio-capture') {
        setLoi('Không tìm thấy micro. Bà con kiểm tra tai nghe hoặc micro của máy.');
      } else if (e.error === 'network') {
        setLoi('Mất kết nối mạng nên không nhận dạng được. Bà con kiểm tra lại mạng rồi thử tiếp.');
      } else {
        setLoi('Không nhận dạng được giọng nói. Bà con thử nói chậm và rõ hơn.');
      }
    };

    recRef.current = rec;
    return () => {
      nguoiDungDungRef.current = true;
      try { rec.abort(); } catch { /* bỏ qua */ }
      recRef.current = null;
    };
  }, [ngonNgu]);

  const batTat = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    setLoi('');
    if (dangNghe) {
      nguoiDungDungRef.current = true;
      try { rec.stop(); } catch { /* bỏ qua */ }
      setDangNghe(false);
    } else {
      nguoiDungDungRef.current = false;
      try {
        rec.start();
        setDangNghe(true);
      } catch {
        /* Gọi start() khi đang chạy sẽ ném lỗi — bỏ qua, coi như đang nghe */
        setDangNghe(true);
      }
    }
  }, [dangNghe]);

  /* Đổi ngôn ngữ: dừng hẳn rồi mới đổi, để useEffect dựng lại bộ nhận dạng */
  function doiNgonNgu(ma: MaNgonNgu) {
    if (ma === ngonNgu) return;
    nguoiDungDungRef.current = true;
    try { recRef.current?.abort(); } catch { /* bỏ qua */ }
    setDangNghe(false);
    setChuTam('');
    setNgonNgu(ma);
  }

  if (!hoTro) return null;

  const nn = NGON_NGU.find((x) => x.ma === ngonNgu)!;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={batTat}
          aria-label={dangNghe ? 'Dừng nói' : 'Nhập bằng giọng nói'}
          title={dangNghe ? 'Đang nghe — bấm để dừng' : 'Bấm rồi nói, chữ tự hiện ra'}
          className={`flex min-h-[44px] items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-bold transition ${
            dangNghe
              ? 'border-red-400 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
              : 'border-primary-200 bg-primary-50 text-primary-700 hover:border-primary-400 dark:border-slate-600 dark:bg-slate-800 dark:text-primary-300'
          }`}
        >
          {dangNghe ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
          {dangNghe ? 'Đang nghe — bấm để dừng' : 'Nói thay vì gõ'}
        </button>

        {/* Chọn ngôn ngữ. Ẩn trong lúc đang nghe để bà con không bấm nhầm
            làm mất đoạn đang nói dở. */}
        {!dangNghe && (
          <div
            className="flex items-center gap-1 rounded-xl border-2 border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-800"
            role="group"
            aria-label="Chọn ngôn ngữ nhận dạng giọng nói"
          >
            <Languages className="ml-1 h-3.5 w-3.5 text-slate-500" aria-hidden />
            {NGON_NGU.map((x) => (
              <button
                key={x.ma}
                type="button"
                onClick={() => doiNgonNgu(x.ma)}
                aria-pressed={x.ma === ngonNgu}
                title={`Nhận dạng ${x.ten}`}
                className={`min-h-[32px] rounded-lg px-2.5 text-xs font-bold transition ${
                  x.ma === ngonNgu
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {x.nhan}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chữ đang nói dở — cho bà con thấy máy đang nghe được */}
      {dangNghe && (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {chuTam || `Đang nghe ${nn.ten}… bà con cứ nói tự nhiên.`}
        </p>
      )}

      {loi && (
        <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
          {loi}
        </p>
      )}
    </div>
  );
}
