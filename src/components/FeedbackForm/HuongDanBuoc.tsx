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
import { AnimatePresence, motion } from 'framer-motion';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import type { KhoaChu } from '../../i18n/chu';
import { Volume2, Square } from 'lucide-react';
import { docTiengViet, type DieuKhienDoc } from '../../utils/tiengNoi';

/* Câu hướng dẫn cho từng bước — viết như đang nói với bà con, không dùng từ
   chuyên môn. "Nội dung phản ánh" -> "báo chuyện gì". */
/* Khoá tra bản dịch cho từng bước. Trước đây viết thẳng chữ tiếng Việt vào
   đây nên người nước ngoài đổi sang tiếng Anh vẫn nghe và đọc tiếng Việt. */
const HUONG_DAN: { khoaTen: KhoaChu; khoaLoi: KhoaChu }[] = [
  { khoaTen: 'send.step1', khoaLoi: 'f1.hint' },
  { khoaTen: 'send.step2', khoaLoi: 'f2.hint' },
  { khoaTen: 'send.step3', khoaLoi: 'f3.hint' },
  { khoaTen: 'send.step4', khoaLoi: 'f4.hint' },
  { khoaTen: 'send.step5', khoaLoi: 'f5.hint' },
];

export default function HuongDanBuoc({ buoc }: { buoc: number }) {
  const { t, ngonNgu } = useNgonNgu();
  const [supported, setSupported] = useState(false);
  const [dangDoc, setDangDoc] = useState(false);
  const dkRef = useRef<DieuKhienDoc | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => { dkRef.current?.dung(); };
  }, []);

  /* Dừng đọc khi chuyển bước hoặc đổi ngôn ngữ — không để câu cũ đọc chồng lên. */
  useEffect(() => {
    dkRef.current?.dung();
    setDangDoc(false);
  }, [buoc, ngonNgu]);

  const hd = HUONG_DAN[buoc - 1];
  if (!hd) return null;

  function doc() {
    if (dangDoc) { dkRef.current?.dung(); setDangDoc(false); return; }
    setDangDoc(true);
    /* Truyền ngôn ngữ đang chọn: thiếu nó thì người đã đổi sang tiếng Anh vẫn
       nghe giọng Việt đọc chữ Anh. */
    dkRef.current = docTiengViet(t(hd.khoaLoi), () => setDangDoc(false), ngonNgu);
  }

  const buocTruocRef = useRef(buoc);
  const huong = buoc >= buocTruocRef.current ? 1 : -1;
  useEffect(() => {
    buocTruocRef.current = buoc;
  }, [buoc]);

  return (
    <div className="mb-6 flex items-start gap-3 overflow-hidden rounded-2xl border-2 border-primary-100 bg-primary-50/75 p-4 shadow-soft transition-colors duration-200 dark:border-primary-900/40 dark:bg-primary-900/20">
      <div className="relative h-11 w-11 shrink-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={buoc}
            initial={{ opacity: 0, scale: 0.78 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.78 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-primary-500 text-lg font-extrabold text-white shadow-sm"
          >
            {buoc}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${buoc}-${ngonNgu}`}
            initial={{ opacity: 0, x: huong * 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: huong * -12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-base font-extrabold leading-tight text-primary-800 dark:text-primary-200">
              {t('f.stepOf').replace('{n}', String(buoc))} — {t(hd.khoaTen)}
            </p>
            <p className="mt-0.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
              {t(hd.khoaLoi).replace(/^Bước \d trên 5\. /, '')}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
      {supported && (
        <button
          type="button"
          onClick={doc}
          aria-label={dangDoc ? t('hd.stopRead') : t('hd.listenAgain')}
          className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-[transform,background-color,color,box-shadow] duration-150 active:scale-[0.97] ${
            dangDoc
              ? 'bg-red-100 text-red-700 shadow-sm dark:bg-red-900/30 dark:text-red-300'
              : 'bg-primary-600 text-white shadow-sm hover:bg-primary-700'
          }`}
        >
          {dangDoc ? (
            <>
              <span className="inline-flex h-3.5 items-end gap-[2px]" aria-hidden="true">
                <span className="hd-song-am h-full w-[2.5px] rounded-full bg-current" style={{ animationDelay: '0ms' }} />
                <span className="hd-song-am h-full w-[2.5px] rounded-full bg-current" style={{ animationDelay: '160ms' }} />
                <span className="hd-song-am h-full w-[2.5px] rounded-full bg-current" style={{ animationDelay: '320ms' }} />
              </span>
              <Square className="h-3.5 w-3.5" />
            </>
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
          {dangDoc ? t('hd.stopRead') : t('hd.listenAgain')}
        </button>
      )}
    </div>
  );
}
