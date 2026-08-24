/**
 * CanhGiacLuaDao — dải cảnh báo lừa đảo mạo danh, đặt thường trực ở trang chủ.
 *
 * VÌ SAO CẦN: bà con vùng sâu chưa rành mạng là mục tiêu số một của lừa đảo
 * mạo danh công an. Kẻ xấu gọi điện, nhắn tin, dựng trang giả xưng là công an
 * để moi mật khẩu, mã OTP, số tài khoản. Dải này dạy đúng MỘT điều cốt lõi,
 * lặp đi lặp lại tới khi thành phản xạ: công an không bao giờ hỏi những thứ đó.
 *
 * Chữ to, màu nổi, có nút đọc to — để người mắt kém và người không quen đọc
 * chữ vẫn nắm được.
 */
import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Volume2, Square } from 'lucide-react';
import { docTiengViet, type DieuKhienDoc } from '../../utils/tiengNoi';

const LOI_CANH_GIAC =
  'Cảnh giác lừa đảo. Công an không bao giờ gọi điện hay nhắn tin yêu cầu bà con ' +
  'cung cấp mật khẩu, mã OTP, số tài khoản ngân hàng, hay chuyển tiền để chứng minh ' +
  'trong sạch. Ai làm vậy đều là kẻ lừa đảo. Bà con hãy tắt máy và báo ngay cho công an.';

export default function CanhGiacLuaDao() {
  const [dangDoc, setDangDoc] = useState(false);
  const [coLoa, setCoLoa] = useState(false);
  const dkRef = useRef<DieuKhienDoc | null>(null);

  useEffect(() => {
    setCoLoa(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => { dkRef.current?.dung(); };
  }, []);

  function doc() {
    if (dangDoc) { dkRef.current?.dung(); setDangDoc(false); return; }
    setDangDoc(true);
    dkRef.current = docTiengViet(LOI_CANH_GIAC, () => setDangDoc(false));
  }

  return (
    <section className="container-page pt-6" aria-label="Cảnh giác lừa đảo">
      <div className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 sm:p-5 dark:border-red-800 dark:bg-red-900/15">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-red-800 dark:text-red-300 sm:text-lg">
            Cảnh giác lừa đảo mạo danh công an
          </p>
          <p className="mt-1 text-sm leading-snug text-red-700 dark:text-red-200 sm:text-base">
            Công an <b>KHÔNG BAO GIỜ</b> gọi điện hay nhắn tin hỏi mật khẩu, mã OTP,
            số tài khoản, hay bắt chuyển tiền để "chứng minh trong sạch". Ai làm vậy
            là <b>kẻ lừa đảo</b> — bà con hãy tắt máy và báo ngay cho công an.
          </p>
        </div>
        {coLoa && (
          <button
            type="button"
            onClick={doc}
            aria-label={dangDoc ? 'Dừng đọc' : 'Nghe đọc cảnh báo'}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
              dangDoc
                ? 'bg-red-200 text-red-800 dark:bg-red-800/40 dark:text-red-200'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {dangDoc ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {dangDoc ? 'Dừng' : 'Nghe'}
          </button>
        )}
      </div>
    </section>
  );
}
