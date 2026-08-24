/**
 * NgheTinMoi — nút đọc to LẦN LƯỢT tiêu đề các tin đang hiện.
 *
 * VÌ SAO CẦN: người lớn tuổi mắt kém, người không quen đọc chữ, người vừa làm
 * việc nhà vừa muốn nắm tin — nghe như nghe đài. SpeakButton đã đọc TỪNG bài;
 * nút này đọc CẢ danh sách tiêu đề để nghe lướt qua có gì mới.
 *
 * Kỹ thuật: Web Speech API (speechSynthesis) — có sẵn, miễn phí, đọc tiếng Việt.
 * Đọc nối tiếp bằng cách chờ mỗi câu đọc xong (onend) rồi đọc câu sau.
 */
import { useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { docTiengViet, type DieuKhienDoc } from '../../utils/tiengNoi';

interface NgheTinMoiProps {
  /** Danh sách tiêu đề tin đang hiện, theo đúng thứ tự trên trang */
  tieuDe: string[];
}

export default function NgheTinMoi({ tieuDe }: NgheTinMoiProps) {
  const [supported, setSupported] = useState(false);
  const [dangDoc, setDangDoc] = useState(false);
  const dkRef = useRef<DieuKhienDoc | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => { dkRef.current?.dung(); };
  }, []);

  if (!supported || tieuDe.length === 0) return null;

  function dung() {
    dkRef.current?.dung();
    setDangDoc(false);
  }

  function batDau() {
    /* Ghép câu mở đầu + từng tiêu đề kèm số thứ tự + câu kết thành một đoạn.
       Tiện ích docTiengViet tự cắt theo câu và đọc nối tiếp, nên không cần tự
       quản vòng đọc ở đây nữa. */
    const doan = [
      `Có ${tieuDe.length} bản tin mới. Xin đọc lần lượt.`,
      ...tieuDe.map((t, i) => `Tin ${i + 1}. ${t}.`),
      'Đã hết các bản tin.',
    ].join('\n');

    setDangDoc(true);
    dkRef.current = docTiengViet(doan, () => setDangDoc(false));
  }

  return (
    <button
      type="button"
      onClick={dangDoc ? dung : batDau}
      aria-label={dangDoc ? 'Dừng nghe tin' : 'Nghe toàn bộ tin mới'}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
        dangDoc
          ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
          : 'bg-primary-600 text-white hover:bg-primary-700'
      }`}
    >
      {dangDoc ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      {dangDoc ? 'Dừng nghe' : 'Nghe toàn bộ tin mới'}
    </button>
  );
}
