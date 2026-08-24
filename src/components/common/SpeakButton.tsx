/**
 * SpeakButton — nút LOA: đọc to một đoạn văn bản bằng giọng tiếng Việt.
 *
 * VÌ SAO CẦN: người khiếm thị, người lớn tuổi mắt kém, người không quen đọc
 * chữ trên màn hình. Bấm loa -> nghe nội dung.
 *
 * Việc đọc giao cho tiện ích chung utils/tiengNoi.ts — nơi xử lý giọng Việt
 * tải trễ, cắt câu dài để không bị ngắt, và chọn giọng Việt tốt nhất.
 */
import { useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { docTiengViet, type DieuKhienDoc } from '../../utils/tiengNoi';

interface SpeakButtonProps {
  text: string;
  className?: string;
  label?: string;
}

export default function SpeakButton({ text, className, label = 'Nghe đọc' }: SpeakButtonProps) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const dkRef = useRef<DieuKhienDoc | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => { dkRef.current?.dung(); };
  }, []);

  if (!supported) return null;

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (speaking) {
      dkRef.current?.dung();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    dkRef.current = docTiengViet(text, () => setSpeaking(false));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={speaking ? 'Dừng đọc' : `${label} nội dung`}
      title={speaking ? 'Dừng đọc' : label}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
        speaking
          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
          : 'bg-slate-100 text-slate-600 hover:bg-primary-100 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300'
      } ${className ?? ''}`}
    >
      {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      {speaking ? 'Dừng' : label}
    </button>
  );
}
