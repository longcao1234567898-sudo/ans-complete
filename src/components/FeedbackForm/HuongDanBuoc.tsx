/**
 * HuongDanBuoc — dải hướng dẫn từng bước bằng LỜI THƯỜNG NGÀY, kèm nút đọc to.
 *
 * VÌ SAO CẦN: thanh 5 bước (StepIndicator) chỉ hiện chấm tròn và số; nhãn chữ
 * lại bị ẩn trên điện thoại cho đỡ chật. Người lớn tuổi dùng điện thoại nhìn
 * mấy chấm tròn không biết đang ở đâu, phải làm gì.
 *
 * Dải này nói thẳng "Bước X trên 5" bằng chữ to, kèm một câu hướng dẫn việc
 * cần làm bằng lời thường ngày (không dùng từ hành chính), và nút loa đọc câu
 * đó thành tiếng cho người không đọc được chữ.
 *
 * Đọc to dùng Web Speech API có sẵn — cùng công nghệ với nút nghe tin và nhập
 * giọng nói, không thêm phụ thuộc gì.
 */
import { useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { docTiengViet, type DieuKhienDoc } from '../../utils/tiengNoi';

/* Câu hướng dẫn cho từng bước — viết như đang nói với bà con, không dùng từ
   chuyên môn. "Nội dung phản ánh" -> "báo chuyện gì". */
const HUONG_DAN: { ten: string; loi: string }[] = [
  { ten: 'Kể sự việc',
    loi: 'Bước 1 trên 5. Bà con kể xem muốn báo chuyện gì. Có thể bấm nút micro để nói thay vì gõ, và bấm nút chụp ảnh nếu có hình.' },
  { ten: 'Máy xem lại',
    loi: 'Bước 2 trên 5. Máy đọc lại lời bà con vừa kể và sắp xếp cho rõ ràng. Bà con xem có đúng ý không.' },
  { ten: 'Chọn loại việc',
    loi: 'Bước 3 trên 5. Chọn xem việc này thuộc loại nào. Máy đã gợi ý sẵn, nếu đúng thì bấm đi tiếp.' },
  { ten: 'Cách liên hệ',
    loi: 'Bước 4 trên 5. Bà con điền tên và số điện thoại, hoặc chọn gửi kín không cần cho tên. Không bắt buộc có email.' },
  { ten: 'Kiểm lại và gửi',
    loi: 'Bước 5 trên 5. Bà con đọc lại lần cuối rồi bấm gửi. Xong sẽ có một mã để tra cứu sau này.' },
];

export default function HuongDanBuoc({ buoc }: { buoc: number }) {
  const [supported, setSupported] = useState(false);
  const [dangDoc, setDangDoc] = useState(false);
  const dkRef = useRef<DieuKhienDoc | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => { dkRef.current?.dung(); };
  }, []);

  /* Dừng đọc khi chuyển bước — không để câu bước cũ đọc chồng lên bước mới. */
  useEffect(() => {
    dkRef.current?.dung();
    setDangDoc(false);
  }, [buoc]);

  const hd = HUONG_DAN[buoc - 1];
  if (!hd) return null;

  function doc() {
    if (dangDoc) { dkRef.current?.dung(); setDangDoc(false); return; }
    setDangDoc(true);
    dkRef.current = docTiengViet(hd.loi, () => setDangDoc(false));
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-primary-100 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-900/15">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-600 text-lg font-extrabold text-white">
        {buoc}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold leading-tight text-primary-800 dark:text-primary-200">
          Bước {buoc} trên 5 — {hd.ten}
        </p>
        <p className="mt-0.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
          {hd.loi.replace(/^Bước \d trên 5\. /, '')}
        </p>
      </div>
      {supported && (
        <button
          type="button"
          onClick={doc}
          aria-label={dangDoc ? 'Dừng đọc hướng dẫn' : 'Nghe đọc hướng dẫn bước này'}
          className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
            dangDoc
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {dangDoc ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {dangDoc ? 'Dừng' : 'Nghe'}
        </button>
      )}
    </div>
  );
}
