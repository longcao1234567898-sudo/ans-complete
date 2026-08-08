/**
 * SpeakButton — nút LOA: đọc to một đoạn văn bản bằng giọng tiếng Việt.
 *
 * VÌ SAO CẦN: người khiếm thị, người lớn tuổi mắt kém, người không quen đọc
 * chữ trên màn hình. Bấm loa -> nghe nội dung.
 *
 * Kỹ thuật: Web Speech API (speechSynthesis) — CÓ SẴN mọi trình duyệt hiện đại,
 * MIỄN PHÍ. Ưu tiên giọng vi-VN nếu máy có.
 */
import { useEffect, useState } from 'react';
import { Volume2, Square } from 'lucide-react';

interface SpeakButtonProps {
  text: string;
  className?: string;
  label?: string;
}

export default function SpeakButton({ text, className, label = 'Nghe đọc' }: SpeakButtonProps) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      // Rời trang -> dừng đọc
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported) return null;

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const synth = window.speechSynthesis;

    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }

    synth.cancel(); // dừng đoạn đang đọc (nếu có)
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 0.95; // chậm hơn chút cho dễ nghe

    // Ưu tiên giọng tiếng Việt nếu máy có
    const viVoice = synth.getVoices().find((v) => v.lang.startsWith('vi'));
    if (viVoice) u.voice = viVoice;

    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
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
